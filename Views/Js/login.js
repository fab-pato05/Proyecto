      document.getElementById("loginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      const user = JSON.parse(localStorage.getItem("usuario"));
      const usuario = document.getElementById("usuario").value;
      const password = document.getElementById("password").value;

      if (user && user.usuario === usuario && user.password === password) {
        alert("Inicio de sesión exitoso");
        window.location.href = "poliza.html";
      } else {
        alert("Usuario o contraseña incorrectos");
      }
    });
    // Activar íconos Feather (si los usas)
    feather.replace();
