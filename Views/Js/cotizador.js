document.getElementById("cotizacionForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    // Validar monto
    const monto = parseFloat(this.monto_asegurar.value);
    if (isNaN(monto) || monto < 10000) {
        alert("El monto a asegurar debe ser mayor a $10,000");
        return;
    }

    // Recolectar datos del formulario
    const formData = new FormData(this);
    const data = Object.fromEntries(formData.entries());

    // Guardar en localStorage por si se necesita luego
    localStorage.setItem("cotizacion", JSON.stringify(data));

    try {
        // Enviar datos al servidor
        const response = await fetch("/guardar-cotizacionForm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error("Error al guardar la cotización");

        const mensaje = await response.text();

        alert(`✅ ${mensaje}`);
        this.reset();

        // Redirigir si todo salió bien
        window.location.href = "contratar.html";
    } catch (error) {
        console.error("Error al enviar la cotización:", error);
        alert("❌ No se logró guardar la cotización. Intenta nuevamente.");
    }
});
