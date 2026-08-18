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

requireAuth().then((user) => {
  if (!user) return;
  if (!user.is_admin) {
    window.location.href = 'index.html';
    return;
  }
  cargarUsuarios();
});
