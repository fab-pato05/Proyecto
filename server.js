// ===== IMPORTS =====
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import cors from "cors";
import dotenv from "dotenv";
import sharp from "sharp";
import { RekognitionClient, CompareFacesCommand } from "@aws-sdk/client-rekognition";
import { createWorker } from "tesseract.js";
import { spawn } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import { createClient } from "redis";
import pkg from "pg";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcrypt";

const { Pool } = pkg;
dotenv.config();

// ===== CONFIG =====
const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(process.cwd(), "Views")));
const PORT = Number(process.env.PORT || 3000);

// === ENCRIPTACIÓN AES-256 ===
const ALGORITHM = "aes-256-cbc";
const KEY = process.env.ENCRYPTION_KEY ? Buffer.from(process.env.ENCRYPTION_KEY, "hex") : null;
if (!KEY || KEY.length !== 32) {
    console.warn("⚠️ ENCRYPTION_KEY no está configurada correctamente. Algunas funciones de encriptación fallarán si no se establece una key hex de 64 caracteres (32 bytes).\nContinuando en modo degradado.");
}

function encryptBuffer(buffer) {
    if (!KEY) throw new Error("ENCRYPTION_KEY no configurada");
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return { data: encrypted.toString("base64"), iv: iv.toString("hex") };
}

function decryptBuffer(base64Data, ivHex) {
    if (!KEY) throw new Error("ENCRYPTION_KEY no configurada");
    const iv = Buffer.from(ivHex, "hex");
    const encryptedBuffer = Buffer.from(base64Data, "base64");
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
}

// ===== Helmet + rate limit + middlewares =====
app.use(cors());
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "script-src": ["'self'", "https://cdn.tailwindcss.com", "https://unpkg.com"],
            "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            "img-src": ["'self'", "data:", "blob:"]
        }
    }
}));
app.set('trust proxy', 1);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
app.use(express.urlencoded({ extended: true }));

// ===== Static folders =====
app.use("/js", express.static(path.join(process.cwd(), "Views/Js")));
app.use("/img", express.static(path.join(process.cwd(), "Views/img")));
app.use("/css", express.static(path.join(process.cwd(), "Views/css")));
app.use("/models", express.static(path.join(process.cwd(), "models")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ===== CONEXIÓN A NEON (PostgreSQL) =====
const pool = new Pool({
    user: process.env.NEON_USER,
    host: process.env.NEON_HOST,
    database: process.env.NEON_DATABASE,
    password: process.env.NEON_PASSWORD,
    port: Number(process.env.NEON_PORT || 5432),
    ssl: {
        rejectUnauthorized: false,
    },
});

// Probar conexión al iniciar
pool.connect()
    .then(client => { client.release(); console.log("✅ Conexión a PostgreSQL OK"); })
    .catch(err => console.error("❌ Error al conectar a PostgreSQL:", err));

// ===== REDIS =====
const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500)
    }
});

redisClient.on("error", err => console.error("❌ Redis error:", err));
redisClient.on("connect", () => console.log("✅ Redis conectado"));
redisClient.on("ready", () => console.log("✅ Redis listo para usar"));

// Función async para conectar Redis
async function conectarRedis() {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
    } catch (err) {
        console.error("❌ Error conectando Redis:", err);
    }
}

// ===== AWS REKOGNITION (usando SDK v3 para consistencia) =====
const rekognitionClient = process.env.AWS_REGION ? new RekognitionClient({ region: process.env.AWS_REGION }) : null;

// Configurar ruta de ffprobe
ffmpeg.setFfprobePath("C:/ffmpeg/bin/ffprobe.exe");

