// Reemplaza los <input type="month"> por dos <select> (Mes y Año). El input
// original se mantiene en el DOM pero oculto: sigue siendo la fuente de
// verdad (mismo id, mismo .value "AAAA-MM", mismos eventos "change") para
// que el resto del codigo no tenga que cambiar. Esto evita el selector de
// fecha nativo del navegador, que en varias plataformas es lento de usar.
const MESES_SELECTOR_NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function inicializarSelectorMes(id, anioMin, anioMax) {
  const input = document.getElementById(id);
  if (!input || input.dataset.mesSelectorListo) return;
  input.dataset.mesSelectorListo = '1';
  input.style.display = 'none';

  const hoy = new Date();
  const desde = anioMin || hoy.getFullYear() - 3;
  const hasta = anioMax || hoy.getFullYear() + 1;

  const wrap = document.createElement('span');
  wrap.className = 'mes-selector';

  const selMes = document.createElement('select');
  selMes.setAttribute('aria-label', 'Mes');
  MESES_SELECTOR_NOMBRES.forEach((nombre, i) => {
    const opt = document.createElement('option');
    opt.value = String(i + 1).padStart(2, '0');
    opt.textContent = nombre;
    selMes.appendChild(opt);
  });

  const selAnio = document.createElement('select');
  selAnio.setAttribute('aria-label', 'Año');
  for (let a = hasta; a >= desde; a--) {
    const opt = document.createElement('option');
    opt.value = String(a);
    opt.textContent = String(a);
    selAnio.appendChild(opt);
  }

  function sincronizarDesdeInput() {
    const actual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const [anio, mes] = (input.value || actual).split('-');
    if (anio) selAnio.value = anio;
    if (mes) selMes.value = mes;
  }

  function actualizarInput() {
    input.value = `${selAnio.value}-${selMes.value}`;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  selMes.addEventListener('change', actualizarInput);
  selAnio.addEventListener('change', actualizarInput);

  sincronizarDesdeInput();
  wrap.appendChild(selMes);
  wrap.appendChild(selAnio);
  input.insertAdjacentElement('afterend', wrap);

  input._sincronizarSelectorMes = sincronizarDesdeInput;
}

// Llamar despues de cambiar el .value del input por codigo (el selector
// visual no se actualiza solo, hay que avisarle).
function refrescarSelectorMes(id) {
  const input = document.getElementById(id);
  if (input && input._sincronizarSelectorMes) input._sincronizarSelectorMes();
}
