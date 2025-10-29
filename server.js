// server.js
<<<<<<< HEAD
//===== IMPORTS ==== 
=======
>>>>>>> b61c6a66f50d1a1e91f68a974f67c3513384d946
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
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const { Pool } = pkg;
dotenv.config();
<<<<<<< HEAD

const app = express();
const PORT = process.env.PORT || 3000;
// === ENCRIPTACIÓN AES-256 ===
const ALGORITHM = "aes-256-cbc";
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex"); // 32 bytes

if (KEY.length !== 32) {
    throw new Error("ENCRYPTION_KEY inválida. Debe tener 64 caracteres hexadecimales (32 bytes)");
}

function encryptBuffer(buffer) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return { data: encrypted.toString("base64"), iv: iv.toString("hex") };
}

function decryptBuffer(base64Data, ivHex) {
    const iv = Buffer.from(ivHex, "hex");
    const encryptedBuffer = Buffer.from(base64Data, "base64");
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
}

// ===== Helmet: Seguridad y CSP =====
// Seguridad y CORS
app.use(cors());
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "script-src": ["'self'", "https://cdn.tailwindcss.com", "https://unpkg.com"],
            "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            "img-src": ["'self'", "data:", "blob:"],
        },
    },
}));
// ===== Middleware =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== Archivos estáticos =====
app.use(express.static(path.join(process.cwd(), "Views")));
app.use("/js", express.static(path.join(process.cwd(), "Views/Js")));
app.use("/img", express.static(path.join(process.cwd(), "Views/img")));
app.use("/css", express.static(path.join(process.cwd(), "Views/css")));

// ===== Rutas =====
app.get("/", (req, res) => {
    res.sendFile(path.join(process.cwd(), "Views/Index.html"));
});

// === Postgres (Neon) ===
=======

const app = express();
const PORT = 3000;

// === Conexión PostgreSQL ===
>>>>>>> b61c6a66f50d1a1e91f68a974f67c3513384d946
const pool = new Pool({
    user: process.env.NEON_USER,
    host: process.env.NEON_HOST,
    database: process.env.NEON_DATABASE,
    password: process.env.NEON_PASSWORD,
    port: Number(process.env.NEON_PORT || 5432),
    ssl: { rejectUnauthorized: false }
});

<<<<<<< HEAD
// === AWS Rekognition client ===
const rekClient = new RekognitionClient({ region: process.env.AWS_REGION });

// === Nodemailer ===
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});
=======
// Probar conexión al iniciar servidor
pool.connect()
    .then(client => {
        console.log("✅ Conexión a PostgreSQL OK");
        client.release();
    })
    .catch(err => console.error("❌ Error al conectar a PostgreSQL:", err));
>>>>>>> b61c6a66f50d1a1e91f68a974f67c3513384d946

// === Middlewares ===
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
<<<<<<< HEAD
app.use(helmet());
app.set('trust proxy', 1);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
=======
app.use(express.static(path.join(process.cwd(), "Views")));
app.use("/models", express.static(path.join(process.cwd(), "models")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
>>>>>>> b61c6a66f50d1a1e91f68a974f67c3513384d946

app.use(express.static(path.join(process.cwd(), "Views")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// === Multer storage + limits + fileFilter ===
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
    limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'application/pdf', 'video/webm', 'video/mp4'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(null, false);
    }
});

<<<<<<< HEAD
// === Utilidades ===
function safeUnlink(p) {
    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
}

function nowISO() { return new Date().toISOString(); }

// Robust frame extractor (returns Buffer)
=======
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

>>>>>>> b61c6a66f50d1a1e91f68a974f67c3513384d946
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

<<<<<<< HEAD
// Extraer rostro del documento (crop heurístico)
async function extraerRostroDocumento(docPath) {
    const image = sharp(docPath);
    const metadata = await image.metadata();
    const width = Math.max(100, Math.floor(metadata.width * 0.3));
    const height = Math.max(100, Math.floor(metadata.height * 0.45));
    const left = Math.max(0, Math.floor(metadata.width * 0.35));
    const top = Math.max(0, Math.floor(metadata.height * 0.18));
    return await image.extract({ left, top, width, height }).toBuffer();
}

// === Helper: save verificacion record ===
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

// === Endpoints ===

// Health / root
app.get("/", (req, res) => res.sendFile(path.join(process.cwd(), "Views/Index.html")));

// Endpoint: login retorna JWT
app.post("/login", async (req, res) => {
    try {
        const { correo, contrasena } = req.body;
        const result = await pool.query("SELECT id, correo, contrasena, rol FROM usuarios WHERE correo=$1", [correo]);
        if (result.rows.length === 0) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
        const user = result.rows[0];
        const valid = await bcrypt.compare(contrasena, user.contrasena);
        if (!valid) return res.status(401).json({ ok: false, message: "Contraseña incorrecta" });
        const token = jwt.sign({ id: user.id, correo: user.correo, rol: user.rol || "user" }, process.env.JWT_SECRET, { expiresIn: '2h' });
        res.json({ ok: true, token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false });
    }
});

// Admin middleware (development-friendly). In prod, usa JWT and roles.
function checkAdmin(req, res, next) {
    const header = req.headers['x-admin-token'] || req.headers.authorization;
    if (header && (header === process.env.ADMIN_TOKEN || (header.startsWith('Bearer ') && header.slice(7) === process.env.ADMIN_TOKEN))) return next();
    return res.status(403).json({ ok: false, message: "No autorizado" });
}

// Admin: listar verificaciones
app.get("/admin/verificaciones", checkAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(`
        SELECT v.*, u.nombres, u.apellidos, u.correo
        FROM verificacion_biometrica v
        LEFT JOIN usuarios u ON u.id = v.user_id
        ORDER BY v.created_at DESC
        LIMIT 500;
    `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false });
    }
});