// ===== MULTER - UPLOAD FILES =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(process.cwd(), "uploads");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '';
        cb(null, `${Date.now()}-${uuidv4()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 30 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'application/pdf', 'video/webm', 'video/mp4'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(null, false);
    }
});

// ===== NODEMAILER =====
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
} else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
}

// ===== UTILIDADES =====
function safeUnlink(p) {
    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
}
function nowISO() { return new Date().toISOString(); }

// ===== FUNCIONES DE PROCESAMIENTO =====

// PROCESAR DOCUMENTO (MEJORA IMAGEN)
async function procesarDocumento(entrada, salida) {
    try {
        await sharp(entrada)
            .rotate()
            .resize(1200)
            .normalize()
            .sharpen()
            .toFile(salida);
        return salida;
    } catch (error) {
        console.error("❌ Error procesando documento:", error);
        return entrada;
    }
}

// OCR PARA DOCUMENTO
async function realizarOCR(rutaImagen) {
    const worker = createWorker({ logger: m => console.log(m) });

  await worker.initialize('spa'); // Si es requerido, o depende de la versión
    const { data: { text } } = await worker.recognize(rutaImagen);
    await worker.terminate();
    return text;
}

// DETECCIÓN TIPO DE DOCUMENTO
function detectarTipoDocumento(texto) {
    texto = texto.toUpperCase();

    if (texto.includes("PASAPORTE")) return "PASAPORTE";
    if (texto.match(/[0-9]{8}-[0-9]{1}/)) return "DUI";
    return "DESCONOCIDO";
}

// COMPARACIÓN FACIAL AWS (usando SDK v3)
async function compararRostros(docPath, selfiePath) {
    if (!rekognitionClient) {
        console.warn("AWS Rekognition no configurado");
        return { ok: false, similarity: 0 };
    }

    const imgDoc = fs.readFileSync(docPath);
    const imgSelfie = fs.readFileSync(selfiePath);

    const command = new CompareFacesCommand({
        SourceImage: { Bytes: imgDoc },
        TargetImage: { Bytes: imgSelfie },
        SimilarityThreshold: 80
    });

    try {
        const result = await rekognitionClient.send(command);
        if (result.FaceMatches && result.FaceMatches.length > 0) {
            const similarity = result.FaceMatches[0].Similarity;
            return { ok: similarity >= 80, similarity };
        }
        return { ok: false, similarity: 0 };
    } catch (error) {
        console.error("Error en comparación facial:", error);
        return { ok: false, similarity: 0 };
    }
}

// COMPARAR VIDEOS
async function compararVideos(video1, video2) {
    try {
        ffmpeg.ffprobe(video1, (err, metadata) => {
            if (err) console.error("Error ffprobe:", err);
            else console.log("Metadata video1:", metadata);
        });

        const command = new CompareFacesCommand({
            SourceImage: { Bytes: fs.readFileSync(video1) },
            TargetImage: { Bytes: fs.readFileSync(video2) },
            SimilarityThreshold: 80
        });

        const response = await rekognitionClient.send(command);
        console.log("Resultado comparación facial:", response);
        return response;
    } catch (err) {
        console.error("Error comparación facial:", err);
        return null;
    }
}

// EXTRAER FRAME DE VIDEO
function extraerFrameVideo(videoPath) {
    return new Promise((resolve, reject) => {
        const tempPng = path.join(path.dirname(videoPath), `${uuidv4()}.png`);
        ffmpeg(videoPath)
            .screenshots({ timestamps: ['50%'], filename: path.basename(tempPng), folder: path.dirname(tempPng) })
            .on('end', () => {
                fs.readFile(tempPng, (err, data) => {
                    if (err) return reject(err);
                    safeUnlink(tempPng);
                    resolve(data);
                });
            })
            .on('error', (err) => {
                safeUnlink(tempPng);
                reject(err);
            });
    });
}

// EXTRAER ROSTRO DEL DOCUMENTO
async function extraerRostroDocumento(docPath) {
    const image = sharp(docPath);
    const metadata = await image.metadata();
    const width = Math.max(100, Math.floor((metadata.width || 400) * 0.3));
    const height = Math.max(100, Math.floor((metadata.height || 400) * 0.45));
    const left = Math.max(0, Math.floor((metadata.width || 400) * 0.35));
    const top = Math.max(0, Math.floor((metadata.height || 400) * 0.18));
    return await image.extract({ left, top, width, height }).toBuffer();
}

// VERIFICAR DOCUMENTO
async function verificarDocumento(imagenPath) {
    const worker = await createWorker();
    await worker.loadLanguage("spa");
    await worker.initialize("spa");
    const { data: { text } } = await worker.recognize(imagenPath);
    await worker.terminate();

    const texto = text.toLowerCase();
    const palabrasClave = ["dui", "pasaporte", "republica", "nombre"];

    return palabrasClave.some(p => texto.includes(p));
}

// GUARDAR VERIFICACIÓN
async function guardarVerificacion({
    user_id = null, ocrText = null, similarityScore = null, match_result = false,
    liveness = false, edad_valida = null, documento_path = null, selfie_paths = null,
    ip = null, dispositivo = null, acciones = null, resultado_general = null, notificado = false
}) {
    const q = `
        INSERT INTO verificacion_biometrica
        (user_id, dui_text, score, match_result, liveness, edad_valida, documento_path, selfie_paths, ip_usuario, dispositivo, resultado_general, notificado, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
        RETURNING id;
    `;
    const vals = [
        user_id, ocrText, similarityScore, match_result, liveness, edad_valida,
        documento_path, selfie_paths ? JSON.stringify(selfie_paths) : null,
        ip, dispositivo ? JSON.stringify(dispositivo) : null,
        resultado_general, notificado
    ];

    try {
        const r = await pool.query(q, vals);
        return r.rows[0].id;
    } catch (err) {
        console.error("Error guardando verificacion:", err);
        return null;
    }
}
// ===== RUTAS / ENDPOINTS =====

// Página principal
app.get('/', (req, res) => res.sendFile(path.join(process.cwd(), 'Views/Index.html')));

// GUARDAR REFERENCIA (del segundo código)
app.post("/guardar-referencia", async (req, res) => {
    try {
        const { usuario_id, imagen_base64 } = req.body;
        if (!usuario_id || !imagen_base64) {
            return res.json({ ok: false, mensaje: "Falta de datos" });
        }

        if (!redisClient.isReady) {
            return res.json({ ok: false, mensaje: "Servicio temporal no disponible" });
        }

        await redisClient.setEx(`REF:${usuario_id}`, 300, imagen_base64);
        return res.json({ ok: true, mensaje: "Rostro de referencia guardado temporalmente" });
    } catch (err) {
        console.error("Error guardando en Redis:", err);
        return res.status(500).json({ ok: false, mensaje: "Error al guardar referencia" });
    }
});

// REGISTRAR USUARIO
app.post('/guardar-registerForm', async (req, res) => {
    try {
        const { nombres, apellidos, sexo, correo, celular, fechanacimiento, tipodocumento, numeroDocumento, contrasena } = req.body;
        if (!correo || !contrasena) return res.status(400).json({ ok: false, message: 'correo y contraseña son requeridos' });
        const hashedPassword = await bcrypt.hash(contrasena, 10);
        const query = `
            INSERT INTO usuarios
            (nombres, apellidos, sexo, correo, celular, fechanacimiento, tipodocumento, numerodocumento, contrasena)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id;
        `;
        const values = [nombres, apellidos, sexo, correo, celular, fechanacimiento, tipodocumento, numeroDocumento, hashedPassword];
        const r = await pool.query(query, values);
        res.status(200).json({ ok: true, id: r.rows[0].id });
    } catch (error) {
        console.error("❌ Error al registrar usuario:", error);
        res.status(500).json({ ok: false, message: "Error al registrar usuario" });
    }
});

// INICIO DE SESIÓN
app.post('/login', async (req, res) => {
    try {
        const { correo, contrasena } = req.body;
        const resultado = await pool.query("SELECT * FROM usuarios WHERE correo = $1", [correo]);
        if (resultado.rows.length === 0) return res.status(404).send("❌ Usuario no encontrado");
        const usuario = resultado.rows[0];
        const passwordValida = await bcrypt.compare(contrasena, usuario.contrasena);
        if (passwordValida) {
            if (process.env.JWT_SECRET) {
                const token = jwt.sign({ id: usuario.id, correo: usuario.correo }, process.env.JWT_SECRET, { expiresIn: '2h' });
                return res.json({ ok: true, token, redirect: "/Views/cotizador.html" });
            }
            return res.send("/Views/cotizador.html");
        } else {
            return res.send("❌ Contraseña incorrecta");
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Error en el inicio de sesión");
    }
});

// GUARDAR COTIZACIÓN
app.post('/guardar-cotizacionForm', async (req, res) => {
    try {
        const { id, monto_asegurar, cesion_beneficios, poliza } = req.body;
        if (!id) return res.status(400).json({ ok: false, message: 'id de usuario requerido' });
        const usuarioRes = await pool.query("SELECT nombres, apellidos, correo, celular FROM usuarios WHERE id=$1", [id]);
        if (usuarioRes.rows.length === 0) return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
        const usuario = usuarioRes.rows[0];
        const insertQuery = `
            INSERT INTO formulariocotizacion
            (usuario_id, nombre, primerapellido, segundoapellido, celular, correo, monto_asegurar, cesion_beneficios, poliza)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *;
        `;
        const values = [id, usuario.nombres || '', usuario.apellidos || '', '', usuario.celular || '', usuario.correo || '', monto_asegurar, cesion_beneficios, poliza];
        const result = await pool.query(insertQuery, values);

        if (transporter) {
            await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.EMAIL_USER,
                to: usuario.correo,
                subject: 'Cotización Registrada',
                html: `<h2>Hola ${usuario.nombres || ''},</h2>
                    <p>Tu cotización ha sido registrada correctamente:</p>
                    <ul>
                        <li>Monto a asegurar: $${monto_asegurar}</li>
                        <li>Cesión de beneficios: ${cesion_beneficios}</li>
                        <li>Póliza: ${poliza}</li>
                    </ul>`
            });
        }

        res.json({ ok: true, message: 'Cotización guardada y correo enviado (si configurado)', data: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, message: 'Error al guardar cotización o enviar correo' });
    }
});


// Guardar contratación
app.post('/guardar-contratacion', async (req, res) => {
    try {
        const { usuario_id, nombre_completo, correo, celular } = req.body;
        const usuarioExiste = await pool.query('SELECT * FROM usuarios WHERE id=$1', [usuario_id]);
        if (usuarioExiste.rows.length === 0) return res.send('❌ Usuario no existe');
        await pool.query(`INSERT INTO contrataciones (
            usuario_id,
            nombre_completo,
            correo,celular) 
            VALUES($1,$2,$3,$4)`, 
            [usuario_id, nombre_completo, correo, celular]);
        res.send('✅ Contratación registrada correctamente');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al registrar contratación');
    }
});

// Endpoint verificación de identidad (OCR + opcional comparación facial con Rekognition) - CORREGIDO
app.post('/verificar-identidad', upload.fields([{ name: 'doc' }, { name: 'video' }]), async (req, res) => {
    let tmpFilesToRemove = [];
    let tipoDocumentoDetectado = "Desconocido"; // ✅ MOVIDO AQUÍ
    
    try {
        if (!req.files || !req.files['doc'] || req.files['doc'].length === 0) {
            return res.status(400).json({ exito: false, mensaje: 'Documento no enviado' });
        }
        
        const docFile = req.files['doc'][0];
        const docPath = docFile.path;
        tmpFilesToRemove.push(docPath);

        // Encriptar documento si KEY disponible
        let encryptedDoc = null;
        try {
            const docBuffer = fs.readFileSync(docPath);
            if (KEY) encryptedDoc = encryptBuffer(docBuffer);
        } catch (e) { console.warn('No se pudo encriptar doc:', e); }

        // OCR con Tesseract

        let ocrText = '';
        let shapExplanation = 'Explicación no disponible';
        try {
            const worker = await createWorker();
            await worker.load();
            await worker.loadLanguage('spa');
            await worker.initialize('spa');
            const { data: { text } } = await worker.recognize(docPath);
            await worker.terminate();
            ocrText = (text || '').trim();
            
            // ✅ Verificar si el documento parece un DUI o pasaporte
            try {
                const textoMinus = ocrText.toLowerCase(); 
                if (textoMinus.includes("dui") && textoMinus.includes("identidad") && textoMinus.includes("el salvador")) {
                    tipoDocumentoDetectado = "DUI"; 
                } else if (textoMinus.includes("pasaporte") && textoMinus.includes("passport")) {
                    tipoDocumentoDetectado = "Pasaporte"; 
                } else {
                    tipoDocumentoDetectado = "Foto no válida (no es un documento oficial)"; 
                }
            } catch (e) { 
                console.warn("Error analizando tipo de documento:", e); 
            }
            
            // ✅ VALIDACIÓN MOVIDA AQUÍ (donde 'res' existe)
            if (tipoDocumentoDetectado === "Foto no válida (no es un documento oficial)") {
                tmpFilesToRemove.forEach(p => safeUnlink(p));
                return res.json({
                    exito: false,
                    mensaje: "El archivo subido no parece un documento oficial (DUI o pasaporte).",
                    tipo_documento: tipoDocumentoDetectado,
                    vista_previa: `/uploads/${path.basename(docPath)}`
                });
            }
            async function realizarOCR(rutaImagen) {
    const worker = createWorker({
        logger: m => console.log(m) // opcional: ver progreso
    });

    try {
        // Inicializa solo el idioma (no usar load ni loadLanguage)
        await worker.load();
        await worker.loadLanguage('eng'); // solo si tu versión lo requiere
        await worker.initialize('eng');

        const { data: { text } } = await worker.recognize(rutaImagen);
        console.log("Texto reconocido:", text);
        return text;
    } catch (err) {
        console.error("OCR/SHAP error:", err);
    } finally {
        await worker.terminate();
    }
}

            // ejecutar SHAP en python si existe
            const tmpOcrPath = path.join(process.cwd(), `tmp_ocr_${uuidv4()}.txt`);
            fs.writeFileSync(tmpOcrPath, ocrText, 'utf8');
            tmpFilesToRemove.push(tmpOcrPath);
            shapExplanation = await new Promise((resolve) => {
                const py = spawn('python', ['shap_explain.py', tmpOcrPath], { cwd: process.cwd() });
                let out = '';
                py.stdout.on('data', d => out += d.toString());
                py.stderr.on('data', d => console.error('shap stderr:', d.toString()));
                py.on('close', code => { 
                    try { safeUnlink(tmpOcrPath); } catch (e) { } 
                    if (code !== 0) return resolve('Explicación no disponible.'); 
                    resolve(out.trim() || 'Explicación vacía.'); 
                });
                py.on('error', () => { 
                    try { safeUnlink(tmpOcrPath); } catch (e) { } 
                    resolve('Explicación no disponible.'); 
                });
            });
        } catch (err) {
            console.error('OCR/SHAP error:', err);
            ocrText = 'Texto no legible';
            shapExplanation = 'Imagen no procesable';
        }

        const docUrl = `/uploads/${path.basename(docPath)}`;
        let rostroCoincide = false;
        let similarityScore = null;
        let encryptedSelfies = null;

        if (req.files['video'] && req.files['video'][0]) {
            const videoPath = req.files['video'][0].path;
            tmpFilesToRemove.push(videoPath);
            try {
                const frameBuf = await extraerFrameVideo(videoPath);
                const rostroDoc = await extraerRostroDocumento(docPath);
                if (rekClient) {
                    const compareCmd = new CompareFacesCommand({
                        SourceImage: { Bytes: frameBuf },
                        TargetImage: { Bytes: rostroDoc },
                        SimilarityThreshold: Number(process.env.SIMILARITY_THRESHOLD || 80)
                    });
                    const compareRes = await rekClient.send(compareCmd);
                    if (compareRes.FaceMatches && compareRes.FaceMatches.length > 0) {
                        rostroCoincide = true;
                        similarityScore = compareRes.FaceMatches[0].Similarity || null;
                    } else {
                        rostroCoincide = false;
                        similarityScore = 0;
                    }
                } else {
                    console.warn('AWS Rekognition no configurado; se omite comparación facial');
                }

                // encriptar video si KEY disponible
                try {
                    const videoBuffer = fs.readFileSync(videoPath);
                    if (KEY) {
                        const encVideo = encryptBuffer(videoBuffer);
                        encryptedSelfies = [{ data: encVideo.data, iv: encVideo.iv }];
                    }
                } catch (e) { console.warn('No se pudo encriptar video:', e); }
            } catch (err) {
                console.error('Error comparación facial:', err);
            }
        }

        // parsear acciones y dispositivo
        let acciones = null;
        try { acciones = req.body.acciones ? JSON.parse(req.body.acciones) : null; } catch (e) { acciones = null; }
        const dispositivo = req.body.device ? JSON.parse(req.body.device) : (req.headers['user-agent'] || null);
        const user_id = req.body.user_id ? Number(req.body.user_id) : null;
        const liveness = req.body.liveness === 'true' ? true : (req.body.liveness === 'false' ? false : null);
        const edad_valida = null;

        const resultado_general = req.files['video'] && req.files['video'][0]
            ? (rostroCoincide ? 'Éxito: rostro coincide' : 'Fallo: rostro no coincide')
            : 'Documento recibido (sin verificación facial)';

        // Guardar verificación en DB SOLO SI ES EXITOSA
        if (rostroCoincide || !req.files['video']) {
            const verifId = await guardarVerificacion({
                user_id,
                ocrText,
                similarityScore,
                match_result: rostroCoincide,
                liveness: liveness === true,
                edad_valida,
                documento_path: encryptedDoc ? JSON.stringify({ data: encryptedDoc.data, iv: encryptedDoc.iv }) : null,
                selfie_paths: encryptedSelfies,
                ip: req.ip || req.connection.remoteAddress,
                dispositivo,
                acciones,
                resultado_general,
                notificado: false
            });

            // Enviar notificación por correo
            try {
                let userEmail = null;
                if (user_id) {
                    const r = await pool.query('SELECT correo FROM usuarios WHERE id = $1', [user_id]);
                    if (r.rows.length) userEmail = r.rows[0].correo;
                }
                if (!userEmail && req.body.user_email) userEmail = req.body.user_email;
                if (userEmail && verifId && rostroCoincide && transporter) {
                    await transporter.sendMail({ 
                        from: process.env.SMTP_FROM || process.env.EMAIL_USER, 
                        to: userEmail, 
                        subject: 'Resultado de verificación', 
                        text: `Su verificación fue exitosa. Similaridad: ${similarityScore || 'N/A'}. Fecha: ${nowISO()}` 
                    });
                    await pool.query('UPDATE verificacion_biometrica SET notificado = true WHERE id = $1', [verifId]);
                }
            } catch (err) { console.error('Error enviando notificacion:', err); }
        }

        const ocrSummary = ocrText.length > 150 ? ocrText.substring(0, 150) + '...' : ocrText;
        
        if (req.files['video'] && req.files['video'][0]) {
            if (rostroCoincide) {
                return res.json({ 
                    exito: true, 
                    mensaje: 'Documento válido y rostro coincide', 
                    tipo_documento: tipoDocumentoDetectado,
                    ocr_resumen: ocrSummary, 
                    explicacion_ia: shapExplanation, 
                    vista_previa: docUrl, 
                    similarityScore 
                });
            } else {
                return res.json({ 
                    exito: false, 
                    mensaje: 'Rostro no coincide con documento', 
                    tipo_documento: tipoDocumentoDetectado,
                    ocr_resumen: ocrSummary, 
                    explicacion_ia: shapExplanation, 
                    vista_previa: docUrl, 
                    similarityScore 
                });
            }
        } else {
            return res.json({ 
                exito: true, 
                mensaje: 'Documento recibido (sin verificación facial)', 
                tipo_documento: tipoDocumentoDetectado, 
                ocr_resumen: ocrSummary, 
                explicacion_ia: shapExplanation, 
                vista_previa: docUrl 
            });
        }

    } catch (err) {
        console.error('Error endpoint verificar-identidad:', err);
        res.status(500).json({ exito: false, mensaje: 'Error durante la verificación' });
    } finally {
        try { tmpFilesToRemove.forEach(p => safeUnlink(p)); } catch (e) { }
    }
});

// Admin: listar verificaciones
function checkAdmin(req, res, next) {
    const header = req.headers['x-admin-token'] || req.headers.authorization;
    if (header && (header === process.env.ADMIN_TOKEN || (header.startsWith('Bearer ') && header.slice(7) === process.env.ADMIN_TOKEN))) return next();
    return res.status(403).json({ ok: false, message: 'No autorizado' });
}

app.get('/admin/verificaciones', checkAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT v.*, u.nombres, u.apellidos, u.correo 
            FROM verificacion_biometrica v 
            LEFT JOIN usuarios u ON u.id = v.user_id 
            ORDER BY v.created_at DESC LIMIT 500;
        `);
        res.json(rows);
    } catch (err) { 
        console.error(err); 
        res.status(500).json({ ok: false }); 
    }
});

// ✅ INICIAR SERVIDOR CON REDIS
async function iniciarServidor() {
    try {
        // Conectar Redis primero
        await conectarRedis();
        
        // Luego iniciar servidor Express
        app.listen(PORT, () => {
            console.log(`🚀 Servidor activo en http://localhost:${PORT}`);
            console.log(`✅ PostgreSQL: Conectado`);
            console.log(`✅ Redis: ${redisClient.isReady ? 'Conectado' : 'Desconectado (continuando sin caché)'}`);
        });
    } catch (err) {
        console.error("❌ Error al iniciar servidor:", err);
        process.exit(1);
    }
}

// Manejar cierre graceful
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando conexiones...');
    try {
        await pool.end();
        if (redisClient.isOpen) await redisClient.quit();
        console.log('✅ Conexiones cerradas correctamente');
        process.exit(0);
    } catch (err) {
        console.error('Error al cerrar:', err);
        process.exit(1);
    }
});

// Iniciar
iniciarServidor();
