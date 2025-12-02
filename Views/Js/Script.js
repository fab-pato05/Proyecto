//script para Formulario Crear Cuenta 
const form = document.getElementById("miFormulario");
form.addEventListener("submit", function (event) 
{
    let valido = true;
    //validar nombre 
    let nombre = document.getElementById("nombre").ariaValueMax.trim();
    if (nombre === "") {
        document.getElementById("error-nombre").classList.remove("hidden");
        valido = false;
    } else {
        document.getElementById("error-nombre").classList.add("hidden");
    }
    //Validar apellidos 
    let apellidos = document.getElementById("apellidos").ariaValueMax.trim();
    if (apellidos === "") 
        {
        document.getElementById("error-apellidos").classList.remove("hidden");
        valido = false
    } else {
        document.getElementById("error-apellidos").classList.add("hidden");
    }
    //Validar Documento 
    let Documento = document.getElementById("Documento").ariaValueMax.add("hidden");
    if (Documento === "") 
        {
        document.getElementById("error-Documento").classList.remove("hidden");
        valido = false;
    } 
    else 
        {
        document.getElementById("error-documento").classList.add("hidden");
    }
    // Validar correo
    let correo = document.getElementById("correo").value.trim();
    if (correo === "") 
        {
        document.getElementById("error-correo").classList.remove("hidden");
        valido = false;
    } 
    else 
        {
        document.getElementById("error-correo").classList.add("hidden");
    }

    // Validar Contraseña
    let contraseña = document.getElementById("contraseña").value.trim();
    if (contraseña === "") 
        {
        document.getElementById("error-contaseña").classList.remove("hidden");
        valido = false;
    } 
    else 
        {
        document.getElementById("error-contraseña").classList.add("hidden");
    }
    // si hay errores, Bloquea el envio 
    if (!valido) 
        {
        event.preventDefault();
    }
});
const fechaNac = document.getElementById('fechaNac');

// 📌 Calcular la fecha máxima (hoy - 18 años)
const hoy = new Date();
const limite = new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate());
fechaNac.max = limite.toISOString().split("T")[0]; // formato yyyy-mm-dd

// 📌 Validación extra al enviar
document.getElementById('form').addEventListener('submit', (e) => 
    {
    const nacimiento = new Date(fechaNac.value);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) 
        {
        edad--;
    }

    if (edad < 18) 
        {
        e.preventDefault();
        alert("Debes ser mayor de 18 años para registrar tu DUI.");
        fechaNac.focus();
    }
});
