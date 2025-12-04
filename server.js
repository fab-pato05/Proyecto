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
// ===== SENDGRID - NOTIFICACIONES =====
import sgMail from "@sendgrid/mail";

const { Pool } = pkg;
dotenv.config();

// ===== CONFIG =====
const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "Views")));
const PORT = Number(process.env.PORT || 3000);

app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
}));

// ===== Helmet + rate limit + middlewares =====
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


// ===== Static folders =====
app.use("/js", express.static(path.join(process.cwd(), "Views/Js")));
app.use("/img", express.static(path.join(process.cwd(), "Views/img")));
app.use("/css", express.static(path.join(process.cwd(), "Views/css")));
app.use("/models", express.static(path.join(process.cwd(), "models")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

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
        tls: true,
        keepAlive: 10000, //Mantiene la conecion viva
        reconnectStrategy: retries => Math.min(retries * 100, 3000)
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
const rekognitionClient = process.env.AWS_REGION ? 
                    new RekognitionClient({ region: process.env.AWS_REGION }) : null;

// Configuración de ffprobe/ffmpeg [cite: 268]
const localFFprobeFolder = process.env.FFMPEG_BIN_PATH || 'C:/Users/marjorie.guzman/Downloads/ffmpeg/ffmpeg-8.0-essentials_build/bin'; // Se usa una variable de entorno o el path local.
process.env.FFPROBE_PATH = path.join(localFFprobeFolder, "ffprobe.exe"); // [cite: 268]
ffmpeg.setFfprobePath(process.env.FFPROBE_PATH); // [cite: 268]

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
if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY); // [cite: 222, 334]
async function enviarCorreoNotificacion(to, subject, html) {
    if (!process.env.FROM_EMAIL) return console.error("❌ FROM_EMAIL no configurado."); // [cite: 223, 335]
    const msg = { to, from: process.env.FROM_EMAIL, subject, html }; // [cite: 335]
    try {
        await sgMail.send(msg); // [cite: 224, 336]
        console.log("📨 Correo enviado a:", to); // [cite: 224, 336]
    } catch (err) {
        console.error("❌ Error enviando correo:", err.response?.body || err); // [cite: 225, 337]
    }
}
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

// ===== FUNCIONES AUXILIARES =====
function safeUnlink(p) {
    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
}
function nowISO() { return new Date().toISOString(); }
// LIMPIEZA OCR
function limpiarTextoOCR(textoCrudo) { // [cite: 213]
    let textoLimpio = textoCrudo.replace(/[|:;—]/g, ' '); // [cite: 214]
    textoLimpio = textoLimpio.replace(/[.,]/g, ''); // [cite: 214]
    textoLimpio = textoLimpio.replace(/[\[\]]/g, ' '); // [cite: 214]
    textoLimpio = textoLimpio.replace(/^[£A]/g, ''); // [cite: 214]
    textoLimpio = textoLimpio.replace(/\s+/g, ' '); // [cite: 214]
    return textoLimpio.trim(); // [cite: 215]
}


// EXTRAER IDENTIFICADOR
function extraerIdentificadorDesdeOCR(ocrText) { // [cite: 215, 339]
    if (!ocrText) return null; // [cite: 215, 339]
    const t = ocrText.replace(/\s+/g, ' '); // [cite: 216, 340]
    // DUI
    const duiMatch = t.match(/\b(\d{8}-\d)\b/); // [cite: 216, 341]
    if (duiMatch) return { tipo: 'DUI', valor: duiMatch[0] }; // [cite: 216, 341]
    // Pasaporte
    const pasaporteMatch = t.match(/\b([A-Z0-9]{6,9})\b/); // [cite: 217, 342]
    if (pasaporteMatch) return { tipo: 'Pasaporte', valor: pasaporteMatch[0] }; // [cite: 217, 342]
    return null; // [cite: 217, 343]
}


// JWT AUTH
function authenticateJWT(req, res, next) { // [cite: 218]
    const authHeader = req.headers.authorization; // [cite: 218]
    if (authHeader) { // [cite: 219]
        const token = authHeader.split(' ')[1]; // [cite: 219]
        if (!process.env.JWT_SECRET) return res.status(500).json({ ok: false, message: 'Error interno JWT.' }); // [cite: 220]
        jwt.verify(token, process.env.JWT_SECRET, (err, user) => { // [cite: 221]
            if (err) return res.status(403).json({ ok: false, message: 'Token inválido o expirado.' }); // [cite: 221]
            req.user = user; // [cite: 221]
            next(); // [cite: 221]
        });
    } else res.status(401).json({ ok: false, message: 'Acceso denegado. Token requerido.' }); // [cite: 222]
}
// ===== FUNCIONES DE PROCESAMIENTO =====

// PROCESAR DOCUMENTO (MEJORA IMAGEN)
async function procesarDocumento(entrada, salida) {
    try {
        await sharp(entrada)
            .rotate()
            .resize(1200)
            .normalize()
            .greyscale()
            .toFile(salida);
        return salida;
    } catch (error) {
        console.error("❌ Error procesando documento:", error);
        return entrada;
    }
}

// OCR PARA DOCUMENTO
async function realizarOCR(rutaImagen) {
    // 1️⃣ Verificar que el archivo existe
    if (!rutaImagen || !fs.existsSync(rutaImagen)) {
        console.warn("⚠️ Archivo no encontrado para OCR:", rutaImagen);
        return "";
    }
    const worker = createWorker();
    try {
        await worker.load();
        await worker.loadLanguage("spa"); 
        await worker.initialize("spa");

        const { data: { text } } = await worker.recognize(rutaImagen);
        console.log("OCR resultado:", text);
        return text || "";
    } catch (err) {
        console.error("Error OCR: ", err);
        return "";
    } finally {
        try { await worker.terminate(); } catch (e) { /* ignore */ }
    }
}

async function compararRostros(docBuffer, selfieBuffer, threshold = 80) { // [cite: 238, 282]
    if (!rekognitionClient) return { ok: false, similarity: 0 }; // [cite: 282]
    const params = { SourceImage: { Bytes: docBuffer }, TargetImage: { Bytes: selfieBuffer }, SimilarityThreshold: threshold }; // Se usa el doc buffer/selfie buffer [cite: 238, 283]
    const command = new CompareFacesCommand(params); // [cite: 239, 283]
    try {
        const response = await rekognitionClient.send(command); // [cite: 239, 284]
        if (response.FaceMatches && response.FaceMatches.length > 0) { // [cite: 239, 285]
            const similarity = response.FaceMatches[0].Similarity; // [cite: 286]
            return { ok: similarity >= threshold, similarity }; // [cite: 239, 286]
        }
        return { ok: false, similarity: 0 }; // [cite: 240, 287]
    } catch (err) {
        console.error("❌ Error compararRostros:", err); // [cite: 287]
        return { ok: false, similarity: 0 }; // [cite: 288]
    }
}

// EXTRAER FRAME DE VIDEO
function extraerFrameVideo(videoPath) { // [cite: 293]
    return new Promise((resolve, reject) => {
        const tempPng = path.join(path.dirname(videoPath), `${uuidv4()}.png`); // [cite: 293]
        ffmpeg(videoPath)
            .screenshots({ timestamps: ['50%'], filename: path.basename(tempPng), folder: path.dirname(tempPng) }) // [cite: 294]
            .on('end', () => {
                fs.readFile(tempPng, (err, data) => {
                    if (err) return reject(err); // [cite: 294]
                    safeUnlink(tempPng); // [cite: 294]
                    resolve(data);
                });
            })
            .on('error', (err) => {
                safeUnlink(tempPng); // [cite: 295]
                reject(err);
            }); // [cite: 295]
    }); // [cite: 296]
}

// EXTRAER ROSTRO DEL DOCUMENTO (Se usa lógica de crop basada en porcentajes, típica para documentos)
async function extraerRostroDocumento(docPath) { // [cite: 296]
    const image = sharp(docPath); // [cite: 297]
    const metadata = await image.metadata(); // [cite: 297]
    const width = Math.max(100, Math.floor((metadata.width || 400) * 0.3)); // [cite: 297]
    const height = Math.max(100, Math.floor((metadata.height || 400) * 0.45)); // [cite: 298]
    const left = Math.max(0, Math.floor((metadata.width || 400) * 0.35)); // [cite: 298]
    const top = Math.max(0, Math.floor((metadata.height || 400) * 0.18)); // [cite: 299]
    return await image.extract({ left, top, width, height }).toBuffer(); // [cite: 299]
}
// VERIFICAR DOCUMENTO
async function verificarDocumento(imagenPath) {
    const worker = createWorker();
    try {
        await worker.load();
        await worker.loadLanguage("spa");
        await worker.initialize("spa");

        const { data: { text } } = await worker.recognize(imagenPath);
        const texto = (text || "").toLowerCase();
        const palabrasClave = ["dui", "pasaporte", "republica", "nombre"];
        return palabrasClave.some(p => texto.includes(p));
    } catch (err) {
        console.error("Error verificarDocumento:", err);
        return false;
    } finally {
        try { await worker.terminate(); } catch (e) { }
    }
}

// GUARDAR VERIFICACIÓN - Corregida para incluir 'acciones' y 13 parámetros
async function guardarVerificacion({
    user_id = null, 
    ocrText = null, 
    similarityScore = null, 
    match_result = false,
    liveness = false, 
    edad_valida = null, 
    documento_path = null, 
    selfie_paths = null,
    ip = null, 
    dispositivo = null, 
    resultado_general = null, 
    notificado = false
}) {
    const q = `
        INSERT INTO verificacion_biometrica
        (user_id, dui_text, score, match_result, liveness, edad_valida, documento_path, selfie_paths, ip_usuario, dispositivo, acciones, resultado_general, notificado, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now()) 
        RETURNING id;
    `;
    const vals = [ // ¡13 valores para $1 - $13!
        user_id, ocrText, similarityScore, match_result, liveness, edad_valida,
        documento_path, selfie_paths ? JSON.stringify(selfie_paths) : null,
        ip, dispositivo ? JSON.stringify(dispositivo) : null,
        acciones ? JSON.stringify(acciones) : null, // $11
        resultado_general, // $12
        notificado // $13
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

// 🔐 LOGIN
app.post('/login', async (req, res) => { // [cite: 226, 320]
    try {
        const { correo, contrasena } = req.body;
        const resultado = await pool.query("SELECT * FROM usuarios WHERE correo = $1", [correo]);
        // Se usa la respuesta JSON del primer código para consistencia de API [cite: 227]
        if (resultado.rows.length === 0) return res.status(404).json({ ok: false, message: "Usuario no encontrado" }); // [cite: 227, 320]
        const usuario = resultado.rows[0];
        const passwordValida = await bcrypt.compare(contrasena, usuario.contrasena); // [cite: 227, 320]

        if (!passwordValida) return res.status(401).json({ ok: false, message: "Contraseña incorrecta" }); // [cite: 227]

        let token = null;
        if (process.env.JWT_SECRET) {
            token = jwt.sign({ id: usuario.id, correo: usuario.correo }, process.env.JWT_SECRET, { expiresIn: '2h' }); // [cite: 321]
        }

        return res.json({ ok: true, token, redirect: "/Views/cotizador.html", user_id: usuario.id }); // [cite: 227]
    } catch (error) {
        console.error(error); // [cite: 228, 323]
        res.status(500).json({ ok: false, message: "Error en el inicio de sesión" }); // Se usa la respuesta JSON [cite: 228, 323]
    }
});

// 👤 REGISTRAR USUARIO
app.post('/guardar-registerForm', async (req, res) => { // [cite: 317]
    try {
        const { nombres, apellidos, sexo, correo, celular, fechanacimiento, tipodocumento, numeroDocumento, contrasena } = req.body;
        if (!correo || !contrasena) return res.status(400).json({ ok: false, message: 'correo y contraseña son requeridos' }); // [cite: 317]
        const hashedPassword = await bcrypt.hash(contrasena, 10); // [cite: 317]
        const query = `
            INSERT INTO usuarios
            (nombres, apellidos, sexo, correo, celular, fechanacimiento, tipodocumento, numerodocumento, contrasena)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id;
        `; // [cite: 318]
        const values = [nombres, apellidos, sexo, correo, celular, fechanacimiento, tipodocumento, numeroDocumento, hashedPassword]; // [cite: 318]
        const r = await pool.query(query, values); // [cite: 318]
        res.status(200).json({ ok: true, id: r.rows[0].id }); // [cite: 318]
    } catch (error) {
        console.error("❌ Error al registrar usuario:", error); // [cite: 319]
        res.status(500).json({ ok: false, message: "Error al registrar usuario" }); // [cite: 319]
    }
});


// 📄 GUARDAR CONTRATACIÓN
app.post('/guardar-contratacion', authenticateJWT, async (req, res) => { // Se mantiene el JWT auth de la primera versión [cite: 229]
    try {
        const usuario_id = req.user.id; // Se usa el ID del token [cite: 229]
        const { nombre_completo, correo, celular } = req.body;
        const usuarioExiste = await pool.query('SELECT * FROM usuarios WHERE id=$1', [usuario_id]);
        if (usuarioExiste.rows.length === 0) return res.status(404).json({ ok: false, message: 'Usuario no existe' }); // Se usa respuesta JSON [cite: 229, 332]
        await pool.query(`INSERT INTO contrataciones (usuario_id, nombre_completo, correo, celular) VALUES($1,$2,$3,$4)`, [usuario_id, nombre_completo, correo, celular]); // [cite: 230, 333]
        res.json({ ok: true, message: 'Contratación registrada correctamente' }); // Se usa respuesta JSON [cite: 230, 333]
    } catch (err) {
        console.error(err); // [cite: 230, 333]
        res.status(500).json({ ok: false, message: 'Error al registrar contratación' }); // Se usa respuesta JSON [cite: 230, 333]
    }
});


// 💰 GUARDAR COTIZACIÓN
app.post('/guardar-cotizacionForm', async (req, res) => { // [cite: 323]
    try {
        const { id, monto_asegurar, cesion_beneficios, poliza } = req.body; // [cite: 323]
        if (!id) return res.status(400).json({ ok: false, message: 'id de usuario requerido' }); // [cite: 324]
        const usuarioRes = await pool.query("SELECT nombres, apellidos, correo, celular FROM usuarios WHERE id=$1", [id]); // [cite: 324]
        if (usuarioRes.rows.length === 0) return res.status(404).json({ ok: false, message: 'Usuario no encontrado' }); // [cite: 324]
        const usuario = usuarioRes.rows[0]; // [cite: 324]
        const insertQuery = `
            INSERT INTO formulariocotizacion
            (usuario_id, nombre, primerapellido, segundoapellido, celular, correo, monto_asegurar, cesion_beneficios, poliza)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *;
        `; // [cite: 325]
        const values = [id, usuario.nombres || '', usuario.apellidos || '', '', usuario.celular || '', usuario.correo || '', monto_asegurar, cesion_beneficios, poliza]; // [cite: 325]
        const result = await pool.query(insertQuery, values); // 

        if (transporter) { // 
            await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.EMAIL_USER,
                to: usuario.correo,
                subject: 'Cotización Registrada',
                html: `<h2>Hola ${usuario.nombres || ''},</h2><p>Tu cotización ha sido registrada correctamente:</p><ul><li>Monto a asegurar: $${monto_asegurar}</li><li>Cesión de beneficios: ${cesion_beneficios}</li><li>Póliza: ${poliza}</li></ul>` // [cite: 327, 328]
            }); // [cite: 329]
        }

        res.json({ ok: true, message: 'Cotización guardada y correo enviado (si configurado)', data: result.rows[0] }); // [cite: 329]
    } catch (err) {
        console.error(err); // [cite: 330, 331]
        res.status(500).json({ ok: false, message: 'Error al guardar cotización o enviar correo' }); // [cite: 331]
    }
});


// 💾 GUARDAR REFERENCIA (REDIS)
app.post("/guardar-referencia", async (req, res) => { // [cite: 315]
    try {
        const { usuario_id, imagen_base64 } = req.body;
        if (!usuario_id || !imagen_base64) { return res.json({ ok: false, mensaje: "Falta de datos" }); } // [cite: 315]

        await conectarRedis(); // Se asegura la conexión

        if (!redisClient.isOpen) { return res.json({ ok: false, mensaje: "Servicio temporal no disponible" }); } // [cite: 316]

        // Expira en 300 segundos (5 minutos) [cite: 316]
        await redisClient.setEx(`REF:${usuario_id}`, 300, imagen_base64); // [cite: 316]
        return res.json({ ok: true, mensaje: "Rostro de referencia guardado temporalmente" }); // [cite: 316]
    } catch (err) {
        console.error("Error guardando en Redis:", err);
        return res.status(500).json({ ok: false, mensaje: "Error al guardar referencia" });
    }
});

// Inicializar SendGrid
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Función para enviar correo
async function enviarCorreoNotificacion(to, subject, html) {
    if (!process.env.FROM_EMAIL) {
        console.error("❌ FROM_EMAIL no configurado en .env");
        return;
    }

    const msg = {
        to,
        from: process.env.FROM_EMAIL,
        subject,
        html,
    };

    try {
        await sgMail.send(msg);
        console.log("📨 Correo enviado a:", to);
    } catch (err) {
        console.error("❌ Error enviando correo:", err);
    }
}
function extraerIdentificadorDesdeOCR(ocrText) { // <--- ESTA FUNCIÓN TAMBIÉN
    // Implementación simple de ejemplo: buscar patrón de DUI (########-#) o pasaporte (alfanumérico)
    if (!ocrText) return null;
    const t = ocrText.replace(/\s+/g, ' ');
    // buscar DUI estilo salvadoreño (8 dígitos guion 1 dígito)
    const duiMatch = t.match(/\b(\d{8}-\d)\b/);
    if (duiMatch) return { tipo: 'DUI', valor: duiMatch[0] };
    // buscar patrón de pasaporte (al menos 6-9 alfanum)
    const pasaporteMatch = t.match(/\b([A-Z0-9]{6,9})\b/);
    if (pasaporteMatch) return { tipo: 'Pasaporte', valor: pasaporteMatch[0] };
    return null;
}



app.post('/verificar-identidad', upload.fields([
    { name: 'doc', maxCount: 1 },
    { name: 'video', maxCount: 1 }
]), async (req, res) => {

    const tmpFilesToRemove = [];
    let tipoDocumentoDetectado = "DESCONOCIDO";
    let rostroCoincide = false; // Inicializado para evitar problemas de alcance
    let similarityScore = null; // Inicializado para evitar problemas de alcance
    let correo_usuario = null;
    let nombre_usuario = null;
    let verificationId = null;
    const MAX_INTENTOS = 5;          // 🔒 Límite de intentos por usuario
const EXPIRACION_INTENTOS = 86400; // 24 horas en segundos

    try {
        // =========================================================
        //  1. VALIDAR ID DE USUARIO Y LÍMITE DE INTENTOS (REDIS)
        // =========================================================
        const userId = req.body.user_id;
        if (!userId) {
            return res.status(400).json({ exito: false, mensaje: "Falta el ID de usuario" });
        }

        await conectarRedis();

        const key = `INTENTOS:${userId}`;

        let intentos = await redisClient.get(key);
        intentos = intentos ? parseInt(intentos) : 0;

        if (intentos >= MAX_INTENTOS) {
            return res.status(429).json({
                exito: false,
                mensaje: `⚠️ Has alcanzado el máximo de ${MAX_INTENTOS} intentos en 24 horas. Intenta más tarde.`
            });
        }

        // Obtener datos del usuario para notificaciones
        const userRes = await pool.query("SELECT id, nombres, apellidos, correo FROM usuarios WHERE id = $1", [userId]);
        if (userRes.rows.length > 0) {
            correo_usuario = userRes.rows[0].correo;
            nombre_usuario = `${userRes.rows[0].nombres || ''} ${userRes.rows[0].apellidos || ''}`.trim();
        } else {
            return res.status(404).json({ exito: false, mensaje: "Usuario no encontrado" });
        }

        // =========================================================
        //  2. VALIDACIÓN INICIAL DEL DOCUMENTO (Se omite código por brevedad)
        // =========================================================
        if (!req.files?.doc?.[0]) {
            return res.status(400).json({ exito: false, mensaje: 'Documento no enviado' });
        }
        const docFile = req.files.doc[0];
        const docPath = docFile.path;
        tmpFilesToRemove.push(docPath);

        // 3. PROCESAR DOCUMENTO
        const processedDocPath = path.join(path.dirname(docPath), `proc_${uuidv4()}.png`);
        await procesarDocumento(docPath, processedDocPath);
        tmpFilesToRemove.push(processedDocPath);
        let encryptedDoc = null;
        try {
            const docBuffer = fs.readFileSync(docPath);
            if (KEY) encryptedDoc = encryptBuffer(docBuffer);
        } catch (e) {
            console.warn('No se pudo encriptar doc:', e);
        }

        // 4. OCR, LIMPIEZA Y EXTRACCIÓN DE IDENTIFICADOR
        const ocrTextCrudo = (await realizarOCR(processedDocPath)) || "Texto no legible";
        const ocrText = limpiarTextoOCR(ocrTextCrudo);
        console.log("OCR limpio para análisis:", ocrText);

        // 5. DETECTAR TIPO DE DOCUMENTO
        const textoMinus = ocrText.toLowerCase();
        if (
            textoMinus.includes("dui") ||
            textoMinus.includes("documento") ||
            textoMinus.includes("nacimiento") ||
            textoMinus.match(/\b\d{8}-\d\b/)
        ) {
            tipoDocumentoDetectado = "DUI";
        } else if (textoMinus.includes("pasaporte") || textoMinus.includes("passport")) {
            tipoDocumentoDetectado = "Pasaporte";
        } else {
            tipoDocumentoDetectado = "Foto no válida (no es un documento oficial)";
            // Ya que es un fallo temprano, borramos los archivos y retornamos el error.
            tmpFilesToRemove.forEach(p => safeUnlink(p));
            return res.json({
                exito: false,
                mensaje: "El archivo subido no parece un documento oficial (DUI o pasaporte).",
                tipo_documento: tipoDocumentoDetectado,
                vista_previa: `/uploads/${path.basename(docPath)}`
            });
        }

        // 6. EXTRAER IDENTIFICADOR DEL OCR
        const identificadorObj = extraerIdentificadorDesdeOCR(ocrText) || null;
        const identificador = identificadorObj ? identificadorObj.valor : "DESCONOCIDO";

        // 7. EXTRAER ROSTRO DEL DOCUMENTO
        const rostroDocBuffer = await extraerRostroDocumento(processedDocPath);

        // 8. COMPARACIÓN FACIAL (documento vs selfie/video)
        let encryptedSelfies = null;
        if (req.files.video?.[0]) {
            const videoPath = req.files.video[0].path;
            tmpFilesToRemove.push(videoPath);

            try {
                const frameBuf = await extraerFrameVideo(videoPath);

                if (rekognitionClient) {
                    const compareCmd = new CompareFacesCommand({
                        SourceImage: { Bytes: frameBuf },
                        TargetImage: { Bytes: rostroDocBuffer },
                        SimilarityThreshold: Number(process.env.SIMILARITY_THRESHOLD || 80)
                    });

                    const compareRes = await rekognitionClient.send(compareCmd);
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

                // Encriptar selfie/video si hay clave
                if (KEY) {
                    const videoBuffer = fs.readFileSync(videoPath);
                    const enc = encryptBuffer(videoBuffer);
                    encryptedSelfies = [{ data: enc.data, iv: enc.iv }];
                } else {
                    encryptedSelfies = null;
                }
            } catch (err) {
                console.error('Error comparación facial:', err);
            }
        }

        // =========================================================
        //  9. REGISTRAR INTENTO EN REDIS 
        // =========================================================
        const nuevosIntentos = await redisClient.incr(key); // ¡Solo un incremento!
        // Solo establecer expire si la clave es nueva (si llegó a 1 -> recién creada)
        if (nuevosIntentos === 1) {
            await redisClient.expire(key, EXPIRACION_INTENTOS); // segundos
        }

        // =======================
        //  10. GUARDAR EN BD
        // =======================
        verificationId = await guardarVerificacion({
            user_id: userId,
            ocrText,
            similarityScore,
            match_result: rostroCoincide,
            liveness: null,
            edad_valida: null,
            documento_path: docPath,
            selfie_paths: encryptedSelfies,
            ip: req.ip || req.headers['x-forwarded-for'] || null,
            dispositivo: { ua: req.get("User-Agent") || null },
            acciones: null, // Incluido en la función 
            resultado_general: rostroCoincide ? "APROBADO" : "RECHAZADO",
            notificado: correo_usuario ? true : false,
        });

        console.log("Verificación guardada con id:", verificationId);

        // =========================================================
        //   11. NOTIFICACIONES AUTOMÁTICAS (MOVIDO DENTRO DEL TRY)
        // =========================================================

        // ✔ ÉXITO
        if (rostroCoincide && correo_usuario) {
            await enviarCorreoNotificacion(
                correo_usuario,
                "Verificación Exitosa",
                `<p>Hola ${nombre_usuario},</p>
                <p>Tu verificación fue <strong>aprobada exitosamente</strong>.</p>
                <p>Similitud detectada: ${similarityScore?.toFixed(2)}%</p>`
            );
        }

        // ❌ FALLO
        if (!rostroCoincide && correo_usuario) {
            await enviarCorreoNotificacion(
                correo_usuario,
                "Verificación Fallida",
                `<p>Hola ${nombre_usuario},</p>
                <p>La verificación <strong>NO coincidió</strong> con tu documento.</p>
                <p>Por favor inténtalo nuevamente.</p>`
            );
        }

        // ⚠ Revisión manual (opcional)
        if (similarityScore !== null && similarityScore < 50) {
            await enviarCorreoNotificacion(
                process.env.FROM_EMAIL, // Admin o correo del sistema
                "Revisión Manual Requerida",
                `<p>El usuario ${correo_usuario} requiere revisión manual. ID: ${verificationId}</p>`
            );
        }

        // =========================================================
        //  12. RESPUESTA FINAL (MOVIDO DENTRO DEL TRY)
        // =========================================================
        return res.json({
            exito: rostroCoincide,
            mensaje: rostroCoincide
                ? `✅ Verificación exitosa (Similitud: ${similarityScore?.toFixed(2)}%)`
                : "❌ Rostro no coincide con el documento",
            id_verificacion: verificationId,
            match: rostroCoincide,
            score: similarityScore,
            ocr: ocrText,
            tipo_documento: tipoDocumentoDetectado,
            identificador,
        });

    } catch (err) {
        console.error("Error en /verificar-identidad:", err);
        // Si el error ocurre antes de la respuesta final, retornamos 500
        return res.status(500).json({
            exito: false,
            mensaje: "Error en el servidor durante la verificación",
        });
    } finally {
        // 🔹 Borrar archivos temporales
        tmpFilesToRemove.forEach(p => safeUnlink(p));
    }
});

//  INICIAR SERVIDOR CON REDIS 
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
        // Cerrar PostgreSQL si está conectado
        if (pool) {
            await pool.end();
            console.log('✅ PostgreSQL cerrado');
        }

        // Cerrar Redis solo si está abierto
        if (redisClient && redisClient.isOpen) {
            await redisClient.quit();
            console.log('✅ Redis cerrado');
            // Esperar un poco para permitir cierre TCP limpio
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        console.log('✅ Conexiones cerradas correctamente');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error al cerrar:', err);
        process.exit(1);
    }
});

// === Middleware global de errores ===
app.use((err, req, res, next) => {
    console.error("Error no capturado:", err);
    if (!res.headersSent) {
        res.status(500).json({ exito: false, mensaje: "Error interno del servidor", detalle: err.message });
    }
});

// Iniciar 
iniciarServidor();
