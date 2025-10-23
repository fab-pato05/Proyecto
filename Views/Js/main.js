// main.js - combinación de tecnologías biométricas, inteligencia artificial y análisis de comportamiento.
// Sin imports de MediaPipe - usamos clases globales
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const captureBtn = document.getElementById("captureBtn");
const submitBtn = document.getElementById("submitBtn");
const docInput = document.getElementById("docInput");
const docStatus = document.getElementById("docStatus");
const mensajeUsuario = document.getElementById("mensajeUsuario");

let rostroDetectado = false;
let documentoValido = false;
let behaviorVerified = false;
let blinkCount = 0;
let facePositions = [];
let startTime = Date.now();
let faceMesh, pose;

// === NUEVAS VARIABLES PARA VERIFICACIÓN DINÁMICA ===
let instrucciones = ["Mueve la cabeza de lado a lado", "Parpadea dos veces", "Sonríe"];
let instruccionActual = 0;
let temporizadorActivo = false;
let temporizadorInicio = false;
let accionDetectada = false;
let tiempoRestante = 5;
let parpadeosDetectados = 0;
let sonrisaDetectada = false;
let cabezaMovida = false;

// Mostrar mensajes al usuario
function mostrarMensajeUsuario(texto, tipo = "info") {
  if (mensajeUsuario) {
    mensajeUsuario.textContent = texto;
    mensajeUsuario.className =
      tipo === "error" ? "text-sm text-red-600 mt-3" : "text-sm text-gray-700 mt-3";
  } else {
    console.error("Elemento 'mensajeUsuario' no encontrado en el HTML.");
  }
}

// === NUEVAS FUNCIONES DE INSTRUCCIONES ===

// Muestra la instrucción actual en pantalla
function mostrarInstruccion() {
  if (instruccionActual < instrucciones.length) {
    mostrarMensajeUsuario(`🕓 ${instrucciones[instruccionActual]} (${tiempoRestante}s)`);
  } else {
    mostrarMensajeUsuario("✅ Verificación de acciones completada.");
    behaviorVerified = true;
    habilitarEnvio();
  }
}

// Inicia el temporizador de posicionamiento
function iniciarTemporizador() {
  if (temporizadorInicio) return;
  temporizadorInicio = true;
  tiempoRestante = 5;
  mostrarMensajeUsuario("📸 Por favor, posiciónate frente a la cámara...");

  const countdown = setInterval(() => {
    tiempoRestante--;
    if (tiempoRestante > 0) {
      mostrarMensajeUsuario(`📸 Posiciónate... (${tiempoRestante}s)`);
    } else {
      clearInterval(countdown);
      mostrarMensajeUsuario(`Comenzando verificación: ${instrucciones[0]}`);
      temporizadorActivo = true;
      mostrarInstruccion();
    }
  }, 1000);
}

// Avanza a la siguiente instrucción si se cumple
function validarAccionDetectada() {
  if (accionDetectada) {
    instruccionActual++;
    accionDetectada = false;
    if (instruccionActual < instrucciones.length) {
      mostrarInstruccion();
    } else {
      mostrarMensajeUsuario("✅ Acciones completadas correctamente.");
      behaviorVerified = true;
      habilitarEnvio();
    }
  }
}

// === FUNCIONES EXISTENTES ===

// Habilitar botón de envío
function habilitarEnvio() {
  if (documentoValido && rostroDetectado && behaviorVerified) {
    submitBtn.disabled = false;
    submitBtn.classList.remove("bg-gray-400", "cursor-not-allowed");
    submitBtn.classList.add("bg-green-600", "hover:bg-green-700");
  }
}

