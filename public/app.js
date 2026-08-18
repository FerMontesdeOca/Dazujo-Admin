const form = document.getElementById('cuenta-form');
const tablaBody = document.getElementById('tabla-body');
const cancelEditBtn = document.getElementById('cancel-edit');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const filtroPendientes = document.getElementById('filtro-pendientes');
const mensajeVencimiento = document.getElementById('mensaje-vencimiento');

const fmtMoneda = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

function diasParaVencer(fechaVencimiento) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVencimiento + 'T00:00:00');
  return Math.round((venc - hoy) / (1000 * 60 * 60 * 24));
}

async function cargarCuentas() {
  const res = await fetch('/api/cuentas');
  const cuentas = await res.json();
  renderTabla(cuentas);
}

function renderTabla(cuentas) {
  const soloPendientes = filtroPendientes.checked;
  const filas = cuentas.filter((c) => (soloPendientes ? !c.pagada : true));

  tablaBody.innerHTML = '';
  let proximasAVencer = 0;

  filas.forEach((c) => {
    const dias = diasParaVencer(c.fecha_vencimiento);
    const vencida = !c.pagada && dias < 0;
    const porVencer = !c.pagada && dias >= 0 && dias <= 3;
    if (porVencer) proximasAVencer++;

    const tr = document.createElement('tr');
    tr.className = c.pagada ? 'pagada' : vencida ? 'vencida' : '';
    tr.innerHTML = `
      <td>${c.proveedor}</td>
      <td>${c.concepto}</td>
      <td>${c.numero_factura}</td>
      <td>${c.fecha_emision}</td>
      <td>${c.fecha_vencimiento}${porVencer ? ' ⚠️' : ''}</td>
      <td>${fmtMoneda(c.monto)}</td>
      <td>${c.pagada ? 'Pagada' : vencida ? 'Vencida' : 'Pendiente'}</td>
      <td class="acciones-cell"></td>
    `;

    const celdaAcciones = tr.querySelector('.acciones-cell');

    const btnPagar = document.createElement('button');
    btnPagar.className = 'small secondary';
    btnPagar.textContent = c.pagada ? 'Marcar pendiente' : 'Marcar pagada';
    btnPagar.onclick = () => togglePagada(c);
    celdaAcciones.appendChild(btnPagar);

    const btnEditar = document.createElement('button');
    btnEditar.className = 'small secondary';
    btnEditar.textContent = 'Editar';
    btnEditar.onclick = () => cargarEnFormulario(c);
    celdaAcciones.appendChild(btnEditar);

    const btnEliminar = document.createElement('button');
    btnEliminar.className = 'small danger';
    btnEliminar.textContent = 'Eliminar';
    btnEliminar.onclick = () => eliminarCuenta(c.id);
    celdaAcciones.appendChild(btnEliminar);

    tablaBody.appendChild(tr);
  });

  if (proximasAVencer > 0) {
    mensajeVencimiento.hidden = false;
    mensajeVencimiento.textContent = `Tienes ${proximasAVencer} factura(s) que vencen en los proximos 3 dias.`;
  } else {
    mensajeVencimiento.hidden = true;
  }
}

function cargarEnFormulario(c) {
  document.getElementById('cuenta-id').value = c.id;
  document.getElementById('proveedor').value = c.proveedor;
  document.getElementById('concepto').value = c.concepto;
  document.getElementById('numero_factura').value = c.numero_factura;
  document.getElementById('monto').value = c.monto;
  document.getElementById('fecha_emision').value = c.fecha_emision;
  document.getElementById('fecha_vencimiento').value = c.fecha_vencimiento;
  formTitle.textContent = 'Editar cuenta por pagar';
  submitBtn.textContent = 'Actualizar';
  cancelEditBtn.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function limpiarFormulario() {
  form.reset();
  document.getElementById('cuenta-id').value = '';
  formTitle.textContent = 'Nueva cuenta por pagar';
  submitBtn.textContent = 'Guardar';
  cancelEditBtn.hidden = true;
}

async function togglePagada(c) {
  await fetch(`/api/cuentas/${c.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pagada: c.pagada ? 0 : 1 }),
  });
  cargarCuentas();
}

async function eliminarCuenta(id) {
  if (!confirm('¿Eliminar esta cuenta por pagar?')) return;
  await fetch(`/api/cuentas/${id}`, { method: 'DELETE' });
  cargarCuentas();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('cuenta-id').value;
  const payload = {
    proveedor: document.getElementById('proveedor').value.trim(),
    concepto: document.getElementById('concepto').value.trim(),
    numero_factura: document.getElementById('numero_factura').value.trim(),
    monto: document.getElementById('monto').value,
    fecha_emision: document.getElementById('fecha_emision').value,
    fecha_vencimiento: document.getElementById('fecha_vencimiento').value,
  };

  const url = id ? `/api/cuentas/${id}` : '/api/cuentas';
  const method = id ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'Ocurrio un error al guardar la cuenta.');
    return;
  }

  limpiarFormulario();
  cargarCuentas();
});

cancelEditBtn.addEventListener('click', limpiarFormulario);
filtroPendientes.addEventListener('change', cargarCuentas);

requireAuth().then((user) => {
  if (user) cargarCuentas();
});
