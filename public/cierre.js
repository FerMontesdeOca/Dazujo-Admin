let GASTOS = [];
let INGRESOS = [];
let SUCURSALES = [];

let chartIngresoGasto, chartUtilidad, chartTendencia, chartComparar;

const fmtMoneda = (n) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fmtPct = (n) => (n === null || n === undefined || !isFinite(n) ? '-' : `${(n * 100).toFixed(1)}%`);

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

function gastoTotalEnMes(mes, sucursal) {
  if (sucursal) return gastoDeSucursalEnMes(sucursal, mes);
  return GASTOS.filter((g) => g.fecha.slice(0, 7) === mes).reduce((sum, g) => sum + g.monto, 0);
}

function ingresoDeSucursalEnMes(sucursal, mes) {
  return INGRESOS.filter((i) => i.sucursal === sucursal && i.mes === mes).reduce((sum, i) => sum + i.monto, 0);
}

function ingresoTotalEnMes(mes, sucursal) {
  if (sucursal) return ingresoDeSucursalEnMes(sucursal, mes);
  return INGRESOS.filter((i) => i.mes === mes).reduce((sum, i) => sum + i.monto, 0);
}

function resumen(mes, sucursal) {
  const ingreso = ingresoTotalEnMes(mes, sucursal);
  const gasto = gastoTotalEnMes(mes, sucursal);
  const utilidad = ingreso - gasto;
  const margen = ingreso > 0 ? utilidad / ingreso : null;
  return { ingreso, gasto, utilidad, margen };
}

async function cargarConfig() {
  const res = await fetch('/api/config');
  const data = await res.json();
  SUCURSALES = data.sucursales;

  const opciones = SUCURSALES.map((s) => `<option value="${s}">${s}</option>`).join('');
  document.getElementById('ing-sucursal').innerHTML = opciones;
  document.getElementById('cmp-clin-a').innerHTML = opciones;
  document.getElementById('cmp-clin-b').innerHTML = opciones;
  if (SUCURSALES.length > 1) document.getElementById('cmp-clin-b').value = SUCURSALES[1];

  const opcionesConTodas = '<option value="">Todas las clinicas</option>' + opciones;
  document.getElementById('tendencia-sucursal').innerHTML = opcionesConTodas;
  document.getElementById('cmp-mes-sucursal').innerHTML = opcionesConTodas;
}

async function cargarGastos() {
  const res = await fetch('/api/gastos');
  GASTOS = await res.json();
}

async function cargarIngresos() {
  const res = await fetch('/api/ingresos');
  INGRESOS = await res.json();
  renderTablaIngresos();
}

function renderTablaIngresos() {
  const body = document.getElementById('ingresos-body');
  body.innerHTML = INGRESOS.map(
    (i) => `
    <tr>
      <td>${escapeHtml(i.sucursal)}</td>
      <td>${nombreMes(i.mes)}</td>
      <td>${escapeHtml(i.concepto) || '-'}</td>
      <td>${fmtMoneda(i.monto)}</td>
      <td class="acciones-cell"><button class="small danger" data-id="${i.id}">Eliminar</button></td>
    </tr>`
  ).join('');

  body.querySelectorAll('button[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => eliminarIngreso(btn.dataset.id));
  });
}

async function eliminarIngreso(id) {
  if (!confirm('¿Eliminar este ingreso?')) return;
  await fetch(`/api/ingresos/${id}`, { method: 'DELETE' });
  await cargarIngresos();
  renderTodo();
}

