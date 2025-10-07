// Elementos del DOM (fusionados: tuyos + overlay y progress)
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
const overlay = document.getElementById('overlay'); // Del mío
const progressFill = document.getElementById('progressFill'); // Del mío

let stream = null;
let selfiesBlobs = [];  // Array para 3 selfies secuenciales
let docFile = null;
let currentStep = 0;  // Paso actual: 0=neutral, 1=izquierda, 2=derecha
const steps = [
    { msg: 'Paso 1: Mira directo a la cámara (neutral). Buena luz, sin gafas.', action: 'neutral' },
    { msg: 'Paso 2: Mira a la izquierda y mantén 2s.', action: 'left' },
    { msg: 'Paso 3: Mira a la derecha y mantén 2s.', action: 'right' }
];

// Función para actualizar progreso (del mío, adaptada)
function updateProgress(percentage) {
    if (progressFill) {
        progressFill.style.width = percentage + '%';
    }
}

// Función para inicializar cámara (CORREGIDA: fallback y más checks)
async function initCamera() {
    // Check básico: ¿Existe mediaDevices?
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const errorMsg = '❌ Tu navegador no soporta la cámara. Usa Chrome o Firefox actualizado.';
        statusMsg.textContent = errorMsg;
        statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
        console.error('MediaDevices no soportado');
        return;
    }

    // Intenta primero con cámara frontal (selfie)
    let constraints = {
        video: { 
            width: { ideal: 640 }, 
            height: { ideal: 480 },
            facingMode: 'user'
        }
    };

    try {
        console.log('Intentando acceder a la cámara frontal...');
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        stream = mediaStream;
        video.srcObject = stream;
        console.log('Cámara frontal accesible');
    } catch (error) {
        console.warn('Cámara frontal falló, intentando cámara predeterminada:', error);
        // Fallback: sin facingMode (usa cámara default)
        constraints.video.facingMode = undefined;
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            stream = mediaStream;
            video.srcObject = stream;
            console.log('Cámara predeterminada accesible');
        } catch (fallbackError) {
            console.error('Fallback falló:', fallbackError);
            throw fallbackError; // Lanza el error para manejo general
        }
    }

    // Configuración común después de obtener stream
    video.onloadedmetadata = () => {
        console.log('Video metadata cargada. Dimensiones:', video.videoWidth, 'x', video.videoHeight);
        video.play().catch(e => {
            console.error('Error al reproducir video:', e);
            statusMsg.textContent = '❌ Error al reproducir video. Verifica permisos.';
            statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
        });
        
        if (video.videoWidth > 0 && video.videoHeight > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            updateStep(0);  // Inicia en paso 1
            if (overlay) overlay.classList.remove('hidden');  // Muestra overlay
            updateProgress(0);  // Progreso inicial
            mensaje.textContent = 'Rostro detectado. Sigue los pasos para verificación en vivo.';
            statusMsg.textContent = '✅ Cámara activada. Buena iluminación recomendada.';
            statusMsg.className = 'mt-4 text-sm text-center text-green-600 leading-relaxed';
            console.log('🎥 Cámara inicializada correctamente.');
        } else {
            throw new Error('Video no tiene dimensiones válidas');
        }
    };

    video.onerror = (e) => {
        console.error('Error en video element:', e);
        statusMsg.textContent = '❌ Error en video. Verifica conexión o permisos.';
        statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
        if (overlay) overlay.classList.add('hidden');
    };

    video.onloadeddata = () => {
        console.log('Video data cargada - cámara visible');
    };
}

// Actualiza mensaje y botón según paso (tuya + overlay y progreso del mío)
function updateStep(step) {
    currentStep = step;
    if (step < steps.length) {
        mensaje.textContent = steps[step].msg;
        captureBtn.textContent = `📸 Capturar ${steps[step].action}`;
        preview.classList.add('hidden');  // Oculta preview hasta final
        selfiesBlobs[step] = null;  // Limpia blob anterior
        if (overlay) overlay.classList.remove('hidden');  // Overlay visible en pasos
        // Actualiza progreso: ~33% por paso completado
        updateProgress(((step) / steps.length) * 100);
    } else {
        // Todos pasos completos
        mensaje.textContent = '¡Selfies capturadas! Ahora envía para IA.';
        captureBtn.style.display = 'none';  // Oculta botón captura
        preview.classList.remove('hidden');
        if (overlay) overlay.classList.add('hidden');  // Oculta overlay al final
        showCompositePreview();  // Muestra preview combinado
        updateProgress(100);  // Progreso completo para selfies
        checkReadyToSubmit();
    }
    statusMsg.textContent = `Paso ${step + 1} de ${steps.length}. Sigue las instrucciones para detectar movimiento real.`;
    statusMsg.className = 'mt-4 text-sm text-center text-blue-600 leading-relaxed';
}

