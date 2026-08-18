const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');

function siguientePagina() {
  const params = new URLSearchParams(window.location.search);
  return params.get('next') || 'index.html';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.hidden = true;

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    errorBox.textContent = data.error || 'No se pudo iniciar sesion.';
    errorBox.hidden = false;
    return;
  }

  window.location.href = siguientePagina();
});
