// Bloquea la escritura manual en los campos de fecha (type="date"): solo se
// pueden llenar seleccionando del calendario nativo, no tecleando ni pegando.
// Se puede llamar varias veces sin problema (por ejemplo si el DOM cambia).
function bloquearEscrituraEnFechas() {
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (input.dataset.fechaBloqueada) return;
    input.dataset.fechaBloqueada = '1';

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') return;
      e.preventDefault();
    });
    input.addEventListener('paste', (e) => e.preventDefault());
  });
}

document.addEventListener('DOMContentLoaded', bloquearEscrituraEnFechas);
