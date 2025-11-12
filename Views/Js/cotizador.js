document.getElementById("cotizacionForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const formData = new FormData(this);
    const data = Object.fromEntries(formData.entries());
    const monto = parseFloat(data.monto_asegurar);

    // Validación corregida
    if (isNaN(monto) || monto < 100) {
        alert("El monto a asegurar debe ser mayor o igual a $100");
        return;
    }

    try {
        const res = await fetch("http://localhost:3000/guardar-cotizacionForm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });

        const text = await res.text();
        alert(text);
        this.reset();
    } catch (err) {
        console.error(err);
        alert("❌ Error al enviar cotización");
    }
});












