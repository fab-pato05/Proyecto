document.addEventListener("DOMContentLoaded", () => {
  // TODO: todo tu código de eventos y manipulación del DOM
  const captureBtn = document.getElementById("captureBtn");
  if (captureBtn) {
    captureBtn.addEventListener("click", () => {
      console.log("Botón selfie clickeado");
    });
  }
});

// Js/main.js  (cargar como <script type="module">)
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const captureBtn = document.getElementById("captureBtn");
const submitBtn = document.getElementById("submitBtn");
const docInput = document.getElementById("docInput");
const docStatus = document.getElementById("docStatus");
const mensajeUsuario = document.getElementById("mensajeUsuario");
const selfiePreviewImg = document.getElementById("selfiePreviewImg");
const selfiePreview = document.getElementById("selfiePreview");

let rostroDetectado = false;
let documentoValido = false;
let behaviorVerified = false;
let facePositions = [];
let faceMesh, pose;

// Recording
let mediaRecorder;
let recordedBlobs = [];

// Actions (challenges)
let instrucciones = [];
let instruccionActual = 0;
let accionesRegistro = []; // {action, requestedAt, performedAt, success}

// Helper UI
function mostrarMensajeUsuario(texto, tipo = "info") {
  if (mensajeUsuario) {
    mensajeUsuario.textContent = texto;
    mensajeUsuario.className = tipo === "error" ? "text-sm text-red-600 mt-3" : "text-sm text-gray-700 mt-3";
  } else console.error("mensajeUsuario no encontrado");
}

// Genera 3 instrucciones aleatorias
function generarInstruccionesAleatorias() {
  const pool = ["Mueve la cabeza de lado a lado", "Parpadea dos veces", "Sonríe", "Inclina la cabeza a la derecha", "Mira arriba"];
  const shuffled = pool.sort(() => Math.random() - 0.5);
  instrucciones = shuffled.slice(0, 3);
  instruccionActual = 0;
}

// Registrar acciones solicitadas y realizadas
function registrarAccionSolicitada(action) {
  accionesRegistro.push({ action, requestedAt: new Date().toISOString(), performedAt: null, success: false });
}
function marcarAccionRealizada(success = true) {
  const last = accionesRegistro[accionesRegistro.length - 1];
  if (!last) return;
  last.performedAt = new Date().toISOString();
  last.success = !!success;
}

// Device info
function deviceInfo() {
  return { userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language };
}

// MediaRecorder controls
function startRecording() {
  recordedBlobs = [];
  let options = { mimeType: 'video/webm;codecs=vp9' };
  try {
    mediaRecorder = new MediaRecorder(video.srcObject, options);
  } catch (e) {
    mediaRecorder = new MediaRecorder(video.srcObject);
  }
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedBlobs.push(e.data);
  };
  mediaRecorder.start();
}
function stopRecording() {
  return new Promise(resolve => {
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedBlobs, { type: 'video/webm' });
      resolve(blob);
    };
    mediaRecorder.stop();
  });
}

// Validación doc local
docInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!["image/jpeg","image/png"].includes(file.type) || file.size > 6*1024*1024) {
    mostrarMensajeUsuario("Archivo no válido. Usa JPG/PNG menores a 6MB.", "error");
    docStatus.textContent = "";
    documentoValido = false;
    return;
  }
  // preview
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById("docPreviewImg").src = ev.target.result;
    document.getElementById("docPreview").classList.remove("hidden");
  };
  reader.readAsDataURL(file);
  docStatus.textContent = "⌛ Listo para análisis (sube y verifica).";
  docStatus.className = "text-sm text-yellow-600 mt-1";
  documentoValido = true;
  habilitarEnvio();
});

// habilitar boton enviar
function habilitarEnvio() {
  if (documentoValido && rostroDetectado && behaviorVerified) {
    submitBtn.disabled = false;
    submitBtn.classList.remove("bg-gray-400", "cursor-not-allowed");
    submitBtn.classList.add("bg-green-600", "hover:bg-green-700");
  }
}

