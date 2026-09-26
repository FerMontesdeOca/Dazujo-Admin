const form = document.getElementById('cuenta-form');
const tablaBody = document.getElementById('tabla-body');
const cancelEditBtn = document.getElementById('cancel-edit');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const filtroPendientes = document.getElementById('filtro-pendientes');
const mensajeVencimiento = document.getElementById('mensaje-vencimiento');

const fmtMoneda = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const selectSucursal = document.getElementById('sucursal');
const selectTipoGasto = document.getElementById('tipo_gasto');
const esDividida = document.getElementById('es-dividida');
const sucursalWrap = document.getElementById('sucursal-wrap');
const modoDivisionWrap = document.getElementById('modo-division-wrap');
const modoDivision = document.getElementById('modo-division');
const sucursalesDivisionWrap = document.getElementById('sucursales-division-wrap');
const sucursalesDivisionLabel = document.getElementById('sucursales-division-label');
const sucursalesDivision = document.getElementById('sucursales-division');
const montoWrap = document.getElementById('monto-wrap');
const montoLabel = document.getElementById('monto-label');
const inputMonto = document.getElementById('monto');

let sucursalesDisponibles = [];

function diasParaVencer(fechaVencimiento) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVencimiento + 'T00:00:00');
  return Math.round((venc - hoy) / (1000 * 60 * 60 * 24));
}

async function cargarConfig() {
  const res = await fetch('/api/config');
  const { sucursales, tiposGasto } = await res.json();
  sucursalesDisponibles = sucursales;
  selectSucursal.innerHTML = sucursales.map((s) => `<option value="${s}">${s}</option>`).join('');
  selectTipoGasto.innerHTML = tiposGasto.map((t) => `<option value="${t}">${t}</option>`).join('');
  renderSucursalesDivision();
}

// partesPrevias: [{ sucursal, valor }] para volver a marcar una division al editar.
function renderSucursalesDivision(partesPrevias = []) {
  const modo = modoDivision.value;
  sucursalesDivision.classList.toggle('con-valores', modo !== 'igual');
  sucursalesDivision.innerHTML = '';

  // Una cuenta vieja puede estar dividida con una clinica que ya se dio de baja.
  const nombres = [...sucursalesDisponibles];
  partesPrevias.forEach((p) => {
    if (!nombres.includes(p.sucursal)) nombres.push(p.sucursal);
  });

  nombres.forEach((s) => {
    const previa = partesPrevias.find((p) => p.sucursal === s);
    const fila = document.createElement('label');
    fila.className = modo === 'igual' ? '' : 'fila-division';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.value = s;
    chk.checked = !!previa;

    const texto = document.createElement('span');
    texto.textContent = s;

    fila.appendChild(chk);
    fila.appendChild(texto);

    if (modo !== 'igual') {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.01';
      input.min = '0';
      input.disabled = !chk.checked;
      input.placeholder = modo === 'cantidad' ? '$' : '%';
      if (previa && previa.valor !== null && previa.valor !== undefined) input.value = previa.valor;
      chk.addEventListener('change', () => {
        input.disabled = !chk.checked;
        if (!chk.checked) input.value = '';
      });
      fila.appendChild(input);
    }

    sucursalesDivision.appendChild(fila);
  });
}

function recolectarDivision() {
  const partes = [];
  sucursalesDivision.querySelectorAll('label').forEach((fila) => {
    const inputs = fila.querySelectorAll('input');
    const chk = inputs[0];
    if (!chk.checked) return;
    const valorInput = inputs[1];
    partes.push({ sucursal: chk.value, valor: valorInput ? valorInput.value : null });
  });
  return partes;
}

function actualizarModoDivision() {
  const activo = esDividida.checked;
  const modo = modoDivision.value;
  sucursalWrap.hidden = activo;
  modoDivisionWrap.hidden = !activo;
  sucursalesDivisionWrap.hidden = !activo;
  selectSucursal.required = !activo;

  if (!activo) {
    montoWrap.hidden = false;
    montoLabel.textContent = 'Monto';
    inputMonto.required = true;
  } else if (modo === 'cantidad') {
    montoWrap.hidden = true;
    inputMonto.required = false;
    sucursalesDivisionLabel.textContent = 'Clinicas y cantidad que le corresponde a cada una';
  } else if (modo === 'porcentaje') {
    montoWrap.hidden = false;
    montoLabel.textContent = 'Monto total (se repartira segun los porcentajes)';
    inputMonto.required = true;
    sucursalesDivisionLabel.textContent = 'Clinicas y porcentaje que le corresponde a cada una';
  } else {
    montoWrap.hidden = false;
    montoLabel.textContent = 'Monto total (se dividira entre las clinicas seleccionadas)';
    inputMonto.required = true;
    sucursalesDivisionLabel.textContent = 'Clinicas que comparten la cuenta';
  }
}

esDividida.addEventListener('change', () => {
  renderSucursalesDivision();
  actualizarModoDivision();
});
modoDivision.addEventListener('change', () => {
  renderSucursalesDivision();
  actualizarModoDivision();
});

