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
  const gastos = await res.json();
  renderTabla(gastos);
}

function renderTabla(gastos) {
  const sucursal = filtroSucursal.value;
  const filas = gastos.filter((g) => (sucursal ? g.sucursal === sucursal : true));

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
      <td>${escapeHtml(g.proveedor) || '-'}</td>
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
  document.getElementById('proveedor').value = g.proveedor || '';
  document.getElementById('numero_factura').value = g.numero_factura || '';
  formTitle.textContent = 'Editar gasto';
  submitBtn.textContent = 'Actualizar';
  cancelEditBtn.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function limpiarFormulario() {
  form.reset();
  document.getElementById('gasto-id').value = '';
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

  let url = id ? `/api/gastos/${id}` : '/api/gastos';
  let method = id ? 'PUT' : 'POST';
  let payload = {
    sucursal: selectSucursal.value,
    tipo_gasto: selectTipoGasto.value,
    concepto: document.getElementById('concepto').value.trim(),
    fecha: document.getElementById('fecha').value,
    monto: document.getElementById('monto').value,
    proveedor: document.getElementById('proveedor').value.trim(),
    numero_factura: document.getElementById('numero_factura').value.trim(),
  };

  if (compartido) {
    const sucursalesSeleccionadas = Array.from(
      sucursalesCompartido.querySelectorAll('input[type="checkbox"]:checked')
    ).map((el) => el.value);

    if (sucursalesSeleccionadas.length < 2) {
      alert('Selecciona al menos 2 clinicas para dividir el gasto.');
      return;
    }

    url = '/api/gastos/compartido';
    payload = {
      sucursales: sucursalesSeleccionadas,
      tipo_gasto: selectTipoGasto.value,
      concepto: document.getElementById('concepto').value.trim(),
      fecha: document.getElementById('fecha').value,
      monto: document.getElementById('monto').value,
      proveedor: document.getElementById('proveedor').value.trim(),
      numero_factura: document.getElementById('numero_factura').value.trim(),
    };
  }

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'Ocurrio un error al guardar el gasto.');
    return;
  }

  limpiarFormulario();
  cargarGastos();
});

cancelEditBtn.addEventListener('click', limpiarFormulario);
filtroSucursal.addEventListener('change', cargarGastos);

requireAuth().then(async (user) => {
  if (!user) return;
  await cargarConfig();
  cargarGastos();
});
