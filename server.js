//Server.js 
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { RekognitionClient, CompareFacesCommand } from "@aws-sdk/client-rekognition";
import { createWorker } from "tesseract.js"; // Nuevo: Para OCR robusto
import { spawn } from "child_process"; // Nuevo: Para llamar SHAP en Python
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import pkg from "pg";

const { Pool } = pkg;

dotenv.config();
const app = express();
const PORT = 3000;


// === Conexión PostgreSQL Neon ===
const pool = new Pool({
    user: process.env.NEON_USER,
    host: process.env.NEON_HOST,
    database: process.env.NEON_DATABASE,
    password: process.env.NEON_PASSWORD,
    port: process.env.NEON_PORT,
    ssl: { rejectUnauthorized: false }
});
// === PRUEBA DE CONEXIÓN ===
pool.query("SELECT NOW()")
  .then(res => console.log("Conexión correcta a la DB:", res.rows))
  .catch(err => console.error("Error conexión a la DB:", err));

// === Middlewares ===
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "Views")));
app.use("/models", express.static(path.join(process.cwd(), "models")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads"))); // ✅ agregado para servir uploads

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

// Extraer rostro del documento
async function extraerRostroDocumento(docPath) {
    const image = sharp(docPath);
    const metadata = await image.metadata();
    const width = Math.floor(metadata.width * 0.3);
    const height = Math.floor(metadata.height * 0.5);
    const left = Math.floor(metadata.width * 0.35);
    const top = Math.floor(metadata.height * 0.2);
    return await image.extract({ left, top, width, height }).toBuffer();
}

// Extraer frame del video selfie
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
// Verificación completa (OCR con Tesseract + SHAP + Reconocimiento facial)
app.post("/verificar-identidad", upload.fields([{ name: 'doc' }, { name: 'video' }]), async (req, res) => {
    try {
        // Rev;isar si llegó el documento
        if (!req.files['doc'] || req.files['doc'].length === 0) {
            return res.status(400).json({ exito: false, mensaje: "❌ Documento no enviado" });
        }

        const docPath = req.files['doc'][0].path;  // Aquí se define docPath

        // 1️⃣ OCR con Tesseract + SHAP (IA con explicabilidad)
        let ocrText = "";
        let shapExplanation = "Confianza baja (imagen no clara).";
        try {
            // ✅ Corrección OCR con Tesseract (versión moderna)
            const worker = await createWorker('spa');
            const { data: { text } } = await worker.recognize(docPath);
            await worker.terminate();
            ocrText = text.trim();


            // Esperar al proceso Python
            shapExplanation = await new Promise((resolve, reject) => {
                const pythonProcess = spawn('python', ['shap_explain.py', ocrText]);
                let output = "";
                pythonProcess.stdout.on('data', (data) => {
                    output += data.toString();
                });
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

        // Generar vista previa (URL del archivo subido)
        const docUrl = `/uploads/${req.files['doc'][0].filename}`;

        // Revisar si llegó selfie/video
        let rostroCoincide = false;
        if (req.files['video'] && req.files['video'][0]) {
            const videoPath = req.files['video'][0].path;

            // Extraer frame del video
            const frameSelfie = await extraerFrameVideo(videoPath);

            // Extraer rostro del documento
            const rostroDoc = await extraerRostroDocumento(docPath);

            // Comparación facial con AWS Rekognition
            try {
                const compareCmd = new CompareFacesCommand({
                    SourceImage: { Bytes: frameSelfie },
                    TargetImage: { Bytes: rostroDoc },
                    SimilarityThreshold: 85
                });
                const compareRes = await rekClient.send(compareCmd);
                // ✅ Corrección: validar FaceMatches
                rostroCoincide = compareRes.FaceMatches && compareRes.FaceMatches.length > 0;
            } catch (err) {
                console.error("Error comparación facial:", err);
            }
        }

        // Construir respuesta (truncar OCR para mensaje corto)
        const ocrSummary = ocrText.length > 50 ? ocrText.substring(0, 50) + "..." : ocrText;
        if (req.files['video'] && req.files['video'][0]) {
            // Documento + video
            if (rostroCoincide) {
                res.json({ exito: true, mensaje: "✅ Documento válido y rostro coincide", ocr_resumen: ocrSummary, explicacion_ia: shapExplanation, vista_previa: docUrl });
            } else {
                res.json({ exito: false, mensaje: "❌ Rostro no coincide con documento", ocr_resumen: ocrSummary, explicacion_ia: shapExplanation, vista_previa: docUrl });
            }
        } else {
            // Solo documento
            res.json({ exito: true, mensaje: "✅ Documento recibido (sin verificación facial)", ocr_resumen: ocrSummary, explicacion_ia: shapExplanation, vista_previa: docUrl });
        }
    } catch (err) {
        console.error("Error endpoint verificación:", err);
        res.status(500).json({ exito: false, mensaje: "❌ Error durante la verificación" });
    }
});

// Registro usuario
app.post("/guardar-registerForm", async (req, res) => {
    try {
        const { nombres, apellidos, sexo, correo, celular, fechaNacimiento, tipoDocumento, numeroDocumento, contrasena } = req.body;
        const hashedPassword = await bcrypt.hash(contrasena, 10);

        const query = `
            INSERT INTO usuarios
            (nombres, apellidos, sexo, correo, celular, fechaNacimiento, tipoDocumento, numeroDocumento, contrasena)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `;
        const values = [nombres, apellidos, sexo, correo, celular, fechaNacimiento, tipoDocumento, numeroDocumento, hashedPassword];
        await pool.query(query, values);
        res.status(200).json({ ok: true });
    } catch (error) {
        console.error(error);
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

        if (passwordValida) {
            res.send("✅ Inicio de sesión exitoso");
        } else {
            res.send("❌ Contraseña incorrecta");
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Error en el inicio de sesión");
    }
});

//Guardar cortizacion
app.post("/guardar-cotizacionForm", async (req, res) => {
    try {
        console.log("Datos recibidos:", req.body);

        // Ajustar nombres según el HTML
        const { 
            nombres,
            primerApellido,
            segundoApellido,
            celular,
            correo,
            monto,
            cesion,
            tipoPoliza
        } = req.body;

        // Validar que los campos obligatorios no estén vacíos
        if (!nombres || !primerApellido || !celular || !correo || !monto || !cesion || !tipoPoliza) {
            return res.status(400).send("❌ Faltan datos obligatorios");
        }
         // Convertir monto a número
         const monto_asegurar = parseFloat(req.body.monto_asegurar);

        // Generar código único
        const codigoUnico = Math.random().toString(36).substring(2,10).toUpperCase();

        // Guardar en la base de datos
        const resultado = await pool.query(`
            INSERT INTO formulariocotizacion
            (nombre, primerapellido, segundoapellido, celular, correo, monto_asegurar, cesion_beneficios, poliza, codigo_unico)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING id;
        `, [nombres, primerApellido, segundoApellido, celular, correo, monto, tipoPoliza, codigo_unico]);

        const idOrden = resultado.rows[0].id;

        console.log("Cotización guardada con ID:", idOrden);

        // Enviar correo
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail({
            from: `"Cotización Seguros" <${process.env.EMAIL_USER}>`,
            to: correo,
            subject: "Tu código de cotización",
            html: `<h2>Gracias por tu cotización</h2>
                   <p>Hola <b>${nombres}</b>, hemos recibido tu solicitud.</p>
                   <p>Tu número de orden es: <b>${idOrden}</b></p>
                   <p>Tu código único para crear tu cuenta es: <b style="color:green">${codigoUnico}</b></p>
                   <p>Este código será válido durante las próximas 24 horas.</p>
                   <br>
                   <a href="http://localhost:3000" style="background:#22c55e; color:white; padding:10px 15px; border-radius:8px; text-decoration:none;">Ir al inicio</a>`
        });

        // Enviar respuesta al frontend
        res.send(`✅ Cotización guardada y correo enviado a ${correo}. Tu código es: ${codigoUnico}`);

    } catch (err) {
        console.error("Error al guardar cotización:", err);
        res.status(500).send("❌ Error al guardar cotización");
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

// Página principal
app.get("/", (req, res) => {
    res.sendFile(path.join(process.cwd(), "Views/Index.html"));
});

// Iniciar servidor
app.listen(PORT, () => console.log(`🚀 Servidor activo en http://localhost:${PORT}`));
