document.getElementById("cotizacionForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const monto = parseFloat(this.monto.value);
    if (isNaN(monto) || monto < 10000) {
        alert("El monto a asegurar debe ser mayor a $10,000.00");
        return;
    }

    // Aquí podrías enviar los datos a tu servidor o API
    alert("Formulario enviado con éxito ✅");
    this.reset();
});
