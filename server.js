const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs"); // Para crear carpeta si no existe

const app = express();
const PORT = 3000;

// Crear carpeta "uploads" si no existe
const uploadsDir = "uploads";
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`📁 Carpeta "${uploadsDir}" creada.`);
}

// Configuración de multer (guardar en uploads/)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        let ext = path.extname(file.originalname);
        if (file.fieldname === "selfie") {
            ext = ".png"; // Siempre PNG para selfie
        }
        cb(null, Date.now() + "_" + file.fieldname + ext);
    }
});

// Filtros y límites para seguridad
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb(new Error("Tipo de archivo no permitido. Solo imágenes (JPEG, PNG) o PDF."));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máx por archivo
    fileFilter: fileFilter
});

app.use(express.static("Views")); // Sirve HTML/CSS/JS desde "Views"
app.use(express.json()); // Para parsear JSON si lo necesitas más adelante

// Ruta para verificación biométrica (coincide con frontend)
app.post("/api/verify", upload.fields([
    { name: "documento", maxCount: 1 },
    { name: "selfie", maxCount: 1 }
]), (req, res) => {
    try {
        const documento = req.files && req.files["documento"] ? req.files["documento"][0] : null;
        const selfie = req.files && req.files["selfie"] ? req.files["selfie"][0] : null;

        if (!documento || !selfie) {
            return res.status(400).json({ 
                success: false, 
                message: "Faltan archivos: Envía 'documento' y 'selfie'." 
            });
        }

        // Log en consola para debug
        console.log("✅ Archivos recibidos:");
        console.log("- Documento:", documento.filename, "(", documento.mimetype, ", ", documento.size, "bytes)");
        console.log("- Selfie:", selfie.filename, "(", selfie.mimetype, ", ", selfie.size, "bytes)");

        // Aquí podrías agregar lógica de verificación biométrica (ej: comparar caras con una lib como face-api.js)
        // Por ahora, solo guardamos y respondemos éxito

        res.status(200).json({ 
            success: true, 
            message: "¡Verificación enviada correctamente! Archivos guardados en uploads/.",
            files: {
                documento: documento.filename,
                selfie: selfie.filename
            }
        });

    } catch (error) {
        console.error("❌ Error en upload:", error);
        res.status(500).json({ 
            success: false, 
            message: "Error en el servidor: " + error.message 
        });
    }
});

// Ruta de prueba simple (opcional, para testear solo selfie si quieres)
app.post("/upload", upload.single("selfie"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No se envió ningún archivo" });
    }
    console.log("📸 Selfie recibida:", req.file.filename);
    res.json({ success: true, message: "Selfie guardada: " + req.file.filename });
});

// Manejo de errores global (opcional, para Multer)
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ success: false, message: "Archivo demasiado grande (máx 10MB)." });
        }
    }
    res.status(500).json({ success: false, message: "Error en upload: " + error.message });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`📂 Archivos se guardarán en "./uploads/"`);
});