// Captura compuesta para preview (combina 3 selfies) - tuya
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

// Verificar si está listo para submit (DUI + 3 selfies) - tuya + clases dinámicas del mío
function checkReadyToSubmit() {
    if (docFile && selfiesBlobs.length === 3 && selfiesBlobs.every(blob => blob !== null)) {
        submitBtn.disabled = false;
        submitBtn.className = 'mt-4 w-full bg-primary-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-all duration-200 shadow-lg cursor-pointer';
        mensaje.textContent = '¡Listo! Envía para verificación en vivo con IA.';
    } else {
        submitBtn.disabled = true;
        submitBtn.className = 'mt-4 w-full bg-gray-400 text-white py-3 px-4 rounded-xl font-semibold cursor-not-allowed hover:bg-gray-500 focus:outline-none transition-all duration-200 shadow-lg disabled:opacity-50';
    }
}

// Inicializar cámara al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM cargado, inicializando cámara...');
    initCamera();
});

// Manejo del input de documento (tuya + clases del mío)
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

// Capturar selfie (secuencial) - tuya + progreso del mío
captureBtn.addEventListener('click', function () {
    if (stream && video.videoWidth > 0 && currentStep < steps.length) {
        canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
            selfiesBlobs[currentStep] = blob;
            console.log(`Selfie ${currentStep + 1} capturada: ${steps[currentStep].action}`);
            // Avanza al siguiente paso
            setTimeout(() => updateStep(currentStep + 1), 500);  // Pausa 0.5s para movimiento
            // Actualiza progreso inmediatamente después de capturar
            updateProgress((((currentStep + 1) / steps.length) * 100));
        }, 'image/png');
    } else {
        statusMsg.textContent = '❌ Video no listo o pasos completos. Verifica la cámara.';
        statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
    }
});

// Enviar al servidor (envía DUI + 3 selfies) - tuya + progreso del mío
submitBtn.addEventListener('click', function () {
    if (!docFile || selfiesBlobs.length !== 3) return;

    submitBtn.disabled = true;
    submitBtn.className = 'mt-4 w-full bg-gray-400 text-white py-3 px-4 rounded-xl font-semibold cursor-not-allowed hover:bg-gray-500 focus:outline-none transition-all duration-200 shadow-lg';
    statusMsg.textContent = 'Enviando selfies en vivo a IA para verificación...';
    statusMsg.className = 'mt-4 text-sm text-center text-blue-600 leading-relaxed';
    updateProgress(90);  // Progreso durante envío

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
        updateProgress(100);  // Progreso completo
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
            submitBtn.className = 'mt-4 w-full bg-primary-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-all duration-200 shadow-lg cursor-pointer';
        }
    })
    .catch(error => {
        console.error('Error en envío:', error);
        statusMsg.textContent = '❌ Error de red. Verifica el servidor.';
        statusMsg.className = 'mt-4 text-sm text-center text-red-600 leading-relaxed';
        submitBtn.disabled = false;
        submitBtn.className = 'mt-4 w-full bg-primary-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-all duration-200 shadow-lg cursor-pointer';
        updateProgress(0);  // Reset progreso en error
    });
});

// Botón de Reset (igual, pero limpia array) - tuya + progreso del mío
resetBtn.addEventListener('click', function() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    docInput.value = '';
    selfiesBlobs = [];
    currentStep = 0;
    captureBtn.style.display = 'block';
    captureBtn.textContent = '📸 Tomar Selfie';
    preview.classList.add('hidden');
    docPreview.classList.add('hidden');
    docFile = null;
    submitBtn.disabled = true;
    submitBtn.className = 'mt-4 w-full bg-gray-400 text-white py-3 px-4 rounded-xl font-semibold cursor-not-allowed hover:bg-gray-500 focus:outline-none transition-all duration-200 shadow-lg disabled:opacity-50';
    statusMsg.textContent = 'Reiniciando...';
    statusMsg.className = 'mt-4 text-sm text-center text-blue-600 leading-relaxed';
    docStatus.textContent = '';
    resetBtn.classList.add('hidden');
    updateProgress(0);  // Reset progreso
    // Limpia URLs
    if (previewImg.src && previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
    if (docPreviewImg.src && docPreviewImg.src.startsWith('blob:')) URL.revokeObjectURL(docPreviewImg.src);
    // Reinicia cámara
    setTimeout(() => {
        initCamera();
    }, 500);
});

// Limpiar stream al cerrar - tuya + progreso
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