// iniciar MediaPipe y loop
async function iniciarMediaPipe() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    video.srcObject = stream;
    await video.play();

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    };

    // assume FaceMesh and Pose libs loaded in HTML via CDN
    faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`
    });
    faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    faceMesh.onResults(onFaceResults);

    pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}` });
    pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    pose.onResults(onPoseResults);

    const processFrame = async () => {
      if (video.readyState >= 2) {
        await faceMesh.send({ image: video });
        await pose.send({ image: video });
      }
      requestAnimationFrame(processFrame);
    };
    processFrame();

    mostrarMensajeUsuario("📷 Cámara iniciada correctamente.");
  } catch (err) {
    console.error("Error iniciar cámara:", err);
    mostrarMensajeUsuario("No se pudo acceder a la cámara. Revisa permisos.", "error");
  }
}

// EAR calculation (parpadeo)
function calcularEAR(ojo) {
  const vertical1 = Math.hypot(ojo[1].x - ojo[5].x, ojo[1].y - ojo[5].y);
  const vertical2 = Math.hypot(ojo[2].x - ojo[4].x, ojo[2].y - ojo[4].y);
  const horizontal = Math.hypot(ojo[0].x - ojo[3].x, ojo[0].y - ojo[3].y);
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

// FaceMesh results handler (landmarks + action detection)
function onFaceResults(results) {
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (results.image) ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    rostroDetectado = true;
    const landmarks = results.multiFaceLandmarks[0];

    // dibujar landmarks
    drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, { color: '#00FF00', lineWidth: 1 });
    drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 1 });

    // push nariz.x para movimiento de cabeza
    const nose = landmarks[1];
    facePositions.push(nose.x);
    if (facePositions.length > 20) facePositions.shift();

    // acción actual
    const currentInstruction = instrucciones[instruccionActual];

    // detectar movimiento de cabeza
    const movimientoX = Math.max(...facePositions) - Math.min(...facePositions);
    if (currentInstruction && currentInstruction.includes("Mueve") && movimientoX > 0.06) {
      marcarAccionRealizada(true);
      instruccionActual++;
      if (instruccionActual < instrucciones.length) {
        registrarAccionSolicitada(instrucciones[instruccionActual]);
        mostrarMensajeUsuario(instrucciones[instruccionActual]);
      } else {
        behaviorVerified = true;
        mostrarMensajeUsuario("✅ Acciones completadas correctamente.");
        habilitarEnvio();
      }
    }

    // detectar parpadeo
    const ojoIzq = [33, 160, 158, 133, 153, 144].map(i => landmarks[i]);
    const ojoDer = [263, 387, 385, 362, 380, 373].map(i => landmarks[i]);
    const ear = (calcularEAR(ojoIzq) + calcularEAR(ojoDer)) / 2;
    if (currentInstruction && currentInstruction.includes("Parpade") && ear < 0.22) {
      marcarAccionRealizada(true);
      instruccionActual++;
      if (instruccionActual < instrucciones.length) {
        registrarAccionSolicitada(instrucciones[instruccionActual]);
        mostrarMensajeUsuario(instrucciones[instruccionActual]);
      } else {
        behaviorVerified = true;
        mostrarMensajeUsuario("✅ Acciones completadas correctamente.");
        habilitarEnvio();
      }
    }

    // detectar sonrisa (heurística)
    const bocaIzq = landmarks[61];
    const bocaDer = landmarks[291];
    const labioSup = landmarks[13];
    const labioInf = landmarks[14];
    const anchoBoca = Math.hypot(bocaDer.x - bocaIzq.x, bocaDer.y - bocaIzq.y);
    const altoBoca = Math.hypot(labioInf.y - labioSup.y, labioInf.x - labioSup.x);
    const proporcion = anchoBoca / (altoBoca + 1e-6);
    if (currentInstruction && currentInstruction.includes("Sonríe") && proporcion > 2.5) {
      marcarAccionRealizada(true);
      instruccionActual++;
      if (instruccionActual < instrucciones.length) {
        registrarAccionSolicitada(instrucciones[instruccionActual]);
        mostrarMensajeUsuario(instrucciones[instruccionActual]);
      } else {
        behaviorVerified = true;
        mostrarMensajeUsuario("✅ Acciones completadas correctamente.");
        habilitarEnvio();
      }
    }

    mostrarMensajeUsuario("✅ Rostro detectado (biometría activa).");
  } else {
    // no face
    mostrarMensajeUsuario("No se detecta rostro. Ajusta iluminación y posición.", "error");
  }
  ctx.restore();
}

