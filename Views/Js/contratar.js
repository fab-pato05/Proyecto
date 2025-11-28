const cotizacion = JSON.parse(localStorage.getItem("cotizacion"));
if (cotizacion) {
    document.getElementById("resumen").textContent =
        `Seguro de $${cotizacion.monto} por $${cotizacion.precio}/año`;
}

document.getElementById("contratarForm").addEventListener("submit", function (e) 
{
    e.preventDefault();

    const datos =
    {
        nombre: document.getElementById("nombre").value,
        email: document.getElementById("email").value,
        telefono: document.getElementById("telefono").value,
        cotizacion
    };

    localStorage.setItem("contrato", JSON.stringify(datos));
    window.location.href = "VerificacionBio.html";
});
