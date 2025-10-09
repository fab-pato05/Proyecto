// server.js
require('dotenv').config();  // Carga variables de entorno
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Tesseract = require("tesseract.js");
const canvas = require("canvas");
const faceapi = require("@vladmandic/face-api");
const cors = require("cors");  // Para CORS
const { Pool } = require("pg");

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const app = express();
const PORT = 3000;

// Carpeta uploads
const uploadsDir = "uploads";
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + "_" + file.fieldname + path.extname(file.originalname))
});
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype.startsWith('image/');
    if (mimetype && extname) cb(null, true);
    else cb(new Error("Solo se permiten imágenes"));
};
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

app.use(express.json());
app.use(cors());  // Habilita CORS para frontend en otros dominios
app.use(express.static("Views"));

// PostgreSQL con variables de entorno
const pool = new Pool({
    user: process.env.DB_USER || 'postgre',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'circulo_seguro',
    password: process.env.DB_PASSWORD || '1234',
    port: parseInt(process.env.DB_PORT) || 5432,
});

// Manejo de errores en el pool
pool.on('error', (err) => {
    console.error('Error inesperado en pool de DB:', err);
    process.exit(1);
});

// Guardar verificación en DB (con mejor manejo de errores)
async function guardarVerificacion(userId, duiText, score, match, liveness, edadValida, docPath, selfiePaths) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO verificacion
            (user_id, dui_text, score, match_result, liveness, edad_valida, documento_path, selfie_paths, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [userId, duiText, score, match, liveness, edadValida, docPath, JSON.stringify(selfiePaths)]
        );
        console.log(`✅ Verificación guardada para userId: ${userId}`);
    } catch (err) {
        console.error('Error guardando en DB:', err);
        throw err;  // Propaga el error para que el endpoint lo maneje
    } finally {
        client.release();
    }
}
//forzar uso nativo de JS puro 
process.env.TFJS_BACKEND = 'cpu';
const tf = require('@tensorflow/tfjs');
const faceapi = require('@vladmandic/face-api');


// Inicializar Face API (con try-catch)
async function initFaceApi() {
    try {
        await faceapi.nets.ssdMobilenetv1.loadFromDisk("./models");
        await faceapi.nets.faceRecognitionNet.loadFromDisk("./models");
        await faceapi.nets.faceLandmark68Net.loadFromDisk("./models");
        console.log("🤖 Modelos Face API cargados correctamente");
    } catch (err) {
        console.error("❌ Error cargando modelos Face API:", err);
        // No detengo el servidor, pero el procesamiento fallará si no hay modelos
    }
}
initFaceApi();

// Calcular edad
function calcularEdad(fechaNacimiento) {
    const hoy = new Date();
    const nacimiento = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
    return edad;
}

