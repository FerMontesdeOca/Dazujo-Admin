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
