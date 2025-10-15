// 🚀 Servidor Express con OCR y PostgreSQL
// Face-api.js ahora se ejecuta en el frontend (navegador)

import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Tesseract from "tesseract.js";
import { Pool } from "pg";
import cors from "cors";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// Configurar rutas ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// === Servir archivos estáticos ===
app.use(express.static(path.join(__dirname, "Views")));  // HTML, CSS, JS
app.use("/models", express.static(path.join(__dirname, "models"))); // modelos Face-API

// 📂 Configurar almacenamiento para uploads
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

// 🧾 OCR con Tesseract.js
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

// 🗄️ Conexión a PostgreSQL
const pool = new Pool({
    user: process.env.PGUSER || "postgres",
    host: process.env.PGHOST || "localhost",
    database: process.env.PGDATABASE || "circulo_seguro",
    password: process.env.PGPASSWORD || "1234",
    port: process.env.PGPORT || 5432,
});

// 💾 Registrar usuario
app.post("/register", async (req, res) => {
    const { nombre, correo } = req.body;
    try {
        const result = await pool.query(
            "INSERT INTO usuarios (nombre, correo) VALUES ($1, $2) RETURNING *",
            [nombre, correo]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error("❌ Error al insertar usuario:", err);
        res.status(500).json({ error: "Error en la base de datos" });
    }
});
// === Ruta principal ===
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Views/Index.html"));
});

// 🟢 Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor activo en http://localhost:${PORT}`);
});