function tipoPrincipalDeIncremento(sucursal, mes, previo) {
  const porTipoActual = {};
  const porTipoPrevio = {};

  GASTOS.filter((g) => g.sucursal === sucursal && g.fecha.slice(0, 7) === mes).forEach((g) => {
    porTipoActual[g.tipo_gasto] = (porTipoActual[g.tipo_gasto] || 0) + g.monto;
  });
  GASTOS.filter((g) => g.sucursal === sucursal && g.fecha.slice(0, 7) === previo).forEach((g) => {
    porTipoPrevio[g.tipo_gasto] = (porTipoPrevio[g.tipo_gasto] || 0) + g.monto;
  });

  let mejorTipo = null;
  let mejorIncremento = 0;
  Object.keys(porTipoActual).forEach((tipo) => {
    const incremento = porTipoActual[tipo] - (porTipoPrevio[tipo] || 0);
    if (incremento > mejorIncremento) {
      mejorIncremento = incremento;
      mejorTipo = tipo;
    }
  });

  return mejorTipo;
}

function renderAlertas(mes) {
  const previo = mesAnterior(mes);
  const contenedor = document.getElementById('alertas-lista');
  const alertas = [];

  SUCURSALES.forEach((s) => {
    const actual = gastoDeSucursalEnMes(s, mes);
    const anterior = gastoDeSucursalEnMes(s, previo);

    if (anterior > 0) {
      const variacion = (actual - anterior) / anterior;
      if (variacion >= 0.2 && actual - anterior >= 500) {
        alertas.push({ sucursal: s, actual, anterior, variacion, principal: tipoPrincipalDeIncremento(s, mes, previo) });
      }
    } else if (actual >= 1000) {
      alertas.push({ sucursal: s, actual, anterior: 0, variacion: null, principal: null });
    }
  });

  if (alertas.length === 0) {
    contenedor.innerHTML = '<p class="alerta-vacia">Sin incrementos significativos de gasto este mes.</p>';
    return;
  }

  alertas.sort((a, b) => b.actual - b.anterior - (a.actual - a.anterior));

  contenedor.innerHTML = alertas
    .map((a) => {
      const detalle =
        a.variacion === null
          ? `Gasto nuevo de ${fmtMoneda(a.actual)} sin historial el mes anterior.`
          : `Subio ${fmtPct(a.variacion)} (${fmtMoneda(a.anterior)} → ${fmtMoneda(a.actual)})${
              a.principal ? `, principalmente por ${escapeHtml(a.principal)}` : ''
            }.`;
      return `<div class="alerta-item">⚠️ <div><strong>${escapeHtml(a.sucursal)}</strong>: ${detalle}</div></div>`;
    })
    .join('');
}

function dibujarIngresoGasto(filas) {
  const ctx = document.getElementById('chart-ingreso-gasto');
  if (chartIngresoGasto) chartIngresoGasto.destroy();
  chartIngresoGasto = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: filas.map((f) => f.sucursal),
      datasets: [
        { label: 'Ingreso', data: filas.map((f) => f.ingreso), backgroundColor: '#326ff8' },
        { label: 'Gasto', data: filas.map((f) => f.gasto), backgroundColor: '#e0433c' },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });
}

function dibujarUtilidad(filas) {
  const ctx = document.getElementById('chart-utilidad');
  if (chartUtilidad) chartUtilidad.destroy();
  chartUtilidad = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: filas.map((f) => f.sucursal),
      datasets: [
        {
          label: 'Utilidad',
          data: filas.map((f) => f.utilidad),
          backgroundColor: filas.map((f) => (f.utilidad < 0 ? '#e0433c' : '#2e9e5b')),
        },
      ],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
}

