document.addEventListener("DOMContentLoaded", () => 
  {
  
  // Detectar si estamos en poliza.html
  if (location.pathname.includes("poliza.html")) 
    {
    initPoliza();
  }
  // Detectar si estamos en beneficiarios.html
  if (location.pathname.includes("beneficiarios.html")) 
    {
    initBeneficiarios();
  }
});
// =========
// poliza.js
// =========
function initPoliza() 
{
        const user = JSON.parse(localStorage.getItem("usuario"));
        const info = document.getElementById("info");

        if (user && user.contrato) 
          {
            const c = user.contrato;
            // Asegurarse de que el valor exista antes de usar
            const nombre = c.nombre || (user.nombreCompleto || 'Usuario');
            const email = c.email || user.email || '';
            const telefono = c.telefono || '';
            const cot = c.cotizacion || {};

            info.innerHTML = `
        <div>
          <p class="text-sm text-gray-500">Nombre</p>
          <p class="font-medium">${nombre}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Email</p>
          <p class="font-medium">${email}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Teléfono</p>
          <p class="font-medium">${telefono}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Edad</p>
          <p class="font-medium">${cot.edad || '-'}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Sexo</p>
          <p class="font-medium">${cot.sexo || '-'}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Monto</p>
          <p class="font-medium">$${(cot.monto !== undefined) ? cot.monto : '-'}</p>
        </div>
      `;
        } 
        else 
          {
            info.innerHTML = "<p class='text-gray-500'>No hay póliza registrada.</p>";
        }

        // Mostrar/ocultar botón descargar según contexto (opcional)
        (function(){
          const btn = document.getElementById('btn-download');
          if(btn){
            const isElectron = navigator.userAgent && navigator.userAgent.toLowerCase().includes('electron');
            if(isElectron) btn.style.display = 'none';
          }
        })();
    }
     // =======
     // BENEFICIARIOS
     // =======
      function initBeneficiarios() 
      {
          // cargar beneficiarios desde localStorage (demo)
    (function(){
      const listaEl = document.getElementById('lista');
      const user = JSON.parse(localStorage.getItem('usuario')) || {};
      const beneficiaries = (user.beneficiarios) || [];
      if(!beneficiaries.length)
        {
        listaEl.innerHTML = '<p class="text-gray-500">No hay beneficiarios registrados.</p>';
        return;
      }
      listaEl.innerHTML = beneficiaries.map(b=>`<li class="flex items-center justify-between bg-gray-50 p-3 rounded"><div><p class="font-medium">${b.nombre}</p><p class="text-sm text-gray-500">${b.parentesco} • ${b.cedula || ''}</p></div><div class="text-sm text-gray-600">${b.porcentaje || '0%'} </div></li>`).join('');
    })();
  }
    