function celdaSucursal(c) {
  if (!c.reparto) return escapeHtml(c.sucursal || '-');
  const detalle = c.reparto.map((f) => `${escapeHtml(f.sucursal)}: ${fmtMoneda(f.monto)}`).join('<br>');
  return `<span class="badge-compartido">Dividida</span><div class="opcional">${detalle}</div>`;
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
      <td>${escapeHtml(c.proveedor)}</td>
      <td>${escapeHtml(c.concepto)}</td>
      <td>${celdaSucursal(c)}</td>
      <td>${escapeHtml(c.tipo_gasto || '-')}</td>
      <td>${escapeHtml(c.fecha_emision)}</td>
      <td>${escapeHtml(c.fecha_vencimiento)}${porVencer ? ' ⚠️' : ''}</td>
      <td>${fmtMoneda(c.monto)}</td>
      <td>${c.es_fijo ? 'Si' : 'No'}</td>
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
  esDividida.checked = !!c.division;
  if (c.division) {
    modoDivision.value = c.division.modo;
    renderSucursalesDivision(c.division.partes);
  } else {
    modoDivision.value = 'igual';
    renderSucursalesDivision();
    if (c.sucursal) selectSucursal.value = c.sucursal;
  }
  actualizarModoDivision();
  if (c.tipo_gasto) selectTipoGasto.value = c.tipo_gasto;
  document.getElementById('monto').value = c.monto;
  document.getElementById('fecha_emision').value = c.fecha_emision;
  document.getElementById('fecha_vencimiento').value = c.fecha_vencimiento;
  document.getElementById('es_fijo').checked = !!c.es_fijo;
  formTitle.textContent = 'Editar cuenta por pagar';
  submitBtn.textContent = 'Actualizar';
  cancelEditBtn.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function limpiarFormulario() {
  form.reset();
  document.getElementById('cuenta-id').value = '';
  modoDivision.value = 'igual';
  renderSucursalesDivision();
  actualizarModoDivision();
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
    sucursal: selectSucursal.value,
    tipo_gasto: selectTipoGasto.value,
    monto: document.getElementById('monto').value,
    fecha_emision: document.getElementById('fecha_emision').value,
    fecha_vencimiento: document.getElementById('fecha_vencimiento').value,
    es_fijo: document.getElementById('es_fijo').checked,
    division: null,
  };

  if (esDividida.checked) {
    const modo = modoDivision.value;
    const partes = recolectarDivision();

    if (partes.length < 2) {
      alert('Selecciona al menos 2 clinicas para dividir la cuenta.');
      return;
    }
    if (modo !== 'igual' && partes.some((p) => !p.valor)) {
      alert(modo === 'cantidad' ? 'Escribe la cantidad de cada clinica seleccionada.' : 'Escribe el porcentaje de cada clinica seleccionada.');
      return;
    }
    if (modo === 'porcentaje') {
      const sumaPct = partes.reduce((s, p) => s + Number(p.valor), 0);
      if (Math.abs(sumaPct - 100) > 0.5) {
        alert(`Los porcentajes deben sumar 100% (ahora suman ${sumaPct.toFixed(1)}%).`);
        return;
      }
    }
    payload.division = { modo, partes };
    if (modo === 'cantidad') delete payload.monto;
  }

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

async function probarWhatsApp(boton) {
  if (!confirm('Se enviara un WhatsApp de prueba a los numeros configurados. ¿Continuar?')) return;
  boton.disabled = true;
  boton.textContent = 'Enviando...';
  try {
    const res = await fetch('/api/cuentas/probar-whatsapp', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Ocurrio un error al probar WhatsApp.');
    } else if (!data.configurado) {
      alert(`WhatsApp no esta configurado en el servidor. Faltan estas variables: ${data.faltan.join(', ')}`);
    } else {
      const lineas = data.resultados.map((r) =>
        r.ok ? `✅ ${r.numero}: enviado (${r.estado || 'en cola'})` : `❌ ${r.numero}: ${r.error}${r.codigo ? ` (codigo ${r.codigo})` : ''}`
      );
      const plantilla = data.usaPlantilla ? 'Usando plantilla aprobada.' : 'Sin plantilla (TWILIO_WHATSAPP_CONTENT_SID no configurado).';
      alert(`Resultado de la prueba:\n\n${lineas.join('\n')}\n\n${plantilla}`);
    }
  } catch {
    alert('No se pudo contactar al servidor.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Probar WhatsApp';
  }
}

const probarWhatsAppBtn = document.getElementById('probar-whatsapp');
if (probarWhatsAppBtn) probarWhatsAppBtn.addEventListener('click', () => probarWhatsApp(probarWhatsAppBtn));

cancelEditBtn.addEventListener('click', limpiarFormulario);
filtroPendientes.addEventListener('change', cargarCuentas);

requireAuth().then(async (user) => {
  if (!user) return;
  await cargarConfig();
  cargarCuentas();
});