// Pose handler (aux para comportamiento)
function onPoseResults(results) {
  if (results.poseLandmarks) {
    const leftShoulder = results.poseLandmarks[11];
    const rightShoulder = results.poseLandmarks[12];
    // simple check
    if (leftShoulder && rightShoulder) {
      const dx = Math.abs(leftShoulder.x - rightShoulder.x);
      const dy = Math.abs(leftShoulder.y - rightShoulder.y);
      // heuristic: small movement over time -> human
      if (dx > 0.02 || dy > 0.02) {
        // keep as supportive evidence
      }
    }
  }
  habilitarEnvio();
}

// Capture selfie button: capture current frame and show preview
captureBtn.addEventListener("click", () => {
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  rostroDetectado = true;
  selfiePreviewImg.src = canvas.toDataURL();
  selfiePreview.classList.remove("hidden");
  mostrarMensajeUsuario("✅ Selfie capturada correctamente.");
  habilitarEnvio();
});

// Orquesta completa: generar instrucciones, grabar, esperar acciones y enviar al backend
async function iniciarFlujoVerificacion() {
  if (!documentoValido) { mostrarMensajeUsuario("Sube primero tu documento.", "error"); return; }
  generarInstruccionesAleatorias();
  accionesRegistro = [];
  registrarAccionSolicitada(instrucciones[0]);
  mostrarMensajeUsuario(`Sigue las instrucciones: ${instrucciones.join(' • ')}`);
  startRecording();
  // esperar hasta que behaviorVerified o timeout
  const timeoutAt = Date.now() + 25_000; // 25s
  while (!behaviorVerified && Date.now() < timeoutAt) {
    await new Promise(r => setTimeout(r, 400));
  }
  // stop recording
  const videoBlob = await stopRecording();
  // enviar
  await enviarVerificacion(videoBlob);
}

// enviar verificación al backend
async function enviarVerificacion(videoBlob) {
  try {
    const file = docInput.files[0];
    if (!file) { mostrarMensajeUsuario("Documento no encontrado", "error"); return; }
    const fd = new FormData();
    fd.append("doc", file);
    fd.append("video", videoBlob, `selfie-${Date.now()}.webm`);
    fd.append("acciones", JSON.stringify(accionesRegistro));
    fd.append("device", JSON.stringify(deviceInfo()));
    // opcional: user_id o user_email
    // fd.append("user_id", window.currentUserId || "");
    mostrarMensajeUsuario("Enviando verificación...");
    const resp = await fetch("http://localhost:3000/verificar-identidad", { method: "POST", body: fd });
    const data = await resp.json();
    console.log("Respuesta verificación:", data);
    if (data.exito) {
      mostrarMensajeUsuario("✅ Verificación completada: " + (data.mensaje || "Éxito"));
      docStatus.textContent = `Resultado: ${data.mensaje}`;
      docStatus.className = "text-sm text-green-600 mt-1";
    } else {
      mostrarMensajeUsuario("❌ " + (data.mensaje || "Fallo en verificación"), "error");
      docStatus.textContent = data.mensaje || "Fallo";
      docStatus.className = "text-sm text-red-600 mt-1";
    }

    // enviar registro de intento adicional
    const intento = {
      user_id: window.currentUserId || null,
      resultado: data.exito ? "éxito" : "fallo",
      ocr_resumen: data.ocr_resumen || null,
      explicacion_ia: data.explicacion_ia || null,
      acciones: accionesRegistro,
      device: deviceInfo()
    };
    await fetch("http://localhost:3000/registro-intento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(intento)
    });
  } catch (err) {
    console.error("Error enviar verificación:", err);
    mostrarMensajeUsuario("Error al enviar la verificación", "error");
  }
}

// Submit btn: inicia flujo completo (record + actions + enviar)
submitBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  await iniciarFlujoVerificacion();
  // re-enable after short delay
  setTimeout(() => { submitBtn.disabled = false; }, 2000);
});

// auto iniciar al cargar
window.addEventListener("load", async () => {
  await iniciarMediaPipe();
  generarInstruccionesAleatorias();
  registrarAccionSolicitada(instrucciones[0]);
});


