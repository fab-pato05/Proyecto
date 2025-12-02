    // Toggle mostrar/ocultar contraseña
    const toggleBtn = document.getElementById('togglePwd');
    const pwdInput = document.getElementById('contrasena');
    toggleBtn.addEventListener('click', () => 
      {
      if (pwdInput.type === 'password') 
        {
        pwdInput.type = 'text';
        toggleBtn.textContent = 'Ocultar';
      } 
      else 
        {
        pwdInput.type = 'password';
        toggleBtn.textContent = 'Mostrar';
      }
    });

    // Manejo de envío (se mantiene la lógica existente, con mensajes más amigables)
    const form = document.getElementById('registerForm');
    const mensaje = document.getElementById('mensaje');
    const submitBtn = document.getElementById('submitBtn');
    // Manejar envío del formulario
    form.addEventListener('submit', async (e) =>
      {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.classList.add('opacity-60', 'cursor-not-allowed');
      mensaje.textContent = '';
      // Preparar datos del formulario
      const formData = new FormData(form);
      const data = new URLSearchParams(formData);

      try {
        const res = await fetch('/guardar-registerForm', 
          {
          method: 'POST',
          body: data
        }
      );
        const result = await res.json();
        // Mostrar mensaje según resultado
        if (result.ok)
          {
          mensaje.className = 'text-center mt-4 text-sm font-medium text-green-600';
          mensaje.textContent = '✅ Registro exitoso. Redirigiendo...';
          setTimeout(() => { window.location.href = '/cotizador.html'; }, 1500);
        } 
        else 
          {
          mensaje.className = 'text-center mt-4 text-sm font-medium text-red-600';
          mensaje.textContent = result.message || '❌ Error al registrar usuario.';
          submitBtn.disabled = false;
          submitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
      } 
      catch (err) 
      {
        console.error(err);
        mensaje.className = 'text-center mt-4 text-sm font-medium text-red-600';
        mensaje.textContent = '❌ Error al conectar con el servidor.';
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
      }
    });
