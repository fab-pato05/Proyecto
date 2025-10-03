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
let selfiesBlobs = [];  // Array para 3 selfies secuenciales
let docFile = null;
let currentStep = 0;  // Paso actual: 0=neutral, 1=izquierda, 2=derecha
const steps = [
    { msg: 'Paso 1: Mira directo a la cámara (neutral). Buena luz, sin gafas.', action: 'neutral' },
    { msg: 'Paso 2: Mira a la izquierda y mantén 2s.', action: 'left' },
    { msg: 'Paso 3: Mira a la derecha y mantén 2s.', action: 'right' }
];

// Función para inicializar cámara
async function initCamera() {
    try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } }
        });
        stream = mediaStream;
        video.srcObject = stream;

        video.onloadedmetadata = () => {
            video.play().catch(e => console.error('Error al reproducir video:', e));
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            updateStep(0);  // Inicia en paso 1
            statusMsg.textContent = '✅ Cámara activada. Sigue las instrucciones para verificación en vivo.';
            statusMsg.className = 'mt-4 text-sm text-center text-green-600 leading-relaxed';
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

// Actualiza mensaje y botón según paso
function updateStep(step) {
    currentStep = step;
    if (step < steps.length) {
        mensaje.textContent = steps[step].msg;
        captureBtn.textContent = `📸 Capturar ${steps[step].action}`;
        preview.classList.add('hidden');  // Oculta preview hasta final
        selfiesBlobs[step] = null;  // Limpia blob anterior
    } else {
        // Todos pasos completos
        mensaje.textContent = '¡Selfies capturadas! Ahora envía para IA.';
        captureBtn.style.display = 'none';  // Oculta botón captura
        preview.classList.remove('hidden');
        showCompositePreview();  // Muestra preview combinado
        checkReadyToSubmit();
    }
    statusMsg.textContent = `Paso ${step + 1} de ${steps.length}. Sigue las instrucciones para detectar movimiento real.`;
    statusMsg.className = 'mt-4 text-sm text-center text-blue-600 leading-relaxed';
}

// Captura compuesta para preview (combina 3 selfies)
function showCompositePreview() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 300;
    tempCanvas.height = 100;
    const tempCtx = tempCanvas.getContext('2d');
    selfiesBlobs.forEach((blob, i) => {
        if (blob) {
            const img = new Image();
            img.onload = () => {
                tempCtx.drawImage(img, i * 100, 0, 100, 100);
                previewImg.src = tempCanvas.toDataURL();
            };
            img.src = URL.createObjectURL(blob);
        }
    });
}

// Inicializar cámara al cargar la página
document.addEventListener('DOMContentLoaded', initCamera);

// Manejo del input de documento (igual que antes)
docInput.addEventListener('change', function (e) {
    docFile = e.target.files[0];
    if (docFile) {
        if (!docFile.type.startsWith('image/')) {
            statusMsg.textContent = '❌ Error: Solo se permiten imágenes (JPG, PNG, etc.).';
            statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
            docInput.value = '';
            docFile = null;
            docPreview.classList.add('hidden');
            return;
        }
        if (docFile.size > 5 * 1024 * 1024) {
            statusMsg.textContent = '❌ Error: Imagen demasiado grande (máx 5MB).';
            statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
            docInput.value = '';
            docFile = null;
            docPreview.classList.add('hidden');
            return;
        }
        docPreviewImg.src = URL.createObjectURL(docFile);
        docPreview.classList.remove('hidden');
        docStatus.textContent = `Imagen seleccionada: ${docFile.name} (${(docFile.size / 1024 / 1024).toFixed(2)} MB)`;
        docStatus.className = 'mt-1 text-xs text-green-600';
        statusMsg.textContent = '';  
        checkReadyToSubmit();
    } else {
        docStatus.textContent = '';
        docPreview.classList.add('hidden');
    }
});

