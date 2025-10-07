// main.js
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const docInput = document.getElementById('docInput');
const userIdInput = document.getElementById('userIdInput') || null;  // Nuevo: input para userId (agrega en HTML si no existe)
const captureBtn = document.getElementById('captureBtn');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');
const statusMsg = document.getElementById('statusMsg');
const mensaje = document.getElementById('mensaje');
const progressFill = document.getElementById('progressFill');
const previewImgs = [
    document.getElementById('preview1'),
    document.getElementById('preview2'),
    document.getElementById('preview3')
];

let stream = null;
let selfiesBlobs = [null, null, null];
let docFile = null;
let previewUrls = [];  // Nuevo: para trackear y revocar URLs
let currentStep = 0;
const steps = [
    { msg: 'Paso 1: Mira directo a la cámara', action: 'neutral' },
    { msg: 'Paso 2: Mira a la izquierda', action: 'izquierda' },
    { msg: 'Paso 3: Mira a la derecha', action: 'derecha' }
];

function updateProgress(percentage = (currentStep / steps.length * 100)) {
    progressFill.style.width = percentage + '%';
}

async function initCamera() {
    try {
        // Mejora: constraints más específicos para mobile/desktop
        const constraints = {
            video: {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        await video.play();

        // Espera a que el video cargue metadatos
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            mensaje.textContent = steps[0].msg;
            updateProgress();
            submitBtn.disabled = true;
            captureBtn.disabled = false;
            statusMsg.textContent = '';  // Limpia errores previos
        };

        video.onerror = () => {
            throw new Error('Error al cargar video');
        };
    } catch (err) {
        console.error('Error al acceder a la cámara:', err);
        statusMsg.textContent = '❌ No se pudo acceder a la cámara. Verifica permisos o conexión.';
        mensaje.textContent = 'Por favor, permite el acceso a la cámara.';
    }
}

captureBtn.addEventListener('click', () => {
    if (currentStep >= steps.length) return;
    if (!stream) {
        statusMsg.textContent = '❌ Cámara no disponible. Reinicia.';
        return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
        if (!blob) {
            statusMsg.textContent = '❌ Error al capturar imagen.';
            return;
        }
        selfiesBlobs[currentStep] = blob;
        const preview = previewImgs[currentStep];
        const url = URL.createObjectURL(blob);
        preview.src = url;
        preview.style.display = 'block';
        previewUrls.push(url);  // Track para cleanup
        currentStep++;
        if (currentStep < steps.length) {
            mensaje.textContent = steps[currentStep].msg;
        } else {
            mensaje.textContent = 'Selfies completas. Selecciona tu DUI e ingresa userId, luego envía.';
            submitBtn.disabled = false;
            captureBtn.disabled = true;  // Deshabilita captura
        }
        updateProgress();
    }, 'image/png');
});

docInput.addEventListener('change', e => {
    docFile = e.target.files[0];
    if (!docFile) return;

    // Mejora: validación más estricta (tipo y tamaño, como en multer)
    if (!docFile.type.startsWith('image/')) {
        alert('❌ Solo se permiten archivos de imagen (JPEG, PNG, etc.).');
        docInput.value = '';
        docFile = null;
        return;
    }
    if (docFile.size > 5 * 1024 * 1024) {  // 5MB
        alert('❌ El archivo es demasiado grande (máximo 5MB).');
        docInput.value = '';
        docFile = null;
        return;
    }

    // Preview opcional para doc (si quieres agregar un #docPreview en HTML)
    // const docPreview = document.getElementById('docPreview');
    // if (docPreview) docPreview.src = URL.createObjectURL(docFile);
    statusMsg.textContent = `✅ Documento seleccionado: ${docFile.name}`;
});

// Nuevo: Validar userId antes de enviar
function getUserId() {
    let userId = userIdInput ? userIdInput.value.trim() : null;
    if (!userId || isNaN(userId)) {
        statusMsg.textContent = '❌ Ingresa un userId válido (número).';
        return null;
    }
    return parseInt(userId);
}

