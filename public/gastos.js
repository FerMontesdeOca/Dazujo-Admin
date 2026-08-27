const form = document.getElementById('gasto-form');
const tablaBody = document.getElementById('tabla-body');
const cancelEditBtn = document.getElementById('cancel-edit');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const filtroSucursal = document.getElementById('filtro-sucursal');
const selectSucursal = document.getElementById('sucursal');
const selectTipoGasto = document.getElementById('tipo_gasto');
const esCompartido = document.getElementById('es-compartido');
const compartidoToggleWrap = document.getElementById('compartido-toggle-wrap');
const sucursalWrap = document.getElementById('sucursal-wrap');
const sucursalesCompartidoWrap = document.getElementById('sucursales-compartido-wrap');
const sucursalesCompartido = document.getElementById('sucursales-compartido');
const montoLabel = document.getElementById('monto-label');
const paginaAnteriorBtn = document.getElementById('pagina-anterior');
const paginaSiguienteBtn = document.getElementById('pagina-siguiente');
const paginaInfo = document.getElementById('pagina-info');

const TAMANO_PAGINA = 10;
let gastosCache = [];
let paginaActual = 1;

const fmtMoneda = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

async function cargarConfig() {
  const res = await fetch('/api/config');
  const { sucursales, tiposGasto } = await res.json();

  selectSucursal.innerHTML = sucursales.map((s) => `<option value="${s}">${s}</option>`).join('');
  selectTipoGasto.innerHTML = tiposGasto.map((t) => `<option value="${t}">${t}</option>`).join('');
  filtroSucursal.innerHTML =
    '<option value="">Todas las sucursales</option>' + sucursales.map((s) => `<option value="${s}">${s}</option>`).join('');
  sucursalesCompartido.innerHTML = sucursales
    .map((s) => `<label><input type="checkbox" value="${s}" /> ${s}</label>`)
    .join('');
}

function actualizarModoCompartido() {
  const activo = esCompartido.checked;
  sucursalWrap.hidden = activo;
  sucursalesCompartidoWrap.hidden = !activo;
  selectSucursal.required = !activo;
  montoLabel.textContent = activo ? 'Monto total (se dividira entre las clinicas seleccionadas)' : 'Monto';
}

esCompartido.addEventListener('change', actualizarModoCompartido);

async function cargarGastos() {
  const res = await fetch('/api/gastos');
  gastosCache = await res.json();
  paginaActual = 1;
  renderTabla();
}

