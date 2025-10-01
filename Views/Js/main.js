
// Referencias a elementos
const video = document.getElementById('video');
const captureBtn = document.getElementById('captureBtn');
const canvas = document.getElementById('canvas');
const selfieStatus = document.getElementById('selfieStatus');
const submitBtn = document.getElementById('submitBtn');
const statusMsg = document.getElementById('statusMsg');

// Solicitar acceso a la cámara y mostrar el video
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = stream;
        video.play();
        statusMsg.classList.add('hidden');
    } catch (err) {
        statusMsg.textContent = 'No se pudo acceder a la cámara: ' + err.message;
        statusMsg.classList.remove('hidden');
    }
}

// Capturar la imagen del video y mostrarla en el canvas
function captureSelfie() {
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.classList.remove('hidden');
    selfieStatus.classList.remove('hidden');
    submitBtn.disabled = false; // Habilitar botón para enviar
}

// Iniciar cámara al cargar la página
window.addEventListener('load', startCamera);

// Evento para capturar selfie al hacer click en el botón
captureBtn.addEventListener('click', captureSelfie);