// Iniciar MediaPipe después de que el video esté listo
async function iniciarMediaPipe() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    video.srcObject = stream;
    await video.play();

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      console.log("Video listo, dimensiones:", canvas.width, canvas.height);
    };

    faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`
    });
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    faceMesh.onResults(onFaceResults);

    pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    pose.onResults(onPoseResults);

    const processFrame = async () => {
      await faceMesh.send({ image: video });
      await pose.send({ image: video });
      requestAnimationFrame(processFrame);
    };
    processFrame();

    mostrarMensajeUsuario("📷 Cámara iniciada correctamente.");
  } catch (err) {
    console.error("❌ Error al iniciar MediaPipe/Cámara:", err);
    mostrarMensajeUsuario("⚠️ Error al acceder a la cámara. Verifica permisos y usa localhost.", "error");
  }
}

// Resultados de Biometría Facial (MediaPipe)
function onFaceResults(results) {
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  if (results.multiFaceLandmarks) {
    rostroDetectado = true;
    for (const landmarks of results.multiFaceLandmarks) {
      drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, { color: '#00FF00', lineWidth: 1 });
      drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 2 });
    }

    // === DETECCIÓN DE ACCIONES EN TIEMPO REAL ===
    if (temporizadorActivo && results.multiFaceLandmarks) {
      const landmarks = results.multiFaceLandmarks[0];

      // --- Detección de movimiento de cabeza ---
      const nariz = landmarks[1];
      facePositions.push(nariz.x);
      if (facePositions.length > 10) facePositions.shift();

      const movimientoX = Math.max(...facePositions) - Math.min(...facePositions);
      if (!cabezaMovida && movimientoX > 0.05 && instrucciones[instruccionActual].includes("Mueve")) {
        cabezaMovida = true;
        accionDetectada = true;
        validarAccionDetectada();
      }

      // --- Detección de parpadeo ---
      const ojoIzq = [33, 160, 158, 133, 153, 144].map(i => landmarks[i]);
      const ojoDer = [263, 387, 385, 362, 380, 373].map(i => landmarks[i]);
      const earIzq = calcularEAR(ojoIzq);
      const earDer = calcularEAR(ojoDer);
      const ear = (earIzq + earDer) / 2;

      if (ear < 0.25) {
        parpadeosDetectados++;
      }

      if (parpadeosDetectados > 2 && instrucciones[instruccionActual].includes("Parpadea")) {
        accionDetectada = true;
        validarAccionDetectada();
      }

      // --- Detección de sonrisa ---
      const bocaIzq = landmarks[61];
      const bocaDer = landmarks[291];
      const labioSup = landmarks[13];
      const labioInf = landmarks[14];
      const anchoBoca = Math.hypot(bocaDer.x - bocaIzq.x, bocaDer.y - bocaIzq.y);
      const altoBoca = Math.hypot(labioInf.y - labioSup.y, labioInf.x - labioSup.x);
      const proporcion = anchoBoca / altoBoca;

      if (proporcion > 3.0 && instrucciones[instruccionActual].includes("Sonríe")) {
        sonrisaDetectada = true;
        accionDetectada = true;
        validarAccionDetectada();
      }
    }

    mostrarMensajeUsuario("✅ Rostro detectado (biometría activa).");
  }
}

// Cálculo del EAR para detección de parpadeo
function calcularEAR(ojo) {
  const vertical1 = Math.hypot(ojo[1].x - ojo[5].x, ojo[1].y - ojo[5].y);
  const vertical2 = Math.hypot(ojo[2].x - ojo[4].x, ojo[2].y - ojo[4].y);
  const horizontal = Math.hypot(ojo[0].x - ojo[3].x, ojo[0].y - ojo[3].y);
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

// Resultados de Análisis de Comportamiento (Movimiento Simple con MediaPipe Pose)
function onPoseResults(results) {
  if (results.poseLandmarks) {
    const ctx = canvas.getContext("2d");
    drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
    drawLandmarks(ctx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });

    const leftShoulder = results.poseLandmarks[11];
    const rightShoulder = results.poseLandmarks[12];
    const movement = Math.abs(leftShoulder.y - rightShoulder.y) > 0.1 ? 'Movimiento detectado' : 'Sin movimiento';
    behaviorVerified = analizarComportamiento(leftShoulder);
    mostrarMensajeUsuario(behaviorVerified ? "✅ Comportamiento humano confirmado (movimiento simple)." : "Gira o mueve para verificar...");
  }
  habilitarEnvio();
}

// Analizar comportamiento (combinado con MediaPipe)
function analizarComportamiento(facePoint) {
  facePositions.push({ x: facePoint.x, y: facePoint.y });
  if (facePositions.length > 50) facePositions.shift();

  const dx = Math.max(...facePositions.map(p => p.x)) - Math.min(...facePositions.map(p => p.x));
  const dy = Math.max(...facePositions.map(p => p.y)) - Math.min(...facePositions.map(p => p.y));

  if (dy > 5) blinkCount++;

  const elapsedTime = (Date.now() - startTime) / 1000;
  return elapsedTime > 3 && blinkCount > 0 && dx > 10 && dy > 10;
}

// Captura selfie manual
captureBtn.addEventListener("click", () => {
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  rostroDetectado = true;

  const selfieImg = document.getElementById("selfiePreviewImg");
  selfieImg.src = canvas.toDataURL();
  document.getElementById("selfiePreview").classList.remove("hidden");

  mostrarMensajeUsuario("✅ Selfie capturada correctamente.");

  if (documentoValido) {
    submitBtn.disabled = false;
    submitBtn.classList.remove("bg-gray-400", "cursor-not-allowed");
    submitBtn.classList.add("bg-green-600", "hover:bg-green-700");
  }
});

// Validación de documento con OCR + selfie (con Tesseract + SHAP)
docInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("docPreviewImg").src = e.target.result;
    document.getElementById("docPreview").classList.remove("hidden");
  };
  reader.readAsDataURL(file);

  docStatus.textContent = "⌛ Analizando documento con IA...";
  docStatus.className = "text-sm text-yellow-600 mt-1";

  try {
    const formData = new FormData();
    formData.append("doc", file);

    const response = await fetch("http://localhost:3000/verificar-identidad", {
      method: "POST",
      body: formData
    });

    const data = await response.json();
    console.log("Resultado OCR + IA + Verificación:", data);

    if (data.exito) {
      docStatus.textContent = `✅ Documento válido. Vista previa: ${data.ocr_resumen}. ${data.explicacion_ia}`;
      docStatus.className = "text-sm text-green-600 mt-1";
      documentoValido = true;
      habilitarEnvio();
    } else {
      docStatus.textContent = data.mensaje;
      docStatus.className = "text-sm text-red-600 mt-1";
      documentoValido = false;
      submitBtn.disabled = true;
    }
  } catch (err) {
    console.error("Error al analizar documento:", err);
    docStatus.textContent = "❌ Error al analizar la imagen del documento";
    docStatus.className = "text-sm text-red-600 mt-1";
  }
});

// Auto iniciar MediaPipe y el temporizador al cargar la página
window.addEventListener("load", () => {
  iniciarMediaPipe();
  iniciarTemporizador();
});
