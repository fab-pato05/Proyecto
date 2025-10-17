// 📸 main.js — detección facial con manejo seguro de errores

// ==== ELEMENTOS DEL DOM ====
const video = document.getElementById("video");
const captureBtn = document.getElementById("captureBtn");
const submitBtn = document.getElementById("submitBtn");
const resetBtn = document.getElementById("resetBtn");
const canvas = document.getElementById("canvas");
const preview = document.getElementById("preview");
const previewImg = document.getElementById("previewImg");
const mensaje = document.getElementById("mensaje");
const statusMsg = document.getElementById("statusMsg");
const progressFill = document.getElementById("progressFill");
const overlay = document.getElementById("overlay");
const docInput = document.getElementById("docInput");
const docPreview = document.getElementById("docPreview");
const docPreviewImg = document.getElementById("docPreviewImg");
const docStatus = document.getElementById("docStatus");

// ==== FUNCIÓN AUXILIAR PARA MENSAJES VISIBLES ====
function mostrarMensajeUsuario(texto, tipo = "info") {
  mensaje.textContent = texto;
  mensaje.className = `mb-6 text-center text-sm leading-relaxed p-3 rounded-lg ${
    tipo === "error" ? "bg-red-100 text-red-700" : "bg-primary-50 text-gray-700"
  }`;
}

// ==== CARGA DE MODELOS FACE-API.JS ====
async function cargarModelos() {
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
      faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
      faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
      faceapi.nets.faceExpressionNet.loadFromUri("/models"),
    ]);
    mostrarMensajeUsuario("✅ Modelos cargados correctamente. Preparando cámara...");
    iniciarCamara();
  } catch (err) {
    console.error("❌ Error cargando modelos:", err);
    mostrarMensajeUsuario("⚠️ No se pudieron cargar los modelos de detección facial.", "error");
  }
}

// ==== INICIAR CÁMARA ====
async function iniciarCamara() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;

    await new Promise(resolve => (video.onloadedmetadata = resolve));

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    overlay.classList.remove("hidden");
    mostrarMensajeUsuario("📷 Cámara lista. Centra tu rostro dentro del marco para comenzar.");

    detectarRostroEnVivo();
  } catch (err) {
    console.error("❌ Error al acceder a la cámara:", err);
    mostrarMensajeUsuario(
      "⚠️ No se puede acceder a la cámara. Verifica los permisos y el dispositivo.",
      "error"
    );
  }
}

// ==== DETECCIÓN FACIAL EN TIEMPO REAL ====
function detectarRostroEnVivo() {
  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  faceapi.matchDimensions(canvas, displaySize);

  let framesConRostro = 0;

  setInterval(async () => {
    try {
      const detecciones = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceExpressions();

      const resizedDetections = faceapi.resizeResults(detecciones, displaySize);
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      faceapi.draw.drawDetections(canvas, resizedDetections);

      if (detecciones.length > 0) {
        framesConRostro++;
        const progreso = Math.min((framesConRostro / 15) * 100, 100);
        progressFill.style.width = `${progreso}%`;

        if (framesConRostro >= 15) {
          mostrarMensajeUsuario("✅ Rostro detectado correctamente.");
          submitBtn.disabled = false;
          submitBtn.classList.remove("bg-gray-400", "cursor-not-allowed");
          submitBtn.classList.add("bg-primary-600", "hover:bg-primary-700");
        }
      } else {
        framesConRostro = 0;
        progressFill.style.width = "0%";
        mostrarMensajeUsuario("👤 Acércate o mejora la iluminación.");
      }
    } catch (err) {
      console.error("❌ Error detectando rostro:", err);
      mostrarMensajeUsuario("⚠️ Error detectando rostro en vivo.", "error");
    }
  }, 500);
}

// ==== CAPTURAR SELFIE ====
captureBtn.addEventListener("click", () => {
  try {
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");

    previewImg.src = dataUrl;
    preview.classList.remove("hidden");
    resetBtn.classList.remove("hidden");
    mostrarMensajeUsuario("📸 Selfie capturada correctamente.");

    submitBtn.disabled = false;
    submitBtn.classList.remove("bg-gray-400", "cursor-not-allowed");
    submitBtn.classList.add("bg-primary-600", "hover:bg-primary-700");
  } catch (err) {
    console.error("❌ Error capturando selfie:", err);
    mostrarMensajeUsuario("⚠️ No se pudo capturar la selfie.", "error");
  }
});

// ==== SUBIR DOCUMENTO PARA OCR ====
docInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    docPreview.classList.remove("hidden");
    docPreviewImg.src = URL.createObjectURL(file);
    docStatus.textContent = "Procesando documento...";

    const formData = new FormData();
    formData.append("doc", file);

    const response = await fetch("/ocr", { method: "POST", body: formData });
    const data = await response.json();

    if (data.texto) {
      docStatus.textContent = "✅ Documento reconocido correctamente.";
    } else {
      docStatus.textContent = "⚠️ No se pudo leer el documento.";
    }
  } catch (err) {
    console.error("❌ Error al procesar OCR:", err);
    docStatus.textContent = "❌ Error al procesar documento.";
  }
});

// ==== ENVIAR DATOS AL BACKEND ====
submitBtn.addEventListener("click", async () => {
  statusMsg.textContent = "⏳ Verificando y enviando datos...";
  const nombre = "Usuario Demo";
  const correo = "demo@correo.com";

  try {
    const res = await fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, correo }),
    });
    const data = await res.json();
    statusMsg.textContent = `✅ Verificación completada. Bienvenido ${data.nombre}`;
  } catch (err) {
    console.error("❌ Error al registrar:", err);
    statusMsg.textContent = "❌ Error al enviar los datos al servidor.";
  }
});

// ==== REINICIAR VERIFICACIÓN ====
resetBtn.addEventListener("click", () => {
  preview.classList.add("hidden");
  resetBtn.classList.add("hidden");
  progressFill.style.width = "0%";
  mostrarMensajeUsuario("📷 Posiciónate frente a la cámara y mantén buena iluminación.");
  statusMsg.textContent = "";
  submitBtn.disabled = true;
  submitBtn.classList.add("bg-gray-400", "cursor-not-allowed");
  submitBtn.classList.remove("bg-primary-600", "hover:bg-primary-700");
});

// ==== INICIAR TODO ====
cargarModelos();

