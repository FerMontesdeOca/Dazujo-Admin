let GASTOS = [];
let INGRESOS = [];
let METAS_MENSUALES = {};
let SUCURSALES = [];

const CHARTS = {};

const fmtMoneda = (n) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fmtPct = (n) => (n === null || n === undefined || !isFinite(n) ? '-' : `${(n * 100).toFixed(1)}%`);

async function exportarExcelConGraficas(url, payload, nombreArchivo, boton) {
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Generando...';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      alert('Ocurrio un error al generar el Excel.');
      return;
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = objectUrl;
    enlace.download = `${nombreArchivo}.xlsx`;
    enlace.click();
    URL.revokeObjectURL(objectUrl);
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

function mesActual() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

function mesAnterior(mes) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function ultimosMeses(mesFinal, cantidad) {
  const meses = [];
  let actual = mesFinal;
  for (let i = 0; i < cantidad; i++) {
    meses.unshift(actual);
    actual = mesAnterior(actual);
  }
  return meses;
}

function mesSiguiente(mes) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function rangoMeses(mesInicio, mesFin) {
  let inicio = mesInicio;
  let fin = mesFin;
  if (inicio > fin) [inicio, fin] = [fin, inicio];

  const meses = [];
  let actual = inicio;
  let tope = 0;
  while (actual <= fin && tope < 240) {
    meses.push(actual);
    actual = mesSiguiente(actual);
    tope++;
  }
  return meses;
}

function nombreMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
}

function gastoDeSucursalEnMes(sucursal, mes) {
  return GASTOS.filter((g) => g.sucursal === sucursal && g.fecha.slice(0, 7) === mes).reduce((sum, g) => sum + g.monto, 0);
}

function ingresoDeSucursalEnMes(sucursal, mes) {
  return INGRESOS.filter((i) => i.sucursal === sucursal && i.mes === mes).reduce((sum, i) => sum + i.monto, 0);
}

function metaDeSucursal(sucursal) {
  return METAS_MENSUALES[sucursal] || null;
}

function resumenClinica(sucursal, mes) {
  const ingreso = ingresoDeSucursalEnMes(sucursal, mes);
  const gasto = gastoDeSucursalEnMes(sucursal, mes);
  const utilidad = ingreso - gasto;
  const meta = metaDeSucursal(sucursal);
  const pctMeta = meta ? ingreso / meta : null;
  return { ingreso, gasto, utilidad, meta, pctMeta };
}

async function cargarConfig() {
  const res = await fetch('/api/config');
  const data = await res.json();
  SUCURSALES = data.sucursales;
  METAS_MENSUALES = data.metasMensuales || {};

  const opciones = SUCURSALES.map((s) => `<option value="${s}">${s}</option>`).join('');
  document.getElementById('proy-sucursal').innerHTML = opciones;
}

async function cargarGastos() {
  const res = await fetch('/api/gastos');
  GASTOS = await res.json();
}

async function cargarIngresos() {
  const res = await fetch('/api/ingresos');
  INGRESOS = await res.json();
}

