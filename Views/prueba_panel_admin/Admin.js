document.addEventListener("DOMContentLoaded", () => 
  {
  
  // Detectar si estamos en Configuracion.html
  if (location.pathname.includes("configuracion.html")) 
    {
    initConfiguracion();
  }
  // Detectar si estamos en Dashboard.html
  if (location.pathname.includes("dashboard.html")) 
    {
    initDashboard();
  }
    // Detectar si estamos en reportes.html
  if (location.pathname.includes("reportes.html")) 
    {
    initReportes();
  }
    // Detectar si estamos en resultados.html
  if (location.pathname.includes("resultados.html")) 
    {
    initResultados();
  }
    // Detectar si estamos en solicitudes.html
  if (location.pathname.includes("solicitudes.html")) 
    {
    initSolicitudes();
  }

});
// =======================
// CONFIGURACIÓN
// =======================
function initConfiguracion() 
 {

  const KEY = 'admin_general_config_v1';
  function loadConfig(){ try{ return JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){ return {}; } }
  function saveConfig(cfg){ localStorage.setItem(KEY, JSON.stringify(cfg)); }

  function applyToForm(cfg)
  {
    document.getElementById('cfg-enable-notifications').checked = !!cfg.enableNotifications;
    document.getElementById('cfg-frequency').value = cfg.frequency || 'daily';
    document.getElementById('ch-email').checked = !!(cfg.channels && cfg.channels.email);
    document.getElementById('ch-whatsapp').checked = !!(cfg.channels && cfg.channels.whatsapp);
    document.getElementById('ch-app').checked = !!(cfg.channels && cfg.channels.app);
    document.getElementById('ch-sms').checked = !!(cfg.channels && cfg.channels.sms);
  }

  function readFromForm()
  {
    return {
      enableNotifications: document.getElementById('cfg-enable-notifications').checked,
      frequency: document.getElementById('cfg-frequency').value,
      channels: {
        email: document.getElementById('ch-email').checked,
        whatsapp: document.getElementById('ch-whatsapp').checked,
        app: document.getElementById('ch-app').checked,
        sms: document.getElementById('ch-sms').checked
      }
    };
  }

  function toggleNotificationControls()
  {
    const enabled = document.getElementById('cfg-enable-notifications').checked;
    document.getElementById('cfg-frequency').disabled = !enabled;
    ['ch-email','ch-whatsapp','ch-app','ch-sms']
      .forEach(id=> document.getElementById(id).disabled = !enabled);
  }

  function saveReport(text)
  {
    const arr = JSON.parse(localStorage.getItem('admin_reports')||'[]');
    arr.push({text, ts:Date.now()});
    localStorage.setItem('admin_reports', JSON.stringify(arr));
  }

  function saveFeedback(text)
  {
    const arr = JSON.parse(localStorage.getItem('admin_feedback')||'[]');
    arr.push({text, ts:Date.now()});
    localStorage.setItem('admin_feedback', JSON.stringify(arr));
  }

  // INIT CONFIGURACION
  const cfg = loadConfig();
  applyToForm(cfg);
  toggleNotificationControls();

  document.getElementById('cfg-enable-notifications')
    .addEventListener('change', toggleNotificationControls);

  document.getElementById('cfg-save')
    .addEventListener('click', ()=>{
      const newCfg = readFromForm();
      saveConfig(newCfg);
      const msg = document.getElementById('cfg-msg');
      msg.classList.remove('hidden');
      setTimeout(()=> msg.classList.add('hidden'),2000);
    });
  document.getElementById('chat-support')
    .addEventListener('click', ()=> window.open('https://wa.me/50368270392','_blank'));

  document.getElementById('tutorial')
    .addEventListener('click', ()=> window.location.href = 'Tutorial.html');

  document.getElementById('submit-report')
    .addEventListener('click', ()=>{
      const text = document.getElementById('report-text').value.trim();
      if (!text) return alert('Describe el problema.');
      saveReport(text);
      document.getElementById('report-text').value='';
      alert('Problema reportado.');
    });

  document.getElementById('submit-feedback')
    .addEventListener('click', ()=>{
      const text = document.getElementById('feedback-text').value.trim();
      if (!text) return alert('Escribe una sugerencia.');
      saveFeedback(text);
      document.getElementById('feedback-text').value='';
      alert('Gracias por tu feedback.');
    });
}
// =======================
// DASHBOARD
// =======================
function initDashboard() 
{

  // restaurar sidebar
  const sidebar = document.getElementById('sidebar');
  if (sidebar) 
    {
    sidebar.style.display = '';
    try { localStorage.removeItem('admin_sidebar_collapsed'); } catch(e){}
  }

  // Datos de prueba
  const fakeRequests = 
  [
    {id:'REQ-001', estado:'pending', processingTime:45, docType:'dni', fecha:'2025-10-01'},
    {id:'REQ-002', estado:'approved', processingTime:32, docType:'licencia', fecha:'2025-09-21'},
    {id:'REQ-003', estado:'rejected', processingTime:60, docType:'pasaporte', fecha:'2025-09-15'},
    {id:'REQ-004', estado:'pending', processingTime:20, docType:'dni', fecha:'2025-10-03'}
  ];
  const fakeActivity = 
  [
    'Usuario REQ-004 subió documento',
    'Solicitud REQ-002 aprobada',
    'Informe generado: 2025-10-03'
  ];

  // KPIs
  const total = fakeRequests.length;
  const approved = fakeRequests.filter(r=>r.estado==='approved').length;
  const rejected = fakeRequests.filter(r=>r.estado==='rejected').length;
  const pending = fakeRequests.filter(r=>r.estado==='pending').length;
  const successRate = Math.round((approved/total)*100);
  const avgTime = Math.round(fakeRequests.reduce((s,r)=>s+r.processingTime,0)/total);

  document.getElementById('kpi-success').textContent = successRate + '%';
  document.getElementById('kpi-fails').textContent = rejected;
  document.getElementById('kpi-avgtime').textContent = avgTime;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-approved').textContent = approved;
  document.getElementById('stat-rejected').textContent = rejected;

  document.getElementById('activity').innerHTML =
    fakeActivity.map(a=>`<li class="bg-gray-50 p-2 rounded">${a}</li>`).join('');
}
// =======================
// REPORTES
// =======================
// menú izquierdo siempre visible
function initReportes() 
{
    (function () 
    {
        const sidebar = document.getElementById('sidebar');
        sidebar.style.display = '';
    })();

    (function () 
    {
        const chartCtx = document.getElementById('report-chart').getContext('2d');
        let chart = null;
        // Aplicar preset de fechas
        function applyPreset(preset) 
        {
            const now = new Date();
            let from = '';
            if (preset === 'day1') { { const d = new Date(now); d.setDate(d.getDate() - 1); from = d.toISOString().slice(0, 10); } }
            if (preset === 'last7') { const d = new Date(now); d.setDate(d.getDate() - 7); from = d.toISOString().slice(0, 10); }
            if (preset === 'last30') { const d = new Date(now); d.setDate(d.getDate() - 30); from = d.toISOString().slice(0, 10); }
            if (preset === 'year') { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); from = d.toISOString().slice(0, 10); }

            if (from) document.getElementById('r-from').value = from;
            document.getElementById('r-to').value = new Date().toISOString().slice(0, 10);
        }
  
        document.getElementById('r-preset').addEventListener('change', (e) => 
          {
            if (e.target.value !== 'custom') applyPreset(e.target.value);
        });
        // Generar datos de prueba
        function generateData(type, from, to) 
        {
            const start = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 7));
            const end = to ? new Date(to) : new Date();
            const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24))) + 1;

            const labels = [], values = [];
            for (let i = 0; i < days; i++) 
              {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                labels.push(d.toISOString().slice(0, 10));
                values.push(Math.round(Math.random() * 100));
            }
            return { labels, values };
        }

        function renderChart(labels, values, type) 
        {
            if (chart) chart.destroy();
            chart = new Chart(chartCtx, 
              {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: type,
                        data: values,
                        backgroundColor: 'rgba(59,130,246,0.6)'
                    }]
                },
                options: 
                {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }
        // Renderizar tabla de vista previa
        function renderTablePreview(labels, values) 
        {
            const el = document.getElementById('report-table');
            el.innerHTML = labels.map((lab, i) =>
                `<div class="grid grid-cols-2 gap-2 py-1 border-b">
                    <div>${lab}</div>
                    <div class="font-medium text-right">${values[i]}</div>
                </div>`
            ).join('');
        }
        // Generar reporte en excel
        document.getElementById('gen-report').addEventListener('click', () => 
          {
            const from = document.getElementById('r-from').value;
            const to = document.getElementById('r-to').value;
            const type = document.getElementById('r-type').value;

            const { labels, values } = generateData(type, from, to);

            renderTablePreview(labels, values);
            renderChart(labels, values, type);

            window.__report_preview = { labels, values, type };
        });

        // Exportar pdf + xlsx
        document.getElementById('export-report').addEventListener('click', () => 
          {
            const r = window.__report_preview;
            if (!r) { alert('Genera un reporte primero.'); return; }

            // PDF
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            doc.text(`Reporte: ${r.type}`, 10, 10);

            let y = 20;
            r.labels.forEach((l, i) => 
              {
                doc.text(`${l}: ${r.values[i]}`, 10, y);
                y += 6;
                if (y > 280) { doc.addPage(); y = 20; }
            });

            doc.save(`${r.type}_report.pdf`);

            // Excel (SheetJS)
            const aoa = [['date', 'value'], ...r.labels.map((l, i) => [l, r.values[i]])];
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Report');
            XLSX.writeFile(wb, `${r.type}_report.xlsx`);
        });
        // Boton "Programar" que genera y descarga un archivo Excel con datos de prueba
        document.getElementById('schedule-report').addEventListener('click', () => {

            // Datos de prueba
            const datos = [
                ["ID", "Nombre", "Estado", "Fecha"],
                [1, "Póliza Hogar", "Activa", "2025-01-02"],
                [2, "Póliza Auto", "Vencida", "2025-01-03"],
                [3, "Póliza Vida", "Activa", "2025-01-04"]
            ];

            // Exportar Excel con datos de prueba
            const ws = XLSX.utils.aoa_to_sheet(datos);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Programado');

            XLSX.writeFile(wb, `Reporte_Programado.xlsx`);
        });

    })();
}
// =======================
// RESULTADOS
// =======================
function initResultados() 
{
    // mwnu siempre visible
    (function(){ const sidebar=document.getElementById('sidebar'); sidebar.style.display=''; try{ localStorage.removeItem('admin_sidebar_collapsed'); }catch(e){} })();
    const fakeResults=[{id:'RES-001',request:'REQ-002',score:0.92,summary:'Coincidencia alta'},{id:'RES-002',request:'REQ-001',score:0.45,summary:'Coincidencia baja - revisar'}];
    document.getElementById('results-list').innerHTML = fakeResults.map(r=> `<div class="bg-gray-50 p-3 rounded"><div class="font-medium">${r.id} — ${r.request}</div><div class="text-xs text-gray-600">Score: ${r.score} — ${r.summary}</div></div>`).join('');
}
// =======================
// SOLICITUDES
// =======================
function initSolicitudes() 
{ 
     // menu siempre visible
     (function(){const sidebar=document.getElementById('sidebar'); sidebar.style.display=''; try{ localStorage.removeItem('admin_sidebar_collapsed'); }catch(e){} })();
 
    // información falsa con tipo de documento, gmail y tiempo de procesamiento (despues conectara con base de datos)
    const fakeData=[
      {id:'REQ-001',nombre:'María Pérez',email:'maria@example.com',fecha:'2025-10-01',estado:'pending', docType:'dni', processingTime:45},
      {id:'REQ-002',nombre:'Juan López',email:'juan@example.com',fecha:'2025-09-21',estado:'approved', docType:'licencia', processingTime:32},
      {id:'REQ-003',nombre:'Ana Gómez',email:'ana@example.com',fecha:'2025-09-15',estado:'rejected', docType:'pasaporte', processingTime:60},
      {id:'REQ-004',nombre:'Carlos Ruiz',email:'carlos@example.com',fecha:'2025-10-03',estado:'pending', docType:'dni', processingTime:20}
    ];

    function matchesFilters(item)
    {
      const q = (document.getElementById('search').value||'').toLowerCase();
      if(q && !item.nombre.toLowerCase().includes(q)) return false;
      return true;
    }

    function onAction(id, newState)
    {
      const idx = fakeData.findIndex(x=>x.id===id);
      if(idx>-1){ fakeData[idx].estado = newState; render(); }
    }

    function render()
    {
      const rows = fakeData.filter(matchesFilters);
      document.getElementById('table-body').innerHTML = rows.map(r=>`<tr class="border-b hover:bg-gray-50"><td class="py-2">${r.id}</td><td class="py-2">${r.nombre}</td><td class="py-2">${r.email}</td><td class="py-2">${r.fecha}</td><td class="py-2">${r.docType}</td><td class="py-2">${r.estado}</td><td class="py-2">${r.processingTime}</td><td class="py-2"><button data-id="${r.id}" class="approve px-2 py-1 bg-green-600 text-white rounded mr-2">Aprobar</button><button data-id="${r.id}" class="reject px-2 py-1 bg-red-600 text-white rounded">Rechazar</button></td></tr>`).join('');
      // attach handlers
      document.querySelectorAll('.approve').forEach(b=> b.addEventListener('click', e=> onAction(e.currentTarget.dataset.id, 'approved')));
      document.querySelectorAll('.reject').forEach(b=> b.addEventListener('click', e=> onAction(e.currentTarget.dataset.id, 'rejected')));
    }

    document.getElementById('search').addEventListener('input', render);
    render();
}