function renderTabla() {
  const sucursal = filtroSucursal.value;
  const filtradas = gastosCache.filter((g) => (sucursal ? g.sucursal === sucursal : true));

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / TAMANO_PAGINA));
  if (paginaActual > totalPaginas) paginaActual = totalPaginas;
  const inicio = (paginaActual - 1) * TAMANO_PAGINA;
  const filas = filtradas.slice(inicio, inicio + TAMANO_PAGINA);

  paginaInfo.textContent = `Página ${paginaActual} de ${totalPaginas}`;
  paginaAnteriorBtn.disabled = paginaActual <= 1;
  paginaSiguienteBtn.disabled = paginaActual >= totalPaginas;

  tablaBody.innerHTML = '';
  filas.forEach((g) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(g.sucursal)}</td>
      <td>${escapeHtml(g.tipo_gasto)}</td>
      <td>${escapeHtml(g.concepto)}</td>
      <td>${escapeHtml(g.fecha)}</td>
      <td>${fmtMoneda(g.monto)}</td>
      <td>${
        g.grupo_id
          ? `<span class="badge-compartido" title="Parte de un gasto compartido de ${fmtMoneda(g.monto_total)}">Sí — total ${fmtMoneda(g.monto_total)}</span>`
          : 'No'
      }</td>
      <td>${g.comprobante ? `<a href="/api/gastos/comprobante/${encodeURIComponent(g.comprobante)}" target="_blank" rel="noopener">Ver</a>` : '-'}</td>
      <td class="acciones-cell"></td>
    `;

    const celdaAcciones = tr.querySelector('.acciones-cell');

    const btnEditar = document.createElement('button');
    btnEditar.className = 'small secondary';
    btnEditar.textContent = 'Editar';
    btnEditar.onclick = () => cargarEnFormulario(g);
    celdaAcciones.appendChild(btnEditar);

    const btnEliminar = document.createElement('button');
    btnEliminar.className = 'small danger';
    btnEliminar.textContent = 'Eliminar';
    btnEliminar.onclick = () => eliminarGasto(g.id);
    celdaAcciones.appendChild(btnEliminar);

    tablaBody.appendChild(tr);
  });
}

function cargarEnFormulario(g) {
  document.getElementById('gasto-id').value = g.id;
  esCompartido.checked = false;
  esCompartido.disabled = true;
  compartidoToggleWrap.hidden = true;
  actualizarModoCompartido();
  selectSucursal.value = g.sucursal;
  selectTipoGasto.value = g.tipo_gasto;
  document.getElementById('concepto').value = g.concepto;
  document.getElementById('fecha').value = g.fecha;
  document.getElementById('monto').value = g.monto;
  document.getElementById('comprobante-actual').textContent = g.comprobante
    ? 'Ya tiene comprobante (sube uno nuevo para reemplazarlo)'
    : '';
  formTitle.textContent = 'Editar gasto';
  submitBtn.textContent = 'Actualizar';
  cancelEditBtn.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function limpiarFormulario() {
  form.reset();
  document.getElementById('gasto-id').value = '';
  document.getElementById('comprobante-actual').textContent = '';
  esCompartido.disabled = false;
  compartidoToggleWrap.hidden = false;
  actualizarModoCompartido();
  formTitle.textContent = 'Nuevo gasto';
  submitBtn.textContent = 'Guardar';
  cancelEditBtn.hidden = true;
}

async function eliminarGasto(id) {
  if (!confirm('¿Eliminar este gasto?')) return;
  await fetch(`/api/gastos/${id}`, { method: 'DELETE' });
  cargarGastos();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('gasto-id').value;
  const compartido = !id && esCompartido.checked;
  const archivoComprobante = document.getElementById('comprobante').files[0];

  let url = id ? `/api/gastos/${id}` : '/api/gastos';
  const method = id ? 'PUT' : 'POST';
  const datos = new FormData();
  datos.set('tipo_gasto', selectTipoGasto.value);
  datos.set('concepto', document.getElementById('concepto').value.trim());
  datos.set('fecha', document.getElementById('fecha').value);
  datos.set('monto', document.getElementById('monto').value);
  if (archivoComprobante) datos.set('comprobante', archivoComprobante);

  if (compartido) {
    const sucursalesSeleccionadas = Array.from(
      sucursalesCompartido.querySelectorAll('input[type="checkbox"]:checked')
    ).map((el) => el.value);

    if (sucursalesSeleccionadas.length < 2) {
      alert('Selecciona al menos 2 clinicas para dividir el gasto.');
      return;
    }

    url = '/api/gastos/compartido';
    datos.set('sucursales', JSON.stringify(sucursalesSeleccionadas));
  } else {
    datos.set('sucursal', selectSucursal.value);
  }

  const res = await fetch(url, { method, body: datos });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'Ocurrio un error al guardar el gasto.');
    return;
  }

  limpiarFormulario();
  cargarGastos();
});

cancelEditBtn.addEventListener('click', limpiarFormulario);
filtroSucursal.addEventListener('change', () => {
  paginaActual = 1;
  renderTabla();
});
paginaAnteriorBtn.addEventListener('click', () => {
  paginaActual -= 1;
  renderTabla();
});
paginaSiguienteBtn.addEventListener('click', () => {
  paginaActual += 1;
  renderTabla();
});

const importarForm = document.getElementById('importar-form');
const importarBtn = document.getElementById('importar-btn');
const importarResultado = document.getElementById('importar-resultado');

importarForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const archivo = document.getElementById('importar-archivo').files[0];
  if (!archivo) return;

  const datos = new FormData();
  datos.set('archivo', archivo);

  importarBtn.disabled = true;
  importarBtn.textContent = 'Importando...';
  importarResultado.innerHTML = '';

  try {
    const res = await fetch('/api/gastos/importar', { method: 'POST', body: datos });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      importarResultado.innerHTML = `<div class="alert alert-error">${escapeHtml(data.error || 'Ocurrio un error al importar el archivo.')}</div>`;
      return;
    }

    const filaIngresos = data.ingresos
      .map((i) => `<tr><td>${escapeHtml(i.sucursal)}</td><td>${fmtMoneda(i.monto)}</td></tr>`)
      .join('');
    const filaGastos = data.gastos
      .map((g) => `<tr><td>${escapeHtml(g.sucursal)}</td><td>${fmtMoneda(g.monto)}</td></tr>`)
      .join('');
    const avisos = data.sinMapear.length
      ? `<p class="hint">No se pudieron mapear estas etiquetas (se omitieron): ${data.sinMapear.map(escapeHtml).join('; ')}</p>`
      : '';

    importarResultado.innerHTML = `
      <div class="alert">Importado el mes <strong>${escapeHtml(data.mes)}</strong>: ${data.ingresos.length} ingreso(s) y ${data.gastos.length} sucursal(es) con gasto.</div>
      <div class="resultado-importar-grid">
        <div>
          <h3>Ingresos importados</h3>
          <div class="table-wrapper">
            <table><thead><tr><th>Clinica</th><th>Monto</th></tr></thead><tbody>${filaIngresos || '<tr><td colspan="2">Ninguno</td></tr>'}</tbody></table>
          </div>
        </div>
        <div>
          <h3>Gastos importados (total por clinica)</h3>
          <div class="table-wrapper">
            <table><thead><tr><th>Clinica</th><th>Monto</th></tr></thead><tbody>${filaGastos || '<tr><td colspan="2">Ninguno</td></tr>'}</tbody></table>
          </div>
        </div>
      </div>
      ${avisos}
    `;

    cargarGastos();
  } finally {
    importarBtn.disabled = false;
    importarBtn.textContent = 'Importar';
    importarForm.reset();
  }
});

requireAuth().then(async (user) => {
  if (!user) return;
  await cargarConfig();
  cargarGastos();
});
