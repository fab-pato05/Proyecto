// Establecer año actual en el footer
      document.getElementById('year').textContent = new Date().getFullYear();
      // Lógica para mostrar botón de reenvío con temporizador de 60s
      (function()
      {
        const form = document.getElementById('recoverForm');
        const sendBtn = document.getElementById('sendBtn');
        const resendBtn = document.getElementById('resendBtn');
        const statusMsg = document.getElementById('statusMsg');
        const DURATION = 60; // segundos
        let intervalId = null;
        // Función para iniciar el temporizador
        function startTimer() 
        {
          let remaining = DURATION;
          resendBtn.classList.remove('hidden');
          resendBtn.disabled = true;
          resendBtn.textContent = `Reenviar código (${remaining}s)`;
          resendBtn.classList.remove('opacity-60');
          // Iniciar intervalo
          intervalId = setInterval(() =>
          {
            remaining -= 1;
            if (remaining > 0) {
              resendBtn.textContent = `Reenviar código (${remaining}s)`;
            } else {
              clearInterval(intervalId);
              intervalId = null;
              resendBtn.textContent = 'Reenviar código';
              resendBtn.disabled = false;
            }
          }, 1000);
        }
        // Manejar envío del formulario
        function onSend(e)
        {
          e.preventDefault();
          // Mostrar mensaje de confirmación (simulado)
          statusMsg.classList.remove('hidden');
          // Deshabilitar el botón enviar para evitar múltiples envíos
          sendBtn.disabled = true;
          sendBtn.classList.add('opacity-60','cursor-not-allowed');
          // Iniciar temporizador para reenvío
          if(intervalId) { clearInterval(intervalId); intervalId = null; }
          startTimer();
          // Aquí iría la llamada real al servidor para enviar el correo
        }
        function onResend(){
          // Simular reenvío: volver a deshabilitar y reiniciar contador
          resendBtn.disabled = true;
          resendBtn.classList.add('opacity-60');
          statusMsg.classList.remove('hidden');
          if(intervalId) { clearInterval(intervalId); intervalId = null; }
          startTimer();
          // Aquí iría la llamada real al servidor para reenviar el correo
        }
        form.addEventListener('submit', onSend);
        resendBtn.addEventListener('click', onResend);
      })();