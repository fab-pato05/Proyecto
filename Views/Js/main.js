const video = document.getElementById("camara");
const canvas = document.getElementById("canvas");
const captureBtn = document.getElementById("captureBtn");
const submitBtn = document.getElementById("submitBtn");
const statusMsg = document.getElementById("statusMsg");
const ctx = canvas.getContext("2d");

let selfieBlob = null;

// Activar cámara
navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
        video.srcObject = stream;
    })
    .catch(err => {
        console.error("Error al acceder a la cámara:", err);
        alert("⚠️ No se pudo acceder a la cámara. Revisa permisos.");
    });

// Capturar selfie
captureBtn.addEventListener("click", () => {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
        selfieBlob = blob;
        statusMsg.textContent = "✅ Selfie capturada";
        submitBtn.disabled = false;
        submitBtn.classList.remove("bg-gray-400", "cursor-not-allowed");
        submitBtn.classList.add("bg-green-600", "hover:bg-green-700");
    }, "image/png");
});

// Enviar selfie
submitBtn.addEventListener("click", () => {
    if (!selfieBlob) return alert("Primero toma tu selfie 📸");

    const formData = new FormData();
    formData.append("selfie", selfieBlob, "selfie.png");

    fetch("/upload", { method: "POST", body: formData })
        .then(res => res.text())
        .then(msg => {
            statusMsg.textContent = msg;
            statusMsg.classList.add("text-green-600");
        })
        .catch(err => {
            console.error(err);
            statusMsg.textContent = "❌ Error al subir la selfie";
            statusMsg.classList.add("text-red-600");
        });
});

