      document.addEventListener('DOMContentLoaded', function(){
      if (window.feather) {
        feather.replace();
      }
      const yearEl = document.getElementById('year');
      if (yearEl) yearEl.textContent = new Date().getFullYear();

      // Ocultar botón "Descargar" dentro de Electron
      (function() {
        const isElectron = navigator.userAgent.toLowerCase().includes('electron');
        const btn = document.getElementById('btn-descargar');
        if (isElectron && btn) {
          btn.style.display = 'none';
          btn.setAttribute('aria-hidden', 'true');
          btn.setAttribute('tabindex', '-1');
          btn.addEventListener('click', e => e.preventDefault());
        }
      })();
    });