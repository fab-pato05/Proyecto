// Elementos del DOM
const video = document.getElementById('video');
const captureBtn = document.getElementById('captureBtn');
const canvas = document.getElementById('canvas');
const canvasContext = canvas.getContext('2d');
const docInput = document.getElementById('docInput');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');
const preview = document.getElementById('preview');
const previewImg = document.getElementById('previewImg');
const docPreview = document.getElementById('docPreview');
const docPreviewImg = document.getElementById('docPreviewImg');
const docStatus = document.getElementById('docStatus');
const statusMsg = document.getElementById('statusMsg');
const mensaje = document.getElementById('mensaje');

let stream = null;
let selfieBlob = null;
let docFile = null;

// Función para inicializar cámara con mejor manejo de errores
async function initCamera() {
    try {
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
            statusMsg.className = 'mt-4 text-sm text-center text-green-600 leading-relaxed';
            mensaje.textContent = 'Mírate en la pantalla. Asegúrate de buena iluminación.';
        };

        video.onerror = () => {
            statusMsg.textContent = '❌ Error en video. Verifica conexión.';
            statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
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
        statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
        mensaje.textContent = 'No se puede usar la cámara. Carga la página en HTTPS (usa ngrok si es local).';
    }
}

// Inicializar cámara al cargar la página
document.addEventListener('DOMContentLoaded', initCamera);

// Manejo del input de documento (validación para imágenes y preview)
docInput.addEventListener('change', function (e) {
    docFile = e.target.files[0];
    if (docFile) {
        // Validación extra: Confirma que es imagen
        if (!docFile.type.startsWith('image/')) {
            statusMsg.textContent = '❌ Error: Solo se permiten imágenes (JPG, PNG, etc.).';
            statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
            docInput.value = '';  // Limpia el input
            docFile = null;
            docPreview.classList.add('hidden'); // Oculta preview
            return;
        }

        // Chequea tamaño (<5MB)
        if (docFile.size > 5 * 1024 * 1024) {
            statusMsg.textContent = '❌ Error: Imagen demasiado grande (máx 5MB).';
            statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
            docInput.value = '';
            docFile = null;
            docPreview.classList.add('hidden');
            return;
        }

        // Muestra preview del documento
        docPreviewImg.src = URL.createObjectURL(docFile);
        docPreview.classList.remove('hidden');

        docStatus.textContent = `Imagen seleccionada: ${docFile.name} (${(docFile.size / 1024 / 1024).toFixed(2)} MB)`;
        docStatus.className = 'mt-1 text-xs text-green-600';
        statusMsg.textContent = '';  // Limpia errores previos
        statusMsg.className = 'mt-4 text-sm text-center text-gray-600 leading-relaxed';
        checkReadyToSubmit();
    } else {
        docStatus.textContent = '';
        docPreview.classList.add('hidden');
    }
});

// Capturar selfie
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
            statusMsg.className = 'mt-4 text-sm text-center text-green-600 leading-relaxed';
            checkReadyToSubmit();
        }, 'image/png');
    } else {
        statusMsg.textContent = '❌ Video no listo. Espera o reinicia.';
        statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
    }
});

// Verificar si está listo para submit
function checkReadyToSubmit() {
    if (docFile && selfieBlob) {
        submitBtn.disabled = false;
        submitBtn.className = 'mt-4 w-full bg-primary-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-colors cursor-pointer shadow-md';
        mensaje.textContent = '¡Listo! Envía para confirmar identidad con IA.';
    } else {
        submitBtn.disabled = true;
        submitBtn.className = 'mt-4 w-full bg-gray-400 text-white py-3 px-4 rounded-lg font-semibold cursor-not-allowed hover:bg-gray-500 focus:outline-none transition-colors';
    }
}

// Enviar al servidor (con IA)
submitBtn.addEventListener('click', function () {
    if (!docFile || !selfieBlob) return;

    submitBtn.disabled = true;  // Deshabilita temporalmente
    submitBtn.className = 'mt-4 w-full bg-gray-400 text-white py-3 px-4 rounded-lg font-semibold cursor-not-allowed hover:bg-gray-500 focus:outline-none transition-colors';
    statusMsg.textContent = 'Enviando a IA para verificación...';
    statusMsg.className = 'mt-4 text-sm text-center text-blue-600 leading-relaxed';

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
            const resultMsg = data.match ? '✅ Identidad confirmada por IA!' : '❌ Identidad no confirmada por IA. Intenta de nuevo.';
            statusMsg.textContent = `${resultMsg} Score: ${data.score.toFixed(1)}%. ${data.message}`;
            statusMsg.className = data.match ? 'mt-4 text-sm text-center text-green-600 leading-relaxed' : 'mt-4 text-sm text-center text-red-600 leading-relaxed';
            mensaje.textContent = data.match ? '¡Verificación exitosa! Puedes proceder.' : 'Mejora la iluminación o posición de la cara.';
            if (data.duiText) {
                console.log('Texto extraído del DUI:', data.duiText);
            }
            resetBtn.classList.remove('hidden'); // Muestra botón reset
        } else {
            statusMsg.textContent = `❌ ${data.message}`;
            statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
            submitBtn.disabled = false;
            submitBtn.className = 'mt-4 w-full bg-primary-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-colors cursor-pointer shadow-md';
        }
    })
    .catch(error => {
        console.error('Error en envío:', error);
        statusMsg.textContent = '❌ Error de red. Verifica el servidor.';
        statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
        submitBtn.disabled = false;
        submitBtn.className = 'mt-4 w-full bg-primary-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-colors cursor-pointer shadow-md';
    });
});

// Botón de Reset
resetBtn.addEventListener('click', function() {
    // Limpia todo
    docInput.value = '';
    preview.classList.add('hidden');
    docPreview.classList.add('hidden');
    video.play();  // Reanuda video
    selfieBlob = null;
    docFile = null;
    submitBtn.disabled = true;
    submitBtn.className = 'mt-4 w-full bg-gray-400 text-white py-3 px-4 rounded-lg font-semibold cursor-not-allowed hover:bg-gray-500 focus:outline-none transition-colors';
    statusMsg.textContent = '';
    statusMsg.className = 'mt-4 text-sm text-center text-gray-600 leading-relaxed';
    mensaje.textContent = 'Posiciónate frente a la cámara para nueva verificación.';
    docStatus.textContent = '';
    resetBtn.classList.add('hidden');
    // Limpia URLs para evitar memory leaks
    if (previewImg.src && previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
    if (docPreviewImg.src && docPreviewImg.src.startsWith('blob:')) URL.revokeObjectURL(docPreviewImg.src);
});

// Limpiar stream al cerrar
window.addEventListener('beforeunload', function () {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    // Limpia URLs
    if (previewImg.src && previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
    if (docPreviewImg.src && docPreviewImg.src.startsWith('blob:')) URL.revokeObjectURL(docPreviewImg.src);
});

