const form = document.getElementById("/guardar-cotizacionForm");

form.addEventListener("submit", async (e) => {
    e.preventDefault(); // Evita que se recargue la página

    // Capturar todos los datos del formulario
    const formData = new FormData(form);
    const data = new URLSearchParams(formData);

    try {
        const res = await fetch("http://localhost:3000/guardar-cotizacionForm", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
            

        });

        const result = await res.json();
        console.log(result);
        if (result.ok) {
            alert("✅ Cotización enviada correctamente");
            form.reset(); // limpiar formulario
        } else {
            alert(result.message || "❌ Error al enviar cotización");
        }
    } catch (err) {
        console.error(err);
        alert("❌ Error al conectar con el servidor");
    }
});