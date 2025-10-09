// 🌿 Cargar variables de entorno (.env)
require("dotenv").config();

// ⚙️ Forzar TensorFlow JS en modo CPU (sin tfjs-node)
process.env.TFJS_BACKEND = "cpu";
process.env.TF_CPP_MIN_LOG_LEVEL = "2";
globalThis.tf = require("@tensorflow/tfjs");

// 🧠 Librerías principales
const faceapi = require("@vladmandic/face-api");
const canvas = require("canvas");
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Tesseract = require("tesseract.js");
const cors = require("cors");
const { Pool } = require("pg");

// 🚀 Configuración del servidor
const app = express();
const PORT = 3000;
app.use(express.json());
app.use(cors());
app.use(express.static("Views"));

// 📂 Carpeta de uploads
const uploadsDir = "uploads";
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// 📸 Configuración de Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) =>
        cb(null, Date.now() + "_" + file.fieldname + path.extname(file.originalname)),
});
const upload = multer({ storage });

// 🗄️ Conexión PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "circulo_seguro",
    password: process.env.DB_PASSWORD || "1234",
    port: parseInt(process.env.DB_PORT) || 5432,
});

pool.on("error", (err) => {
    console.error("Error inesperado en pool DB:", err);
    process.exit(1);
});

// 🤖 Inicializar modelos de Face API
async function initFaceApi() {
    try {
        await faceapi.nets.ssdMobilenetv1.loadFromDisk("./models");
        await faceapi.nets.faceRecognitionNet.loadFromDisk("./models");
        await faceapi.nets.faceLandmark68Net.loadFromDisk("./models");
        console.log("🤖 Modelos Face API cargados correctamente");
    } catch (err) {
        console.error("❌ Error cargando modelos Face API:", err);
    }
}
initFaceApi();

// 🧮 Calcular edad desde fecha
function calcularEdad(fechaNacimiento) {
    const hoy = new Date();
    const nacimiento = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
    return edad;
}

// 🔍 Procesar verificación facial + OCR
async function procesarVerificacion(docPath, selfiePaths) {
    let duiText = "", score = 0, isMatch = false, edadValida = false, detectionMsg = "";

    try {
        // 📖 Leer texto del DUI
        const { data: { text } } = await Tesseract.recognize(docPath, "spa");
        duiText = text.trim();

        // 📅 Extraer fecha y calcular edad
        const regexFecha = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
        const matchFecha = duiText.match(regexFecha);
        if (matchFecha) {
            const dia = matchFecha[1].padStart(2, "0");
            const mes = matchFecha[2].padStart(2, "0");
            const año = matchFecha[3];
            const fechaNacimiento = `${año}-${mes}-${dia}`;
            const edad = calcularEdad(fechaNacimiento);
            edadValida = edad >= 18;
        }

        // 🧠 Comparar rostro DUI vs Selfies
        const docImg = await canvas.loadImage(docPath);
        const selfieImgs = await Promise.all(selfiePaths.map(p => canvas.loadImage(p)));

        const docDetection = await faceapi
            .detectSingleFace(docImg)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!docDetection)
            return { success: false, message: "No se detectó rostro en DUI" };

        let totalDistance = 0, count = 0;
        for (const selfImg of selfieImgs) {
            const det = await faceapi
                .detectSingleFace(selfImg)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (det) {
                totalDistance += faceapi.euclideanDistance(
                    docDetection.descriptor,
                    det.descriptor
                );
                count++;
            }
        }

        if (count > 0) {
            const avgDist = totalDistance / count;
            score = Math.max(0, 100 - avgDist * 100);
            isMatch = score > 70 && edadValida;
        }

        detectionMsg = `Similitud: ${score.toFixed(1)}%, Edad válida: ${edadValida ? "Sí" : "No"
            }`;
    } catch (err) {
        detectionMsg = "Error en procesamiento IA: " + err.message;
    }

    return { duiText, score, isMatch, edadValida, detectionMsg };
}

// 📬 Endpoint de verificación
app.post(
    "/api/verify",
    upload.fields([
        { name: "documento", maxCount: 1 },
        { name: "selfie", maxCount: 3 },
    ]),
    async (req, res) => {
        let docPath, selfiePaths;
        try {
            const { userId } = req.body;
            const documento = req.files["documento"]?.[0];
            const selfies = req.files["selfie"] || [];

            if (!userId || !documento || selfies.length === 0)
                return res
                    .status(400)
                    .json({ success: false, message: "Faltan datos o imágenes" });

            docPath = path.join(uploadsDir, documento.filename);
            selfiePaths = selfies.map((s) => path.join(uploadsDir, s.filename));

            const result = await procesarVerificacion(docPath, selfiePaths);

            // 🗄️ Guardar en la base
            await pool.query(
                `INSERT INTO verificacion 
        (user_id, dui_text, score, match_result, edad_valida, documento_path, selfie_paths, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                [
                    parseInt(userId),
                    result.duiText,
                    result.score,
                    result.isMatch,
                    result.edadValida,
                    documento.filename,
                    JSON.stringify(selfies.map((s) => s.filename)),
                ]
            );

            res.json({
                success: true,
                message: "Verificación completada",
                ...result,
                files: {
                    documento: documento.filename,
                    selfies: selfies.map((s) => s.filename),
                },
            });
        } catch (err) {
            console.error("Error en /api/verify:", err);
            res.status(500).json({ success: false, message: err.message });
        } finally {
            // 🧹 Eliminar archivos temporales
            if (docPath && fs.existsSync(docPath)) fs.unlinkSync(docPath);
            if (selfiePaths)
                selfiePaths.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
        }
    }
);

// 🧱 Manejo global de errores
app.use((err, req, res, next) => {
    console.error("Error no manejado:", err);
    res.status(500).json({ success: false, message: "Error interno del servidor" });
});

// 🚀 Iniciar servidor
app.listen(PORT, () =>
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`)
);
