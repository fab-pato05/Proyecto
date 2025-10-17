// main.js — Detección facial con manejo seguro de errores
// ==== ELEMENTOS DEL DOM ====
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const overlay = document.getElementById("overlay");
const captureBtn = document.getElementById("captureBtn");
const submitBtn = document.getElementById("submitBtn");
const docInput = document.getElementById("docInput");
const docPreview = document.getElementById("docPreview");
const docPreviewImg = document.getElementById("docPreviewImg");
const docStatus = document.getElementById("docStatus");
const mensajeUsuario = document.getElementById("mensajeUsuario");

// ==== ESTADOS ====
let documentoValido = false;
let rostroDetectado = false;

// ==== MOSTRAR MENSAJES AL USUARIO ====
function mostrarMensajeUsuario(texto, tipo = "info") {
  mensajeUsuario.textContent = texto;
  mensajeUsuario.className =
    tipo === "error"
      ? "text-sm text-red-600 mt-3"
      : "text-sm text-gray-700 mt-3";
}

// ==== HABILITAR BOTÓN DE ENVÍO ====
function habilitarEnvio() {
  if (documentoValido && rostroDetectado) {
    submitBtn.disabled = false;
    submitBtn.classList.remove("bg-gray-400", "cursor-not-allowed");
    submitBtn.classList.add("bg-green-600", "hover:bg-green-700");
  }
}

// ==== INICIAR CÁMARA ====
async function iniciarCamara() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("API de cámara no disponible en este navegador.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    overlay.classList.remove("hidden");
    mostrarMensajeUsuario("📷 Cámara lista. Centra tu rostro dentro del marco.");

    detectarRostroEnVivo();
  } catch (err) {
    console.error("❌ Error al acceder a la cámara:", err);
    mostrarMensajeUsuario(
      "⚠️ No se pudo acceder a la cámara. Usa un servidor local (http://localhost) y permite el acceso.",
      "error"
    );
  }
}

// ==== DETECCIÓN FACIAL EN TIEMPO REAL ====
async function detectarRostroEnVivo() {
  await faceapi.nets.tinyFaceDetector.loadFromUri("/models");

  const ctx = canvas.getContext("2d");

  const interval = setInterval(async () => {
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (detections.length > 0) {
      rostroDetectado = true;
      mostrarMensajeUsuario("✅ Rostro detectado correctamente.");
      clearInterval(interval);
      habilitarEnvio();
    }
  }, 800);
}

// ==== CAPTURA SELFIE MANUAL ====
captureBtn.addEventListener("click", () => {
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataURL = canvas.toDataURL("image/png");

  console.log("📸 Selfie capturada:", dataURL.substring(0, 30) + "...");
  rostroDetectado = true;
  mostrarMensajeUsuario("✅ Selfie capturada correctamente.");
  habilitarEnvio();
});

// ==== VALIDACIÓN DE DOCUMENTO (OCR LOCAL) ====
docInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  docPreview.classList.remove("hidden");
  docPreviewImg.src = URL.createObjectURL(file);
  docStatus.textContent = "🕓 Analizando documento...";
  docStatus.className = "text-sm text-gray-500 mt-1";

  // Validar tipo de archivo
  const allowedTypes = ["image/jpeg", "image/png"];
  if (!allowedTypes.includes(file.type)) {
    docStatus.textContent = "❌ Solo se permiten imágenes JPG o PNG.";
    docStatus.className = "text-sm text-red-600 mt-1";
    docInput.value = "";
    return;
  }

  try {
    const result = await Tesseract.recognize(URL.createObjectURL(file), "spa");
    const text = result.data.text.toUpperCase();

    console.log("Texto detectado:", text);

    if (text.includes("DUI") || text.includes("PASAPORTE") || text.includes("EL SALVADOR")) {
      docStatus.textContent = "✅ Documento reconocido correctamente.";
      docStatus.className = "text-sm text-green-600 mt-1";
      documentoValido = true;
      habilitarEnvio();
    } else {
      docStatus.textContent = "❌ No se detectó un documento de identidad o pasaporte.";
      docStatus.className = "text-sm text-red-600 mt-1";
      docInput.value = "";
    }
  } catch (err) {
    console.error("❌ Error en OCR:", err);
    docStatus.textContent = "❌ Error al analizar la imagen.";
    docStatus.className = "text-sm text-red-600 mt-1";
  }
});

// ==== INICIO AUTOMÁTICO ====
window.addEventListener("load", iniciarCamara);