function renderKpis(sucursal, mes) {
  const r = resumenClinica(sucursal, mes);
  const kpiRow = document.getElementById('proy-kpi-row');

  const pctTexto = r.meta ? fmtPct(r.pctMeta) : 'Sin meta';
  const pctClase = r.meta ? (r.pctMeta >= 1 ? 'positivo' : 'negativo') : '';

  kpiRow.innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Ingreso</div><div class="kpi-value">${fmtMoneda(r.ingreso)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Gasto</div><div class="kpi-value">${fmtMoneda(r.gasto)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Utilidad</div><div class="kpi-value ${r.utilidad < 0 ? 'negativo' : 'positivo'}">${fmtMoneda(r.utilidad)}</div></div>
    <div class="kpi-card"><div class="kpi-label">% de meta cumplido</div><div class="kpi-value ${pctClase}">${pctTexto}</div></div>
  `;
}

function dibujarIngresosVsMeta(sucursal, meses) {
  const ingresos = meses.map((m) => ingresoDeSucursalEnMes(sucursal, m));
  const metas = meses.map(() => metaDeSucursal(sucursal));

  const ctx = document.getElementById('chart-proy-ingresos');
  if (CHARTS.ingresos) CHARTS.ingresos.destroy();
  CHARTS.ingresos = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: meses.map(nombreMes),
      datasets: [
        { label: 'Ingreso', data: ingresos, backgroundColor: '#326ff8' },
        { label: 'Meta', data: metas, type: 'line', borderColor: '#e0433c', backgroundColor: '#e0433c', borderDash: [6, 4], tension: 0, pointRadius: 3 },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });
}

function dibujarGastos(sucursal, meses) {
  const gastos = meses.map((m) => gastoDeSucursalEnMes(sucursal, m));

  const ctx = document.getElementById('chart-proy-gastos');
  if (CHARTS.gastos) CHARTS.gastos.destroy();
  CHARTS.gastos = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: meses.map(nombreMes),
      datasets: [{ label: 'Gasto', data: gastos, backgroundColor: '#e0433c' }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
}

function dibujarUtilidad(sucursal, meses) {
  const utilidades = meses.map((m) => ingresoDeSucursalEnMes(sucursal, m) - gastoDeSucursalEnMes(sucursal, m));

  const ctx = document.getElementById('chart-proy-utilidad');
  if (CHARTS.utilidad) CHARTS.utilidad.destroy();
  CHARTS.utilidad = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: meses.map(nombreMes),
      datasets: [
        {
          label: 'Utilidad',
          data: utilidades,
          backgroundColor: utilidades.map((u) => (u < 0 ? '#e0433c' : '#2e9e5b')),
        },
      ],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
}

function dibujarMeta(sucursal, meses) {
  const meta = metaDeSucursal(sucursal);
  const porcentajes = meses.map((m) => {
    if (!meta) return null;
    return (ingresoDeSucursalEnMes(sucursal, m) / meta) * 100;
  });
  const referencia = meses.map(() => 100);

  const ctx = document.getElementById('chart-proy-meta');
  if (CHARTS.meta) CHARTS.meta.destroy();
  CHARTS.meta = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: meses.map(nombreMes),
      datasets: [
        {
          label: '% cumplido',
          data: porcentajes,
          backgroundColor: porcentajes.map((p) => (p === null ? '#cccccc' : p >= 100 ? '#2e9e5b' : '#e0433c')),
        },
        {
          label: 'Meta (100%)',
          data: referencia,
          type: 'line',
          borderColor: '#888888',
          borderDash: [4, 4],
          pointRadius: 0,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { ticks: { callback: (v) => `${v}%` } } },
    },
  });
}

function renderProyeccion() {
  const sucursal = document.getElementById('proy-sucursal').value;
  const desde = document.getElementById('proy-desde').value || mesActual();
  const hasta = document.getElementById('proy-hasta').value || mesActual();
  const meses = rangoMeses(desde, hasta);
  const mesKpi = meses[meses.length - 1];

  document.getElementById('proy-export-csv').href =
    `/api/proyeccion/export/csv?sucursal=${encodeURIComponent(sucursal)}&desde=${desde}&hasta=${hasta}`;

  renderKpis(sucursal, mesKpi);
  dibujarIngresosVsMeta(sucursal, meses);
  dibujarGastos(sucursal, meses);
  dibujarUtilidad(sucursal, meses);
  dibujarMeta(sucursal, meses);
}

function inicializarFechas() {
  const actual = mesActual();
  document.getElementById('proy-desde').value = ultimosMeses(actual, 12)[0];
  document.getElementById('proy-hasta').value = actual;
}

document.getElementById('proy-sucursal').addEventListener('change', renderProyeccion);
document.getElementById('proy-desde').addEventListener('change', renderProyeccion);
document.getElementById('proy-hasta').addEventListener('change', renderProyeccion);

document.getElementById('proy-export-xlsx').addEventListener('click', (e) => {
  const sucursal = document.getElementById('proy-sucursal').value;
  const desde = document.getElementById('proy-desde').value || mesActual();
  const hasta = document.getElementById('proy-hasta').value || mesActual();

  const graficas = [
    { titulo: 'Ingresos vs meta', dataUrl: CHARTS.ingresos ? CHARTS.ingresos.toBase64Image() : null },
    { titulo: 'Gastos', dataUrl: CHARTS.gastos ? CHARTS.gastos.toBase64Image() : null },
    { titulo: 'Utilidad', dataUrl: CHARTS.utilidad ? CHARTS.utilidad.toBase64Image() : null },
    { titulo: 'Porcentaje de meta cumplido', dataUrl: CHARTS.meta ? CHARTS.meta.toBase64Image() : null },
  ].filter((g) => g.dataUrl);

  exportarExcelConGraficas(
    '/api/proyeccion/export/xlsx',
    { sucursal, desde, hasta, graficas },
    `proyeccion_${sucursal}`,
    e.currentTarget
  );
});

requireAuth().then(async (user) => {
  if (!user) return;
  inicializarFechas();
  await cargarConfig();
  await Promise.all([cargarGastos(), cargarIngresos()]);
  renderProyeccion();
});
