const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Tesseract = require('tesseract.js');
const Jimp = require('jimp');

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

app.use(express.static("Views"));
app.use(express.json());

app.post("/api/verify", upload.fields([
    { name: "documento", maxCount: 1 },
    { name: "selfie", maxCount: 3 }
]), async (req, res) => {
    try {
        const documento = req.files && req.files["documento"] ? req.files["documento"][0] : null;
        const selfies = req.files && req.files["selfie"] ? req.files["selfie"] : [];

        if (!documento || selfies.length < 3) {
            return res.status(400).json({ 
                success: false, 
                message: "Faltan archivos: Envía imagen del documento y 3 selfies." 
            });
        }

        if (!documento.mimetype.startsWith('image/') || !selfies.every(s => s.mimetype.startsWith('image/'))) {
            return res.status(400).json({ 
                success: false, 
                message: "Todos los archivos deben ser imágenes." 
            });
        }

        console.log("✅ Archivos recibidos:");
        console.log("- Documento:", documento.filename, `(${documento.mimetype}, ${documento.size} bytes)`);
        selfies.forEach((s, i) => {
            console.log(`- Selfie ${i+1}:`, s.filename, `(${s.mimetype}, ${s.size} bytes)`);
        });

        const docPath = path.join(uploadsDir, documento.filename);
        const selfiePaths = selfies.map(s => path.join(uploadsDir, s.filename));

        let isMatch = false;
        let score = 0;
        let liveness = false;
        let detectionMsg = '';
        let duiText = '';

        try {
            // OCR en DUI
            const { data: { text } } = await Tesseract.recognize(docPath, 'spa', {
                logger: m => console.log(`OCR Progreso: ${m.status} (${Math.round(m.progress * 100)}%)`)
            });
            duiText = text.trim();
            console.log(`📄 Texto extraído del DUI: ${duiText.substring(0, 100)}...`);

            // Leer imágenes como buffers
            const docBuffer = fs.readFileSync(docPath);
            const selfieBuffers = selfiePaths.map(p => fs.readFileSync(p));
            const docImg = await Jimp.read(docBuffer);
            const selfieImgs = await Promise.all(selfieBuffers.map(b => Jimp.read(b)));

            // Crop región probable de cara
            const cropWidth = Math.min(200, docImg.bitmap.width - 200);
            const cropHeight = Math.min(200, docImg.bitmap.height - 200);
            const docCrop = docImg.clone().crop(100, 100, cropWidth, cropHeight);

            // Hash perceptual documento
            const docHash = docCrop.hash();

            // Distancia promedio doc-selfies
            let totalDistance = 0;
            selfieImgs.forEach(selfImg => {
                const selfCrop = selfImg.clone().crop(100, 100, cropWidth, cropHeight);
                const selfHash = selfCrop.hash();
                const dist = Jimp.distance(docHash, selfHash);
                totalDistance += dist;
            });
            const avgDistance = totalDistance / selfieImgs.length;

            // Score similitud
            score = Math.max(0, 100 - (avgDistance * 5));
            isMatch = score > 70;

            // Detección básica de liveness: diferencias entre selfies
            let diffSum = 0;
            for (let i = 0; i < selfieImgs.length - 1; i++) {
                const hash1 = selfieImgs[i].clone().crop(100, 100, cropWidth, cropHeight).hash();
                const hash2 = selfieImgs[i + 1].clone().crop(100, 100, cropWidth, cropHeight).hash();
                diffSum += Jimp.distance(hash1, hash2);
            }
            const avgDiff = diffSum / (selfieImgs.length - 1);
            liveness = avgDiff > 0.05; // Umbral ajustable

            detectionMsg = `Texto DUI procesado y caras comparadas automáticamente.`;

            console.log(`🤖 Resultado: Similitud ${score.toFixed(1)}% | Coincide? ${isMatch} | Distancia promedio: ${avgDistance.toFixed(3)} | Liveness: ${liveness ? 'Alta' : 'Baja'} (avgDiff=${avgDiff.toFixed(3)})`);

        } catch (iaError) {
            console.error('❌ Error en IA JS:', iaError);
            detectionMsg = 'Error en procesamiento IA. Archivos guardados para revisión.';
            isMatch = false;
            score = 0;
            liveness = false;
        }

        res.status(200).json({
            success: true,
            message: `${detectionMsg} ${isMatch ? `✅ Identidad confirmada: ${score.toFixed(1)}% similitud.` : `❌ Identidad no confirmada: ${score.toFixed(1)}% similitud.`}`,
            match: isMatch,
            score: score,
            liveness: liveness,
            duiText: duiText,
            files: {
                documento: documento.filename,
                selfies: selfies.map(s => s.filename)
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