// Registro de intento (opcional complemento)
app.post("/registro-intento", express.json(), async (req, res) => {
    try {
        const { user_id, resultado, ocr_resumen, explicacion_ia, acciones, device } = req.body;
        await pool.query(`
        INSERT INTO verificacion_biometrica (user_id, dui_text, resultado_general, documento_path, selfie_paths, ip_usuario, dispositivo, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7, now())
    `, [user_id || null, ocr_resumen || null, resultado || null, null, JSON.stringify(acciones || []), req.ip, JSON.stringify(device || {})]);
        res.json({ ok: true });
    } catch (err) {
        console.error("registro-intento error:", err);
        res.status(500).json({ ok: false });
    }
});

// Main endpoint: verificar identidad (doc + video opcional)
app.post("/verificar-identidad", upload.fields([{ name: 'doc' }, { name: 'video' }]), async (req, res) => {
    // NOTE: multer will place text fields into req.body
    let tmpFilesToRemove = [];
    try {
        // validar doc
        if (!req.files || !req.files['doc'] || req.files['doc'].length === 0) {
            return res.status(400).json({ exito: false, mensaje: "Documento no enviado" });
        }
        const docFile = req.files['doc'][0];
        const docPath = docFile.path;
        tmpFilesToRemove.push(docPath);
        // === Encriptar documento antes de guardarlo ===
        const docBuffer = fs.readFileSync(docPath);
        const encryptedDoc = encryptBuffer(docBuffer);

        // OCR con Tesseract (worker lifecycle correcto)
        let ocrText = "";
        let shapExplanation = "Explicación no disponible";
        try {
            const worker = createWorker();
            await worker.load();
            await worker.loadLanguage('spa');
            await worker.initialize('spa');
            const { data: { text } } = await worker.recognize(docPath);
            await worker.terminate();
            ocrText = (text || "").trim();

            // pasar a SHAP vía archivo temporal para evitar problemas con comillas/límites
            const tmpOcrPath = path.join(process.cwd(), `tmp_ocr_${uuidv4()}.txt`);
            fs.writeFileSync(tmpOcrPath, ocrText, 'utf8');
            tmpFilesToRemove.push(tmpOcrPath);

            shapExplanation = await new Promise((resolve) => {
                const py = spawn('python', ['shap_explain.py', tmpOcrPath], { cwd: process.cwd() });
                let out = "";
                py.stdout.on('data', d => out += d.toString());
                py.stderr.on('data', d => console.error('shap stderr:', d.toString()));
                py.on('close', code => {
                    try { safeUnlink(tmpOcrPath); } catch (e) { }
                    if (code !== 0) return resolve("Explicación no disponible.");
                    resolve(out.trim() || "Explicación vacía.");
                });
                py.on('error', () => {
                    try { safeUnlink(tmpOcrPath); } catch (e) { }
                    resolve("Explicación no disponible.");
                });
            });
        } catch (err) {
            console.error("OCR/SHAP error:", err);
            ocrText = "Texto no legible";
            shapExplanation = "Imagen no procesable";
        }

        // preparar doc URL (si sirves desde uploads)
        const docUrl = `/uploads/${path.basename(docPath)}`;

        // si vino video, extraer frame y comparar
        let rostroCoincide = false;
        let similarityScore = null;
        let selfiePaths = null;
        if (req.files['video'] && req.files['video'][0]) {
            const videoFile = req.files['video'][0];
            const videoPath = videoFile.path;
            tmpFilesToRemove.push(videoPath);
            selfiePaths = [videoPath];

            try {
                const frameBuf = await extraerFrameVideo(videoPath);
                const rostroDoc = await extraerRostroDocumento(docPath);

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
                    similarityScore = (compareRes.FaceMatches && compareRes.FaceMatches[0]) ? compareRes.FaceMatches[0].Similarity : 0;
                }
            } catch (err) {
                console.error("Error comparación facial:", err);
            }
        }
        // === Si existe video, también encripta el buffer antes de guardar ===
        let encryptedSelfies = null;
        if (req.files['video'] && req.files['video'][0]) {
            const videoBuffer = fs.readFileSync(req.files['video'][0].path);
            const encVideo = encryptBuffer(videoBuffer);
            encryptedSelfies = [{ data: encVideo.data, iv: encVideo.iv }];
        }

        // parsear acciones y device del formData (si vienen)
        let acciones = null;
        try { acciones = req.body.acciones ? JSON.parse(req.body.acciones) : null; } catch (e) { acciones = null; }
        const dispositivo = req.body.device ? JSON.parse(req.body.device) : (req.headers['user-agent'] || null);
        const user_id = req.body.user_id ? Number(req.body.user_id) : null;

        // liveness: si frontend manda liveness boolean en body, úsalo; sino undefined
        const liveness = req.body.liveness === 'true' ? true : (req.body.liveness === 'false' ? false : null);

        // edad valida: podrías extraer fecha desde OCR y calcular; por ahora null
        const edad_valida = null;

        // resultado general
        const resultado_general = req.files['video'] && req.files['video'][0]
            ? (rostroCoincide ? 'Éxito: rostro coincide' : 'Fallo: rostro no coincide')
            : 'Documento recibido (sin verificación facial)';

        // Guardar verificación en DB
        const verifId = await guardarVerificacion({
            user_id,
            ocrText,
            similarityScore,
            match_result: rostroCoincide,
            liveness: liveness === true,
            edad_valida,
            documento_path: JSON.stringify({ data: encryptedDoc.data, iv: encryptedDoc.iv }),
            selfie_paths: encryptedSelfies ? JSON.stringify(encryptedSelfies) : null,
            ip: req.ip || req.connection.remoteAddress,
            dispositivo,
            acciones,
            resultado_general,
            notificado: false
        });

        // Enviar notificación al usuario (si se puede obtener email)
        try {
            let userEmail = null;
            if (user_id) {
                const r = await pool.query("SELECT correo FROM usuarios WHERE id = $1", [user_id]);
                if (r.rows.length) userEmail = r.rows[0].correo;
            }
            // fallback if client provided
            if (!userEmail && req.body.user_email) userEmail = req.body.user_email;

            if (userEmail && verifId && rostroCoincide) {
                await transporter.sendMail({
                    from: process.env.SMTP_FROM,
                    to: userEmail,
                    subject: "Resultado de verificación",
                    text: `Su verificación fue exitosa. Similaridad: ${similarityScore || 'N/A'}. Fecha: ${nowISO()}`
                });
                // marcar notificado
                await pool.query("UPDATE verificacion_biometrica SET notificado = true WHERE id = $1", [verifId]);
            }
        } catch (err) {
            console.error("Error enviando notificacion:", err);
        }

        // Responder al frontend con resumen
        const ocrSummary = ocrText.length > 150 ? ocrText.substring(0, 150) + "..." : ocrText;
        if (req.files['video'] && req.files['video'][0]) {
            if (rostroCoincide) {
                return res.json({
                    exito: true,
                    mensaje: "Documento válido y rostro coincide",
                    ocr_resumen: ocrSummary,
                    explicacion_ia: shapExplanation,
                    vista_previa: docUrl,
                    similarityScore
                });
            } else {
                return res.json({
                    exito: false,
                    mensaje: "Rostro no coincide con documento",
                    ocr_resumen: ocrSummary,
                    explicacion_ia: shapExplanation,
                    vista_previa: docUrl,
                    similarityScore
                });
            }
        } else {
            return res.json({
                exito: true,
                mensaje: "Documento recibido (sin verificación facial)",
                ocr_resumen: ocrSummary,
                explicacion_ia: shapExplanation,
                vista_previa: docUrl
            });
        }
    } catch (err) {
        console.error("Error endpoint verificar-identidad:", err);
        res.status(500).json({ exito: false, mensaje: "Error durante la verificación" });
    } finally {
        // limpieza de archivos temporales (si quedan)
        try { tmpFilesToRemove.forEach(p => safeUnlink(p)); } catch (e) { }
    }
});

