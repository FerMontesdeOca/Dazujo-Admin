const form = document.getElementById('usuario-form');
const tablaBody = document.getElementById('tabla-body');

async function cargarUsuarios() {
  const res = await fetch('/api/usuarios');
  if (res.status === 403) {
    alert('Solo un administrador puede ver esta pagina.');
    window.location.href = 'index.html';
    return;
  }
  const usuarios = await res.json();
  renderTabla(usuarios);
}

function renderTabla(usuarios) {
  tablaBody.innerHTML = '';
  usuarios.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(u.nombre)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${u.is_admin ? 'Si' : 'No'}</td>
      <td>${u.active ? 'Activo' : 'Inactivo'}</td>
      <td class="acciones-cell"></td>
    `;

    const celdaAcciones = tr.querySelector('.acciones-cell');

    const btnEstado = document.createElement('button');
    btnEstado.className = 'small secondary';
    btnEstado.textContent = u.active ? 'Desactivar' : 'Activar';
    btnEstado.onclick = () => cambiarEstado(u);
    celdaAcciones.appendChild(btnEstado);

    const btnReset = document.createElement('button');
    btnReset.className = 'small secondary';
    btnReset.textContent = 'Restablecer contraseña';
    btnReset.onclick = () => restablecerPassword(u);
    celdaAcciones.appendChild(btnReset);

    tablaBody.appendChild(tr);
  });
}

async function cambiarEstado(u) {
  const res = await fetch(`/api/usuarios/${u.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: !u.active }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'No se pudo actualizar el usuario.');
    return;
  }
  cargarUsuarios();
}

async function restablecerPassword(u) {
  const nueva = prompt(`Nueva contraseña temporal para ${u.nombre} (minimo 8 caracteres):`);
  if (!nueva) return;

  const res = await fetch(`/api/usuarios/${u.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: nueva }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'No se pudo restablecer la contraseña.');
    return;
  }
  alert('Contraseña actualizada.');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    nombre: document.getElementById('nombre').value.trim(),
    email: document.getElementById('email').value.trim(),
    password: document.getElementById('password').value,
    is_admin: document.getElementById('is_admin').checked,
  };

  const res = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'No se pudo crear el usuario.');
    return;
  }

  form.reset();
  cargarUsuarios();
});

const sucursalForm = document.getElementById('sucursal-form');
const tablaSucursalesBody = document.getElementById('tabla-sucursales-body');

async function cargarSucursales() {
  const res = await fetch('/api/sucursales');
  if (!res.ok) return;
  const sucursales = await res.json();
  renderTablaSucursales(sucursales);
}

function renderTablaSucursales(sucursales) {
  tablaSucursalesBody.innerHTML = '';
  sucursales.forEach((s) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(s.nombre)}</td>
      <td>${s.activa ? 'Activa' : 'De baja'}</td>
      <td class="acciones-cell"></td>
    `;

    const celdaAcciones = tr.querySelector('.acciones-cell');
    const btnEstado = document.createElement('button');
    btnEstado.className = 'small secondary';
    btnEstado.textContent = s.activa ? 'Dar de baja' : 'Reactivar';
    btnEstado.onclick = () => cambiarEstadoSucursal(s);
    celdaAcciones.appendChild(btnEstado);

    tablaSucursalesBody.appendChild(tr);
  });
}

async function cambiarEstadoSucursal(s) {
  if (s.activa && !confirm(`¿Dar de baja "${s.nombre}"? Lo ya registrado se conserva, pero dejara de aparecer para nuevos registros.`)) {
    return;
  }

  const res = await fetch(`/api/sucursales/${s.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activa: !s.activa }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'No se pudo actualizar la sucursal.');
    return;
  }
  cargarSucursales();
}

sucursalForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('sucursal-nombre').value.trim();

  const res = await fetch('/api/sucursales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'No se pudo agregar la sucursal.');
    return;
  }

  sucursalForm.reset();
  cargarSucursales();
});

requireAuth().then((user) => {
  if (!user) return;
  if (!user.is_admin) {
    window.location.href = 'index.html';
    return;
  }
  cargarUsuarios();
  cargarSucursales();
});
