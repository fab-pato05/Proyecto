// 🚀 Servidor Express con OCR, PostgreSQL y manejo de formularios
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Tesseract from "tesseract.js";
import { Pool } from "pg";
import cors from "cors";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import bcrypt from "bcrypt";

dotenv.config();

// Configurar rutas ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// === Middlewares ===
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === Servir archivos estáticos ===
app.use(express.static(path.join(__dirname, "Views")));
app.use("/models", express.static(path.join(__dirname, "models")));

// === Rutas GET de páginas ===
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Views/Index.html"));
});

app.get("/cotizador", (req, res) => {
    res.sendFile(path.join(__dirname, "Views", "cotizador.html"));
});

// === Configurar almacenamiento para uploads ===
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, "uploads");
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

const upload = multer({ storage });

// === OCR con Tesseract.js ===
app.post("/ocr", upload.single("doc"), async (req, res) => {
    try {
        console.log("📄 Procesando documento OCR:", req.file.path);
        const result = await Tesseract.recognize(req.file.path, "spa");
        res.json({ texto: result.data.text });
    } catch (err) {
        console.error("❌ Error en OCR:", err);
        res.status(500).json({ error: "Error al procesar OCR" });
    }
});

// === Conexión a PostgreSQL ===
const pool = new Pool({
    user: process.env.PGUSER || "postgres",
    host: process.env.PGHOST || "localhost",
    database: process.env.PGDATABASE || "circulo_seguro",
    password: process.env.PGPASSWORD || "1234",
    port: process.env.PGPORT || 5432,
});

// === Registrar usuario ===
app.post("/guardar-registerForm", async (req, res) => {
    try {
        const {
            nombres,
            apellidos,
            sexo,
            correo,
            celular,
            fechaNacimiento,
            tipoDocumento,
            numeroDocumento,
            contrasena,
        } = req.body;

        console.log("📩 Datos recibidos:", req.body);

        const hashedPassword = await bcrypt.hash(contrasena, 10);

        const query = `
            INSERT INTO usuarios 
            (nombres, apellidos, sexo, correo, celular, fechaNacimiento, tipoDocumento, numeroDocumento, contrasena)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;

        const values = [
            nombres,
            apellidos,
            sexo,
            correo,
            celular,
            fechaNacimiento,
            tipoDocumento,
            numeroDocumento,
            hashedPassword
        ];
        await pool.query(query, values);
        console.log("✅ Usuario registrado con éxito");
        // Respuesta JSON para frontend
        res.status(200).json({ ok: true });
    } catch (error) {
        console.error("❌ Error al registrar usuario:", error);
        res.status(500).json({ ok: false, message: "Error al registrar usuario" });
    }
});
// === Inicio de sesión ===
app.post("/login", async (req, res) => {
    const { correo, contrasena } = req.body;
    console.log("📩 Datos recibidos:", req.body);
    const ip = req.ip;

    try {
        const resultado = await pool.query("SELECT * FROM usuarios WHERE correo = $1", [correo]);

        if (resultado.rows.length === 0) {
            await pool.query("INSERT INTO inicios_sesion (usuario_id, ip, exito) VALUES (NULL, $1, FALSE)", [ip]);
            return res.send("❌ Usuario no encontrado");
        }

        const usuario = resultado.rows[0];
        const passwordValida = await bcrypt.compare(contrasena, usuario.contrasena);

        if (passwordValida) {
            await pool.query("INSERT INTO inicios_sesion (usuario_id, ip, exito) VALUES ($1, $2, TRUE)", [usuario.id, ip]);
            res.send("✅ Inicio de sesión exitoso");
        } else {
            await pool.query("INSERT INTO inicios_sesion (usuario_id, ip, exito) VALUES ($1, $2, FALSE)", [usuario.id, ip]);
            res.send("❌ Contraseña incorrecta");
        }
    } catch (error) {
        console.error("❌ Error en el inicio de sesión:", error);
        res.status(500).send("Error en el inicio de sesión");
    }
});

// === Guardar cotización ===
app.post("/guardar-cotizacionForm", async (req, res) => {
    console.log("📩 Datos recibidos:", req.body);
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

    try {
        await pool.query(
            `INSERT INTO FormularioCotizacion
      (nombre, primerapellido, segundoapellido, celular, correo, monto_asegurar, cesion_beneficios, poliza)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [nombre, primerapellido, segundoapellido, celular, correo, monto_asegurar, cesion_beneficios, poliza]
        );

        res.send("✅ Cotización guardada correctamente");
    } catch (err) {
        console.error("❌ Error al guardar cotización:", err);
        res.status(500).send("Error al guardar cotización");
    }
});

// === Guardar contratación ===
app.post("/guardar-contratacion", async (req, res) => {
    const { usuario_id, nombre_completo, correo, celular } = req.body;
    console.log("📩 Datos recibidos:", req.body);

    try {
        const usuarioExiste = await pool.query("SELECT * FROM usuarios WHERE id = $1", [usuario_id]);
        if (usuarioExiste.rows.length === 0) {
            return res.send("❌ El usuario no existe, no se puede registrar la contratación");
        }

        await pool.query(
            `INSERT INTO contrataciones (usuario_id, nombre_completo, correo, celular)
      VALUES ($1, $2, $3, $4)`,
            [usuario_id, nombre_completo, correo, celular]
        );

        res.send("✅ Contratación registrada correctamente y vinculada al usuario");
    } catch (error) {
        console.error("❌ Error al registrar la contratación:", error);
        res.status(500).send("Error al registrar contratación");
    }
});

// === Página principal ===
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Views/Index.html"));
});

// === Iniciar servidor ===
app.listen(PORT, () => {
    console.log(`🚀 Servidor activo en http://localhost:${PORT}`);
});