// Guardar registro de usuario (ejemplo anterior)
=======
// === Endpoints ===

// Página principal
app.get("/", (req, res) => res.sendFile(path.join(process.cwd(), "Views/Index.html")));

// Servir formulario de registro
app.get("/CrearCuenta.html", (req, res) => res.sendFile(path.join(process.cwd(), "Views/CrearCuenta.html")));

// Registrar usuario
>>>>>>> b61c6a66f50d1a1e91f68a974f67c3513384d946
app.post("/guardar-registerForm", async (req, res) => {
    try {
        const { nombres, apellidos, sexo, correo, celular, fechanacimiento, tipodocumento, numeroDocumento, contrasena } = req.body;

        const hashedPassword = await bcrypt.hash(contrasena, 10);
        const query = `
<<<<<<< HEAD
        INSERT INTO usuarios
        (nombres, apellidos, sexo, correo, celular, fechaNacimiento, tipoDocumento, numeroDocumento, contrasena)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id;
    `;
        const values = [nombres, apellidos, sexo, correo, celular, fechaNacimiento, tipoDocumento, numeroDocumento, hashedPassword];
        const r = await pool.query(query, values);
        res.status(200).json({ ok: true, id: r.rows[0].id });
=======
            INSERT INTO usuarios
            (nombres, apellidos, sexo, correo, celular, fechanacimiento, tipodocumento, numerodocumento, contrasena)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `;
        const values = [nombres, apellidos, sexo, correo, celular, fechanacimiento, tipodocumento, numeroDocumento, hashedPassword];

        await pool.query(query, values);
        res.status(200).json({ ok: true });

>>>>>>> b61c6a66f50d1a1e91f68a974f67c3513384d946
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

<<<<<<< HEAD

        if (passwordValida) {
            res.send("/Views/cotizador.html");
        } else {
            res.send("❌ Contraseña incorrecta");
        }
=======
        if (passwordValida) res.send("✅ Inicio de sesión exitoso");
        else res.send("❌ Contraseña incorrecta");
>>>>>>> b61c6a66f50d1a1e91f68a974f67c3513384d946
    } catch (error) {
        console.error(error);
        res.status(500).send("Error en el inicio de sesión");
    }
});

<<<<<<< HEAD

// ===== RUTA PARA GUARDAR COTIZACIÓN =====
app.post("/guardar-cotizacionForm", async (req, res) => {
    try {
        const {
            nombre,
            primerapellido,
            segundoapellido,
            celular,
            correo,
            monto_asegurar,
            cesion_beneficios,
            poliza,
        } = req.body;

        await pool.query(
            `
        INSERT INTO FormularioCotizacion
        (nombre, primerapellido, segundoapellido, celular, correo, monto_asegurar, cesion_beneficios, poliza)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
            [
                nombre,
                primerapellido,
                segundoapellido,
                celular,
                correo,
                monto_asegurar,
                cesion_beneficios,
                poliza,
            ]
        );

        res.send("✅ Cotización guardada correctamente en la base de datos");
    } catch (err) {
        console.error(err);
        res.status(500).send("❌ Error al guardar cotización");
=======
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
>>>>>>> b61c6a66f50d1a1e91f68a974f67c3513384d946
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

<<<<<<< HEAD

// Página principal
app.use(express.static(path.join(process.cwd(), "Views")));
=======
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
>>>>>>> b61c6a66f50d1a1e91f68a974f67c3513384d946

// Iniciar servidor
app.listen(PORT, () => console.log(`🚀 Servidor activo en http://localhost:${PORT}`));