submitBtn.addEventListener('click', async () => {
    // Validaciones antes de enviar
    if (!docFile) {
        statusMsg.textContent = '❌ Selecciona un documento.';
        return;
    }
    if (selfiesBlobs.some(b => !b)) {
        statusMsg.textContent = '❌ Captura las 3 selfies.';
        return;
    }
    const userId = getUserId();
    if (!userId) return;

    submitBtn.disabled = true;
    captureBtn.disabled = true;
    docInput.disabled = true;
    if (userIdInput) userIdInput.disabled = true;
    statusMsg.textContent = '⏳ Procesando y enviando al servidor...';
    updateProgress(100);  // Progreso completo durante envío

    const formData = new FormData();
    formData.append('userId', userId);  // Nuevo: envía userId requerido por backend
    formData.append('documento', docFile);
    selfiesBlobs.forEach((b, i) => {
        formData.append('selfie', b, `selfie_${i + 1}.png`);
    });

    try {
        const res = await fetch('/api/verify', {
            method: 'POST',
            body: formData
        });

        // Mejora: chequeo de status HTTP
        if (!res.ok) {
            throw new Error(`Error HTTP: ${res.status} ${res.statusText}`);
        }

        const data = await res.json().catch(() => {
            throw new Error('Respuesta inválida del servidor');
        });

        if (data.success) {
            const matchText = data.isMatch ? '✅ Identidad confirmada' : '❌ No confirmada';
            const edadText = data.edadValida ? '✅ Mayor de 18 años' : '❌ Menor de 18 años';
            const livenessText = data.liveness ? 'Alta' : 'Baja';
            statusMsg.innerHTML = `${matchText}. Score: ${data.score.toFixed(1)}%. Liveness: ${livenessText}. ${edadText}<br><small>${data.detectionMsg}</small>`;
            mensaje.textContent = 'Verificación completada. Puedes resetear para nueva verificación.';
            // Opcional: redirigir o mostrar éxito
        } else {
            statusMsg.textContent = `❌ Error del servidor: ${data.message}`;
            submitBtn.disabled = false;
        }
    } catch (err) {
        console.error('Error en envío:', err);
        statusMsg.textContent = `❌ Error de conexión o servidor: ${err.message}. Verifica que el servidor esté corriendo.`;
        submitBtn.disabled = false;
    } finally {
        // Re-habilita controles
        captureBtn.disabled = false;
        docInput.disabled = false;
        if (userIdInput) userIdInput.disabled = false;
        updateProgress(currentStep / steps.length * 100);  // Restaura progreso
    }
});

resetBtn.addEventListener('click', () => {
    // Detener stream
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    // Limpiar archivos y previews
    docInput.value = '';
    selfiesBlobs = [null, null, null];
    docFile = null;
    currentStep = 0;
    submitBtn.disabled = true;
    captureBtn.disabled = false;

    previewImgs.forEach(p => {
        p.src = '';
        p.style.display = 'none';
    });

    // Nuevo: revocar URLs para evitar memory leaks
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls = [];

    mensaje.textContent = 'Reiniciando...';
    statusMsg.textContent = '';
    updateProgress(0);

    // Re-inicia cámara después de un delay
    setTimeout(() => {
        initCamera();
    }, 500);
});

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    // Verifica que elementos existan
    if (!video || !canvas || !docInput || !captureBtn || !submitBtn || !resetBtn) {
        console.error('❌ Elementos HTML requeridos no encontrados.');
        statusMsg.textContent = 'Error: Configuración HTML incompleta.';
        return;
    }

    // Mejora: accesibilidad básica
    captureBtn.setAttribute('aria-label', 'Capturar selfie');
    submitBtn.setAttribute('aria-label', 'Enviar verificación');
    resetBtn.setAttribute('aria-label', 'Resetear proceso');

    initCamera();
});

