// server.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { RekognitionClient, CompareFacesCommand } from "@aws-sdk/client-rekognition";
import { createWorker } from "tesseract.js";
import { spawn } from "child_process";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import pkg from "pg";

const { Pool } = pkg;
dotenv.config();

const app = express();
const PORT = 3000;

// === Conexión PostgreSQL ===
const pool = new Pool({
    user: process.env.NEON_USER,
    host: process.env.NEON_HOST,
    database: process.env.NEON_DATABASE,
    password: process.env.NEON_PASSWORD,
    port: process.env.NEON_PORT,
    ssl: { rejectUnauthorized: false }
});

// Probar conexión al iniciar servidor
pool.connect()
    .then(client => {
        console.log("✅ Conexión a PostgreSQL OK");
        client.release();
    })
    .catch(err => console.error("❌ Error al conectar a PostgreSQL:", err));

// === Middlewares ===
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "Views")));
app.use("/models", express.static(path.join(process.cwd(), "models")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// === Multer para uploads ===
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(process.cwd(), "uploads");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// === AWS Rekognition ===
const rekClient = new RekognitionClient({ region: process.env.AWS_REGION });

// === Funciones auxiliares ===
async function extraerRostroDocumento(docPath) {
    const image = sharp(docPath);
    const metadata = await image.metadata();
    const width = Math.floor(metadata.width * 0.3);
    const height = Math.floor(metadata.height * 0.5);
    const left = Math.floor(metadata.width * 0.35);
    const top = Math.floor(metadata.height * 0.2);
    return await image.extract({ left, top, width, height }).toBuffer();
}

function extraerFrameVideo(videoPath) {
    return new Promise((resolve, reject) => {
        const tempPath = videoPath.replace('.webm', '.png');
        ffmpeg(videoPath)
            .screenshots({ timestamps: ['50%'], filename: path.basename(tempPath), folder: path.dirname(tempPath) })
            .on('end', () => {
                fs.readFile(tempPath, (err, data) => {
                    if (err) reject(err);
                    else {
                        fs.unlinkSync(tempPath);
                        resolve(data);
                    }
                });
            })
            .on('error', err => reject(err));
    });
}

// === Endpoints ===

// Página principal
app.get("/", (req, res) => res.sendFile(path.join(process.cwd(), "Views/Index.html")));

// Servir formulario de registro
app.get("/CrearCuenta.html", (req, res) => res.sendFile(path.join(process.cwd(), "Views/CrearCuenta.html")));

// Registrar usuario
app.post("/guardar-registerForm", async (req, res) => {
    try {
        const { nombres, apellidos, sexo, correo, celular, fechanacimiento, tipodocumento, numeroDocumento, contrasena } = req.body;

        const hashedPassword = await bcrypt.hash(contrasena, 10);

        const query = `
            INSERT INTO usuarios
            (nombres, apellidos, sexo, correo, celular, fechanacimiento, tipodocumento, numerodocumento, contrasena)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `;
        const values = [nombres, apellidos, sexo, correo, celular, fechanacimiento, tipodocumento, numeroDocumento, hashedPassword];

        await pool.query(query, values);
        res.status(200).json({ ok: true });

    } catch (error) {
        console.error("❌ Error al registrar usuario:", error);
        res.status(500).json({ ok: false, message: "Error al registrar usuario" });
    }
});

// Inicio de sesión
app.post("/login", async (req, res) => {
    try {
        const { correo, contrasena } = req.body;
        const resultado = await pool.query("SELECT * FROM usuarios WHERE correo = $1", [correo]);
        if (resultado.rows.length === 0) return res.status(404).send("❌ Usuario no encontrado");

        const usuario = resultado.rows[0];
        const passwordValida = await bcrypt.compare(contrasena, usuario.contrasena);

        if (passwordValida) res.send("✅ Inicio de sesión exitoso");
        else res.send("❌ Contraseña incorrecta");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error en el inicio de sesión");
    }
});

// Guardar cotización
import nodemailer from "nodemailer";

app.post("/guardar-cotizacionForm", async (req, res) => {
    try {
        const { id, monto_asegurar, cesion_beneficios, poliza } = req.body;

        // 1️⃣ Obtener datos del usuario desde la tabla 'usuarios'
        const usuarioRes = await pool.query("SELECT nombre, apellidos, correo, celular FROM usuarios WHERE id=$1", [id]);
        if (usuarioRes.rows.length === 0) {
            return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
        }

        const usuario = usuarioRes.rows[0];

        // 2️⃣ Guardar cotización
      const insertQuery = `
    INSERT INTO formulariocotizacion
    (id, nombre, primerapellido, segundoapellido, celular, correo, monto_asegurar, cesion_beneficios, poliza)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *;
`;

const values = [
    id,
    usuario.nombre,
    usuario.primerapellido,
    usuario.segundoApellido || "", // si no hay
    usuario.celular,
    usuario.correo,
    monto_asegurar,
    cesion_beneficios,
    poliza
];

const result = await pool.query(insertQuery, values);
console.log("Cotización guardada:", result.rows[0]);


        // 3️⃣ Enviar correo al usuario
        const transporter = nodemailer.createTransport({
            service: "gmail", // o tu proveedor
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: usuario.correo,
            subject: "Cotización Registrada",
            html: `
                <h2>Hola ${usuario.nombres},</h2>
                <p>Tu cotización ha sido registrada correctamente:</p>
                <ul>
                    <li>Monto a asegurar: $${monto_asegurar}</li>
                    <li>Cesión de beneficios: ${cesion_beneficios}</li>
                    <li>Póliza: ${poliza}</li>
                </ul>
            `
        });

        res.json({ ok: true, message: "Cotización guardada y correo enviado" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, message: "Error al guardar cotización o enviar correo" });
    }
});


// Guardar contratación
app.post("/guardar-contratacion", async (req, res) => {
    try {
        const { usuario_id, nombre_completo, correo, celular } = req.body;
        const usuarioExiste = await pool.query("SELECT * FROM usuarios WHERE id=$1", [usuario_id]);
        if (usuarioExiste.rows.length === 0) return res.send("❌ Usuario no existe");

        await pool.query(`
            INSERT INTO contrataciones (usuario_id,nombre_completo,correo,celular)
            VALUES($1,$2,$3,$4)
        `, [usuario_id, nombre_completo, correo, celular]);
        res.send("✅ Contratación registrada correctamente");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error al registrar contratación");
    }
});

// Verificación de identidad (OCR + AWS Rekognition)
app.post("/verificar-identidad", upload.fields([{ name: 'doc' }, { name: 'video' }]), async (req, res) => {
    try {
        if (!req.files['doc'] || req.files['doc'].length === 0) {
            return res.status(400).json({ exito: false, mensaje: "❌ Documento no enviado" });
        }

        const docPath = req.files['doc'][0].path;

        let ocrText = "";
        let shapExplanation = "Confianza baja (imagen no clara).";

        try {
            const worker = await createWorker('spa');
            const { data: { text } } = await worker.recognize(docPath);
            await worker.terminate();
            ocrText = text.trim();

            shapExplanation = await new Promise((resolve) => {
                const pythonProcess = spawn('python', ['shap_explain.py', ocrText]);
                let output = "";
                pythonProcess.stdout.on('data', (data) => output += data.toString());
                pythonProcess.on('close', (code) => {
                    if (code !== 0) resolve("Explicación no disponible.");
                    else resolve(output.trim());
                });
                pythonProcess.on('error', () => resolve("Explicación no disponible."));
            });

        } catch (err) {
            console.error("Error OCR con Tesseract/SHAP:", err);
            ocrText = "Texto no legible";
            shapExplanation = "Imagen no procesable.";
        }

        const docUrl = `/uploads/${req.files['doc'][0].filename}`;
        let rostroCoincide = false;

        if (req.files['video'] && req.files['video'][0]) {
            const videoPath = req.files['video'][0].path;
            const frameSelfie = await extraerFrameVideo(videoPath);
            const rostroDoc = await extraerRostroDocumento(docPath);

            try {
                const compareCmd = new CompareFacesCommand({
                    SourceImage: { Bytes: frameSelfie },
                    TargetImage: { Bytes: rostroDoc },
                    SimilarityThreshold: 85
                });
                const compareRes = await rekClient.send(compareCmd);
                rostroCoincide = compareRes.FaceMatches && compareRes.FaceMatches.length > 0;
            } catch (err) {
                console.error("Error comparación facial:", err);
            }
        }

        const ocrSummary = ocrText.length > 50 ? ocrText.substring(0, 50) + "..." : ocrText;

        if (req.files['video'] && req.files['video'][0]) {
            if (rostroCoincide) res.json({ exito: true, mensaje: "✅ Documento válido y rostro coincide", ocr_resumen: ocrSummary, explicacion_ia: shapExplanation, vista_previa: docUrl });
            else res.json({ exito: false, mensaje: "❌ Rostro no coincide con documento", ocr_resumen: ocrSummary, explicacion_ia: shapExplanation, vista_previa: docUrl });
        } else {
            res.json({ exito: true, mensaje: "✅ Documento recibido (sin verificación facial)", ocr_resumen: ocrSummary, explicacion_ia: shapExplanation, vista_previa: docUrl });
        }

    } catch (err) {
        console.error("Error endpoint verificación:", err);
        res.status(500).json({ exito: false, mensaje: "❌ Error durante la verificación" });
    }
});

// Iniciar servidor
app.listen(PORT, () => console.log(`🚀 Servidor activo en http://localhost:${PORT}`));