// Procesar verificación (con mejoras en chequeos)
async function procesarVerificacion(docPath, selfiePaths) {
    let isMatch = false, score = 0, liveness = false, detectionMsg = '', duiText = '', edadValida = false;  // Default false para edad
    let fechaExtraida = false;
    try {
        const { data: { text } } = await Tesseract.recognize(docPath, 'spa');
        duiText = text.trim();

        // Extraer fecha de nacimiento (regex flexible para DD/MM/YYYY)
        const regexFecha = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
        const matchFecha = duiText.match(regexFecha);
        if (matchFecha) {
            const dia = matchFecha[1].padStart(2, '0');
            const mes = matchFecha[2].padStart(2, '0');
            const año = matchFecha[3];
            const fechaNacimiento = `${año}-${mes}-${dia}`;
            const edad = calcularEdad(fechaNacimiento);
            edadValida = edad >= 18;
            fechaExtraida = true;
        }
        if (!fechaExtraida) {
            detectionMsg += "⚠️ No se pudo extraer fecha de nacimiento. ";
        }

        // Cargar imágenes
        const docImg = await canvas.loadImage(docPath);
        const selfieImgs = await Promise.all(selfiePaths.map(p => canvas.loadImage(p)));

        // Descriptor documento
        const docDetection = await faceapi.detectSingleFace(docImg).withFaceLandmarks().withFaceDescriptor();
        if (!docDetection) {
            detectionMsg += "❌ No se detectó rostro en DUI. ";
            return { isMatch, score, liveness, duiText, detectionMsg, edadValida };  // Early return si no hay rostro en doc
        }

        let totalDistance = 0;
        let selfDetectionCount = 0;
        for (const selfImg of selfieImgs) {
            const selfDetection = await faceapi.detectSingleFace(selfImg).withFaceLandmarks().withFaceDescriptor();
            if (!selfDetection) {
                detectionMsg += "❌ No se detectó rostro en una selfie. ";
            } else {
                totalDistance += faceapi.euclideanDistance(docDetection.descriptor, selfDetection.descriptor);
                selfDetectionCount++;
            }
        }

        if (selfDetectionCount === 0) {
            detectionMsg += "❌ No se detectaron rostros en selfies. ";
            return { isMatch, score, liveness, duiText, detectionMsg, edadValida };  // Early return
        }

        const avgDistance = totalDistance / selfDetectionCount;
        score = Math.max(0, 100 - avgDistance * 100);
        isMatch = score > 70 && edadValida;

        // Liveness básico (con chequeo de longitud)
        if (selfieImgs.length < 2) {
            liveness = false;
            detectionMsg += "⚠️ Liveness no evaluable (menos de 2 selfies). ";
        } else {
            let diffSum = 0;
            let validSelfiesForLiveness = 0;
            for (let i = 0; i < selfieImgs.length - 1; i++) {
                const desc1 = (await faceapi.detectSingleFace(selfieImgs[i]).withFaceLandmarks().withFaceDescriptor())?.descriptor;
                const desc2 = (await faceapi.detectSingleFace(selfieImgs[i + 1]).withFaceLandmarks().withFaceDescriptor())?.descriptor;
                if (desc1 && desc2) {
                    diffSum += faceapi.euclideanDistance(desc1, desc2);
                    validSelfiesForLiveness++;
                }
            }
            if (validSelfiesForLiveness > 0) {
                const avgDiff = diffSum / validSelfiesForLiveness;
                liveness = avgDiff > 0.05;
            } else {
                liveness = false;
            }
        }

        detectionMsg += `Similitud: ${score.toFixed(1)}%, Liveness: ${liveness ? 'Alta' : 'Baja'}, Edad válida: ${edadValida ? 'Sí' : 'No'}.`;

    } catch (err) {
        console.error('Error en procesamiento IA:', err);
        detectionMsg = "Error en procesamiento IA: " + err.message;
    }

    return { isMatch, score, liveness, duiText, detectionMsg, edadValida };
}

// Endpoint
app.post("/api/verify", upload.fields([
    { name: "documento", maxCount: 1 },
    { name: "selfie", maxCount: 3 }
]), async (req, res) => {
    let docPath, selfiePaths;  // Para cleanup en finally
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: "Falta userId en el body" });
        }

        const documento = req.files["documento"]?.[0];
        const selfies = req.files["selfie"] || [];
        if (!documento || selfies.length !== 3) {
            return res.status(400).json({ success: false, message: "Se requiere exactamente 1 documento y 3 selfies" });
        }

        docPath = path.join(uploadsDir, documento.filename);
        selfiePaths = selfies.map(s => path.join(uploadsDir, s.filename));

        const result = await procesarVerificacion(docPath, selfiePaths);

        // Guardar en DB
        await guardarVerificacion(
            parseInt(userId),  // Asegura que sea número
            result.duiText,
            result.score,
            result.isMatch,
            result.liveness,
            result.edadValida,
            documento.filename,
            selfies.map(s => s.filename)
        );

        res.json({ success: true, ...result, files: { documento: documento.filename, selfies: selfies.map(s => s.filename) } });

    } catch (err) {
        console.error('Error en endpoint /api/verify:', err);
        res.status(500).json({ success: false, message: err.message || 'Error interno del servidor' });
    } finally {
        // Siempre eliminar archivos temporales
        if (docPath && fs.existsSync(docPath)) fs.unlinkSync(docPath);
        if (selfiePaths) {
            selfiePaths.forEach(f => {
                if (fs.existsSync(f)) fs.unlinkSync(f);
            });
        }
    }
});

// Handler global de errores
app.use((err, req, res, next) => {
    console.error('Error no manejado:', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

app.listen(PORT, () => console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`));
