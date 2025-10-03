// Elementos del DOM (mismo que antes)
const video = document.getElementById('video');
const captureBtn = document.getElementById('captureBtn');
const canvas = document.getElementById('canvas');
const canvasContext = canvas.getContext('2d');
const docInput = document.getElementById('docInput');
const submitBtn = document.getElementById('submitBtn');
const preview = document.getElementById('preview');
const previewImg = document.getElementById('previewImg');
const docStatus = document.getElementById('docStatus');
const statusMsg = document.getElementById('statusMsg');
const mensaje = document.getElementById('mensaje');

let stream = null;
let selfieBlob = null;
let docFile = null;

// Función para inicializar cámara con mejor manejo de errores
async function initCamera() {
  try {
    // Removí facingMode para compatibilidad; agrega { facingMode: 'user' } si quieres frontal obligatoria
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } }
    });
    stream = mediaStream;
    video.srcObject = stream;

    // Espera a que el video cargue y reproduzca
    video.onloadedmetadata = () => {
      video.play().catch(e => console.error('Error al reproducir video:', e));
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      statusMsg.textContent = '✅ Cámara activada en tiempo real. Posiciónate y captura.';
      mensaje.textContent = 'Mírate en la pantalla. Asegúrate de buena iluminación.';
    };

    video.onerror = () => {
      statusMsg.textContent = '❌ Error en video. Verifica conexión.';
    };

    console.log('🎥 Cámara inicializada correctamente.');
  } catch (error) {
    console.error('Error al acceder a la cámara:', error);
    let errorMsg = 'Error en cámara: ';
    if (error.name === 'NotAllowedError') {
      errorMsg += 'Permiso denegado. Permite acceso en el navegador.';
    } else if (error.name === 'NotFoundError') {
      errorMsg += 'No se encontró cámara. Usa un dispositivo con webcam.';
    } else if (error.name === 'NotSupportedError') {
      errorMsg += 'Cámara no soportada. Prueba en Chrome/Firefox.';
    } else {
      errorMsg += error.message;
    }
    statusMsg.textContent = errorMsg;
    mensaje.textContent = 'No se puede usar la cámara. Carga la página en HTTPS (usa ngrok si es local).';
  }
}

// Inicializar cámara al cargar la página
document.addEventListener('DOMContentLoaded', initCamera);

// Resto del código igual (manejo de docInput, captureBtn, checkReadyToSubmit, submitBtn)
docInput.addEventListener('change', function (e) {
  docFile = e.target.files[0];
  if (docFile) {
    docStatus.textContent = `Archivo seleccionado: ${docFile.name} (${(docFile.size / 1024 / 1024).toFixed(2)} MB)`;
    docStatus.className = 'mt-1 text-xs text-green-600';
    checkReadyToSubmit();
  } else {
    docStatus.textContent = '';
  }
});

captureBtn.addEventListener('click', function () {
  if (stream && video.videoWidth > 0) {  // Chequeo extra para video listo
    canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(function (blob) {
      selfieBlob = blob;
      previewImg.src = URL.createObjectURL(blob);
      preview.classList.remove('hidden');
      video.pause();  // Pausa para ahorrar batería
      mensaje.textContent = '📸 Selfie capturada. Ahora confirma con el DUI.';
      statusMsg.textContent = 'Selfie lista. Sube el DUI para verificar.';
      checkReadyToSubmit();
    }, 'image/png');
  } else {
    statusMsg.textContent = '❌ Video no listo. Espera o reinicia.';
  }
});

function checkReadyToSubmit() {
  if (docFile && selfieBlob) {
    submitBtn.disabled = false;
    submitBtn.className = 'mt-3 w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition cursor-pointer';
    mensaje.textContent = '¡Listo! Envía para confirmar identidad con el DUI.';
  }
}

submitBtn.addEventListener('click', function () {
  if (!docFile || !selfieBlob) return;

  submitBtn.disabled = true;  // Deshabilita temporalmente para evitar doble envío
  submitBtn.className = 'mt-3 w-full bg-gray-400 text-white py-2 rounded-lg cursor-not-allowed';
  statusMsg.textContent = 'Enviando...';

  const formData = new FormData();
  formData.append('documento', docFile);
  formData.append('selfie', selfieBlob, 'selfie.png');

  fetch('/api/verify', {
    method: 'POST',
    body: formData
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        statusMsg.textContent = `✅ ${data.message}. Archivos: ${data.files.documento} y ${data.files.selfie}`;
        mensaje.textContent = 'Identidad confirmada (simulada). Revisa uploads/ en el servidor.';
        // NO deshabilito permanentemente; solo temporal. Si quieres resetear, agrega botón "Nuevo"
      } else {
        statusMsg.textContent = `❌ ${data.message}`;
        submitBtn.disabled = false;  // Rehabilita si error
        submitBtn.className = 'mt-3 w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition cursor-pointer';
      }
    })
    .catch(error => {
      console.error('Error en envío:', error);
      statusMsg.textContent = '❌ Error de red. Verifica el servidor.';
      submitBtn.disabled = false;  // Rehabilita en error
      submitBtn.className = 'mt-3 w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition cursor-pointer';
    });
});

// Limpiar stream
window.addEventListener('beforeunload', function () {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
});