// Capturar selfie (secuencial)
captureBtn.addEventListener('click', function () {
    if (stream && video.videoWidth > 0 && currentStep < steps.length) {
        canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
            selfiesBlobs[currentStep] = blob;
            console.log(`Selfie ${currentStep + 1} capturada: ${steps[currentStep].action}`);
            // Avanza al siguiente paso
            setTimeout(() => updateStep(currentStep + 1), 500);  // Pausa 0.5s para movimiento
        }, 'image/png');
    } else {
        statusMsg.textContent = '❌ Video no listo o pasos completos.';
        statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
    }
});

// Verificar si está listo para submit (DUI + 3 selfies)
function checkReadyToSubmit() {
    if (docFile && selfiesBlobs.length === 3 && selfiesBlobs.every(blob => blob !== null)) {
        submitBtn.disabled = false;
        submitBtn.className = 'mt-4 w-full bg-primary-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-colors cursor-pointer shadow-md';
        mensaje.textContent = '¡Listo! Envía para verificación en vivo con IA.';
    } else {
        submitBtn.disabled = true;
        submitBtn.className = 'mt-4 w-full bg-gray-400 text-white py-3 px-4 rounded-lg font-semibold cursor-not-allowed hover:bg-gray-500 focus:outline-none transition-colors';
    }
}

// Enviar al servidor (envía DUI + 3 selfies)
submitBtn.addEventListener('click', function () {
    if (!docFile || selfiesBlobs.length !== 3) return;

    submitBtn.disabled = true;
    submitBtn.className = 'mt-4 w-full bg-gray-400 text-white py-3 px-4 rounded-lg font-semibold cursor-not-allowed hover:bg-gray-500 focus:outline-none transition-colors';
    statusMsg.textContent = 'Enviando selfies en vivo a IA para verificación...';
    statusMsg.className = 'mt-4 text-sm text-center text-blue-600 leading-relaxed';

    const formData = new FormData();
    formData.append('documento', docFile);
    selfiesBlobs.forEach((blob, i) => {
        formData.append('selfie', blob, `selfie_${i + 1}.png`);
    });

    fetch('/api/verify', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const resultMsg = data.match ? '✅ Identidad confirmada en vivo por IA!' : '❌ No confirmada. Verifica movimiento o foto.';
            statusMsg.textContent = `${resultMsg} Score: ${data.score.toFixed(1)}% | Liveness: ${data.liveness ? 'Alta' : 'Baja'}. ${data.message}`;
            statusMsg.className = data.match ? 'mt-4 text-sm text-center text-green-600 leading-relaxed' : 'mt-4 text-sm text-center text-red-600 leading-relaxed';
            mensaje.textContent = data.match ? '¡Verificación exitosa! Procede.' : 'Intenta con movimiento real (mira lados, parpadea).';
            if (data.duiText) console.log('Texto DUI:', data.duiText);
            resetBtn.classList.remove('hidden');
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

// Botón de Reset (igual, pero limpia array)
resetBtn.addEventListener('click', function() {
    docInput.value = '';
    selfiesBlobs = [];
    currentStep = 0;
    captureBtn.style.display = 'block';
    captureBtn.textContent = '📸 Capturar';
    preview.classList.add('hidden');
    docPreview.classList.add('hidden');
    video.play();
    docFile = null;
    submitBtn.disabled = true;
    submitBtn.className = 'mt-4 w-full bg-gray-400 text-white py-3 px-4 rounded-lg font-semibold cursor-not-allowed hover:bg-gray-500 focus:outline-none transition-colors';
    statusMsg.textContent = '';
    statusMsg.className = 'mt-4 text-sm text-center text-gray-600 leading-relaxed';
    updateStep(0);  // Reinicia pasos
    docStatus.textContent = '';
    resetBtn.classList.add('hidden');
    // Limpia URLs
    if (previewImg.src && previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
    if (docPreviewImg.src && docPreviewImg.src.startsWith('blob:')) URL.revokeObjectURL(docPreviewImg.src);
});

// Limpiar stream al cerrar
window.addEventListener('beforeunload', function () {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    // Limpia URLs de selfies
    selfiesBlobs.forEach(blob => {
        if (blob && previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
    });
    if (docPreviewImg.src && docPreviewImg.src.startsWith('blob:')) URL.revokeObjectURL(docPreviewImg.src);
});

