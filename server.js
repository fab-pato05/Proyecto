const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// Crear carpeta uploads si no existe
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// Configuración Multer (campo "selfie")
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(express.static("public"));

// Ruta de subida
app.post("/upload", upload.single("selfie"), (req, res) => {
  console.log("📸 Selfie recibida:", req.file);
  res.send("✅ Selfie subida correctamente");
});

app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));
