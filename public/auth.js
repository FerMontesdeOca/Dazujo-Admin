function escapeHtml(valor) {
  const div = document.createElement('div');
  div.textContent = valor ?? '';
  return div.innerHTML;
}

async function requireAuth() {
  const res = await fetch('/api/me');
  if (!res.ok) {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `login.html?next=${next}`;
    return null;
  }

  const user = await res.json();
  document.querySelectorAll('[data-user-name]').forEach((el) => (el.textContent = user.nombre));
  if (!user.is_admin) {
    document.querySelectorAll('[data-admin-only]').forEach((el) => el.remove());
  }
  return user;
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('logout-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = 'login.html';
    });
  }
});

// Si el navegador restaura esta pagina desde el bfcache (por ejemplo al usar
// "atras"/"adelante" o el historial), el script no se vuelve a ejecutar y se
// podria ver la ultima pantalla cargada aunque la sesion ya haya cerrado.
// Forzamos una recarga real para que se vuelva a validar la sesion con el servidor.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});
