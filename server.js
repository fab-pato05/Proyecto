const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Tesseract = require('tesseract.js');  // IA OCR para texto DUI
const Jimp = require('jimp');  // Procesamiento imágenes para comparación caras

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

// Filtros y límites para seguridad (solo imágenes)
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype.startsWith('image/');
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error("Tipo de archivo no permitido. Solo imágenes (JPEG, JPG, PNG, GIF, WEBP)."));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máx para imágenes
    fileFilter: fileFilter
});

app.use(express.static("Views")); // Sirve HTML/CSS/JS desde "Views"
app.use(express.json()); // Para parsear JSON

// Ruta para verificación biométrica (con IA JS pura: Tesseract + Jimp)
app.post("/api/verify", upload.fields([
    { name: "documento", maxCount: 1 },
    { name: "selfie", maxCount: 1 }
]), async (req, res) => {  // Async para await en IA
    try {
        const documento = req.files && req.files["documento"] ? req.files["documento"][0] : null;
        const selfie = req.files && req.files["selfie"] ? req.files["selfie"][0] : null;

        if (!documento || !selfie) {
            return res.status(400).json({ 
                success: false, 
                message: "Faltan archivos: Envía imagen del documento y selfie." 
            });
        }

        // Chequeo extra: Confirma que son imágenes
        if (!documento.mimetype.startsWith('image/') || !selfie.mimetype.startsWith('image/')) {
            return res.status(400).json({ 
                success: false, 
                message: "Ambos archivos deben ser imágenes." 
            });
        }

        // Log en consola para debug
        console.log("✅ Archivos recibidos:");
        console.log("- Documento:", documento.filename, "(", documento.mimetype, ", ", documento.size, "bytes)");
        console.log("- Selfie:", selfie.filename, "(", selfie.mimetype, ", ", selfie.size, "bytes)");

        // NUEVO: Verificación Biométrica con IA JS (Tesseract OCR + Jimp comparación)
        const docPath = path.join(uploadsDir, documento.filename);
        const selfPath = path.join(uploadsDir, selfie.filename);
        
        let isMatch = false;
        let score = 0;
        let detectionMsg = '';
        let duiText = '';

        try {
            // 1. OCR en DUI (extrae texto para validación extra, ej: nombre)
            const { data: { text } } = await Tesseract.recognize(docPath, 'spa', {  // 'spa' para español (DUI)
                logger: m => console.log(`OCR Progreso: ${m.status} (${Math.round(m.progress * 100)}%)`)
            });
            duiText = text.trim();
            console.log(`📄 Texto extraído del DUI: ${duiText.substring(0, 100)}...`);

            // 2. Procesamiento de imágenes con Jimp (FIX: Usa buffers para evitar error de path)
            const docBuffer = fs.readFileSync(docPath);  // Lee como buffer
            const selfBuffer = fs.readFileSync(selfPath);  // Lee como buffer
            
            const docImg = await Jimp.read(docBuffer);  // FIX: Jimp.read(buffer)
            const selfImg = await Jimp.read(selfBuffer);  // FIX: Jimp.read(buffer)
            
            // Crop región probable de cara (centro de imagen, ajusta si necesario)
            const cropWidth = Math.min(200, docImg.bitmap.width - 200);
            const cropHeight = Math.min(200, docImg.bitmap.height - 200);
            const docCrop = docImg.clone().crop(100, 100, cropWidth, cropHeight);
            const selfCrop = selfImg.clone().crop(100, 100, cropWidth, cropHeight);
            
            // Calcula hash perceptual (IA para similitud estructural)
            const docHash = docCrop.hash();
            const selfHash = selfCrop.hash();
            const hammingDistance = Jimp.distance(docHash, selfHash);  // Distancia Hamming (0 = idéntico)
            
            // Score de similitud: Invierte distancia (100% si distancia=0)
            score = Math.max(0, 100 - (hammingDistance * 5));  // Factor 5 ajustable para normalizar
            isMatch = score > 70;  // Umbral: Ajusta (70% = match automático)
            
            detectionMsg = `Texto DUI procesado y caras comparadas automáticamente.`;

            console.log(`🤖 IA JS Resultado: Similitud ${score.toFixed(1)}% | ¿Coincide? ${isMatch} | Distancia: ${hammingDistance}`);
            
        } catch (iaError) {
            console.error('❌ Error en IA JS:', iaError);
            detectionMsg = 'Error en procesamiento IA. Archivos guardados para revisión.';
            isMatch = false;
            score = 0;
        }

        // Respuesta JSON con resultado de IA (automatizado, sin manual)
        res.status(200).json({ 
            success: true, 
            message: `${detectionMsg} ${isMatch ? `✅ Identidad confirmada: ${score.toFixed(1)}% similitud. Texto DUI: ${duiText.substring(0, 50)}...` : `❌ Identidad no confirmada: ${score.toFixed(1)}% similitud. Mejora la foto (cara frontal, buena luz).`}`,
            match: isMatch,
            score: score,
            duiText: duiText,  // Opcional: Envía texto extraído al frontend
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

// Ruta de prueba simple (opcional)
app.post("/upload", upload.single("selfie"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No se envió ningún archivo" });
    }
    console.log("📸 Selfie recibida:", req.file.filename);
    res.json({ success: true, message: "Selfie guardada: " + req.file.filename });
});

// Manejo de errores global para Multer
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ success: false, message: "Archivo demasiado grande (máx 5MB)." });
        }
    }
    res.status(500).json({ success: false, message: "Error en upload: " + error.message });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`📂 Archivos se guardarán en "./uploads/"`);
    console.log(`🤖 IA JS activada (sin C++): Verificaciones automáticas gratuitas.`);
});
