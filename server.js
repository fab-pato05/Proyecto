const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

const app = express();
const PORT = 3000;

// Carpeta de uploads
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer para documentos
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Archivos estáticos
app.use(express.static(path.join(__dirname, "Views")));
app.use(express.json({ limit: "10mb" }));

// Subir documento
app.post("/upload/document", upload.single("document"), (req, res) => {
    res.json({ message: "Documento guardado", file: req.file.filename });
});

// Subir selfie
app.post("/upload/selfie", (req, res) => {
    const { selfie } = req.body;
    if (!selfie) return res.status(400).json({ error: "No se envió selfie" });
    const base64Data = selfie.replace(/^data:image\/png;base64,/, "");
    const filePath = path.join(uploadDir, `selfie-${Date.now()}.png`);
    fs.writeFileSync(filePath, base64Data, "base64");
    res.json({ message: "Selfie guardada", file: filePath });
});

// 404 error 
app.use((req, res) => res.status(404).send("Página no encontrada 😢"));

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