function renderTablero() {
  const mes = document.getElementById('mes-cierre').value || mesActual();
  const totales = resumen(mes);

  document.getElementById('tablero-export-csv').href = `/api/cierre/export/csv?mes=${mes}`;
  document.getElementById('tablero-export-xlsx').href = `/api/cierre/export/xlsx?mes=${mes}`;

  document.getElementById('kpi-row').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Ingreso total</div><div class="kpi-value">${fmtMoneda(totales.ingreso)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Gasto total</div><div class="kpi-value">${fmtMoneda(totales.gasto)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Utilidad total</div><div class="kpi-value ${totales.utilidad < 0 ? 'negativo' : 'positivo'}">${fmtMoneda(totales.utilidad)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Margen</div><div class="kpi-value">${fmtPct(totales.margen)}</div></div>
  `;

  const filas = SUCURSALES.map((s) => ({ sucursal: s, ...resumen(mes, s) }));

  document.getElementById('clinicas-body').innerHTML = filas
    .map(
      (f) => `
    <tr>
      <td>${escapeHtml(f.sucursal)}</td>
      <td>${fmtMoneda(f.ingreso)}</td>
      <td>${fmtMoneda(f.gasto)}</td>
      <td class="${f.utilidad < 0 ? 'negativo' : ''}">${fmtMoneda(f.utilidad)}</td>
      <td>${fmtPct(f.margen)}</td>
    </tr>`
    )
    .join('');

  dibujarIngresoGasto(filas);
  dibujarUtilidad(filas);
  renderAlertas(mes);
}

function renderTendencia() {
  const sucursal = document.getElementById('tendencia-sucursal').value;
  const desde = document.getElementById('tendencia-desde').value || mesActual();
  const hasta = document.getElementById('tendencia-hasta').value || mesActual();
  const meses = rangoMeses(desde, hasta);
  const datos = meses.map((m) => resumen(m, sucursal || null));

  const ctx = document.getElementById('chart-tendencia');
  if (chartTendencia) chartTendencia.destroy();
  chartTendencia = new Chart(ctx, {
    type: 'line',
    data: {
      labels: meses.map(nombreMes),
      datasets: [
        { label: 'Ingreso', data: datos.map((d) => d.ingreso), borderColor: '#326ff8', backgroundColor: '#326ff8', tension: 0.3 },
        { label: 'Gasto', data: datos.map((d) => d.gasto), borderColor: '#e0433c', backgroundColor: '#e0433c', tension: 0.3 },
        { label: 'Utilidad', data: datos.map((d) => d.utilidad), borderColor: '#2e9e5b', backgroundColor: '#2e9e5b', tension: 0.3 },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });
}

function dibujarComparar(etiquetas, resumenes) {
  const ctx = document.getElementById('chart-comparar');
  if (chartComparar) chartComparar.destroy();
  chartComparar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Ingreso', 'Gasto', 'Utilidad'],
      datasets: etiquetas.map((etq, i) => ({
        label: etq,
        data: [resumenes[i].ingreso, resumenes[i].gasto, resumenes[i].utilidad],
        backgroundColor: i === 0 ? '#326ff8' : '#5ea5fd',
      })),
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });
}

function renderComparar() {
  const modoClinicas = document.getElementById('modo-clinicas').checked;
  const encabezado = document.getElementById('comparar-encabezado');
  const body = document.getElementById('comparar-body');

  if (modoClinicas) {
    const mes = document.getElementById('cmp-clin-mes').value || mesActual();
    const a = document.getElementById('cmp-clin-a').value;
    const b = document.getElementById('cmp-clin-b').value;
    if (!a || !b) return;
    const ra = resumen(mes, a);
    const rb = resumen(mes, b);

    encabezado.innerHTML = `<th>Metrica</th><th>${escapeHtml(a)}</th><th>${escapeHtml(b)}</th>`;
    body.innerHTML = `
      <tr><td>Ingreso</td><td>${fmtMoneda(ra.ingreso)}</td><td>${fmtMoneda(rb.ingreso)}</td></tr>
      <tr><td>Gasto</td><td>${fmtMoneda(ra.gasto)}</td><td>${fmtMoneda(rb.gasto)}</td></tr>
      <tr><td>Utilidad</td><td>${fmtMoneda(ra.utilidad)}</td><td>${fmtMoneda(rb.utilidad)}</td></tr>
      <tr><td>Margen</td><td>${fmtPct(ra.margen)}</td><td>${fmtPct(rb.margen)}</td></tr>
    `;

    dibujarComparar([a, b], [ra, rb]);
  } else {
    const sucursal = document.getElementById('cmp-mes-sucursal').value;
    const mesA = document.getElementById('cmp-mes-a').value;
    const mesB = document.getElementById('cmp-mes-b').value;
    if (!mesA || !mesB) return;
    const ra = resumen(mesA, sucursal || null);
    const rb = resumen(mesB, sucursal || null);

    const etiquetaA = nombreMes(mesA);
    const etiquetaB = nombreMes(mesB);
    const variacion = (x, y) => (x === 0 ? '-' : fmtPct((y - x) / x));

    encabezado.innerHTML = `<th>Metrica</th><th>${etiquetaA}</th><th>${etiquetaB}</th><th>Variacion</th>`;
    body.innerHTML = `
      <tr><td>Ingreso</td><td>${fmtMoneda(ra.ingreso)}</td><td>${fmtMoneda(rb.ingreso)}</td><td>${variacion(ra.ingreso, rb.ingreso)}</td></tr>
      <tr><td>Gasto</td><td>${fmtMoneda(ra.gasto)}</td><td>${fmtMoneda(rb.gasto)}</td><td>${variacion(ra.gasto, rb.gasto)}</td></tr>
      <tr><td>Utilidad</td><td>${fmtMoneda(ra.utilidad)}</td><td>${fmtMoneda(rb.utilidad)}</td><td>${variacion(ra.utilidad, rb.utilidad)}</td></tr>
      <tr><td>Margen</td><td>${fmtPct(ra.margen)}</td><td>${fmtPct(rb.margen)}</td><td>-</td></tr>
    `;

    dibujarComparar([etiquetaA, etiquetaB], [ra, rb]);
  }
}

function actualizarModoComparar() {
  const esClinicas = document.getElementById('modo-clinicas').checked;
  document.getElementById('comparar-clinicas').hidden = !esClinicas;
  document.getElementById('comparar-meses').hidden = esClinicas;
  renderComparar();
}

function renderTodo() {
  renderTablero();
  renderTendencia();
  renderComparar();
}

function inicializarFechas() {
  const actual = mesActual();
  document.getElementById('ing-mes').value = actual;
  document.getElementById('mes-cierre').value = actual;
  document.getElementById('tendencia-desde').value = ultimosMeses(actual, 12)[0];
  document.getElementById('tendencia-hasta').value = actual;
  document.getElementById('cmp-clin-mes').value = actual;
  document.getElementById('cmp-mes-a').value = mesAnterior(actual);
  document.getElementById('cmp-mes-b').value = actual;
}

document.getElementById('ingreso-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    sucursal: document.getElementById('ing-sucursal').value,
    mes: document.getElementById('ing-mes').value,
    monto: document.getElementById('ing-monto').value,
    concepto: document.getElementById('ing-concepto').value.trim(),
  };

  const res = await fetch('/api/ingresos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'Ocurrio un error al guardar el ingreso.');
    return;
  }

  document.getElementById('ing-monto').value = '';
  document.getElementById('ing-concepto').value = '';
  await cargarIngresos();
  renderTodo();
});

document.getElementById('mes-cierre').addEventListener('change', renderTodo);
document.getElementById('tendencia-sucursal').addEventListener('change', renderTendencia);
document.getElementById('tendencia-desde').addEventListener('change', renderTendencia);
document.getElementById('tendencia-hasta').addEventListener('change', renderTendencia);
document.getElementById('cmp-clin-mes').addEventListener('change', renderComparar);
document.getElementById('cmp-clin-a').addEventListener('change', renderComparar);
document.getElementById('cmp-clin-b').addEventListener('change', renderComparar);
document.getElementById('cmp-mes-sucursal').addEventListener('change', renderComparar);
document.getElementById('cmp-mes-a').addEventListener('change', renderComparar);
document.getElementById('cmp-mes-b').addEventListener('change', renderComparar);
document.getElementById('modo-clinicas').addEventListener('change', actualizarModoComparar);
document.getElementById('modo-meses').addEventListener('change', actualizarModoComparar);

requireAuth().then(async (user) => {
  if (!user) return;
  inicializarFechas();
  await cargarConfig();
  await Promise.all([cargarGastos(), cargarIngresos()]);
  renderTodo();
});
