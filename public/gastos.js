const form = document.getElementById('gasto-form');
const tablaBody = document.getElementById('tabla-body');
const cancelEditBtn = document.getElementById('cancel-edit');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const filtroSucursal = document.getElementById('filtro-sucursal');
const selectSucursal = document.getElementById('sucursal');
const selectTipoGasto = document.getElementById('tipo_gasto');

const fmtMoneda = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

async function cargarConfig() {
  const res = await fetch('/api/config');
  const { sucursales, tiposGasto } = await res.json();

  selectSucursal.innerHTML = sucursales.map((s) => `<option value="${s}">${s}</option>`).join('');
  selectTipoGasto.innerHTML = tiposGasto.map((t) => `<option value="${t}">${t}</option>`).join('');
  filtroSucursal.innerHTML =
    '<option value="">Todas las sucursales</option>' + sucursales.map((s) => `<option value="${s}">${s}</option>`).join('');
}

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
      <td>${g.sucursal}</td>
      <td>${g.tipo_gasto}</td>
      <td>${g.concepto}</td>
      <td>${g.fecha}</td>
      <td>${fmtMoneda(g.monto)}</td>
      <td>${g.proveedor || '-'}</td>
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
  const payload = {
    sucursal: selectSucursal.value,
    tipo_gasto: selectTipoGasto.value,
    concepto: document.getElementById('concepto').value.trim(),
    fecha: document.getElementById('fecha').value,
    monto: document.getElementById('monto').value,
    proveedor: document.getElementById('proveedor').value.trim(),
    numero_factura: document.getElementById('numero_factura').value.trim(),
  };

  const url = id ? `/api/gastos/${id}` : '/api/gastos';
  const method = id ? 'PUT' : 'POST';

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
