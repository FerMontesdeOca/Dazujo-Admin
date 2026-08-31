// Selector de marca/unidad de negocio (Dazujo / Tomox / Laboratorio) que vive
// junto al logo en el header de cada pagina. La marca elegida se guarda en
// este navegador (no es parte de la sesion del servidor) y se comparte entre
// paginas via localStorage; cambiar de marca dispara el evento "marcaCambiada"
// para que cada pagina vuelva a pintar sus datos con la marca correcta.
const MARCAS_DISPONIBLES = ['dazujo', 'tomox', 'laboratorio'];
const NOMBRES_MARCA = { dazujo: 'Dazujo', tomox: 'Tomox', laboratorio: 'Laboratorio' };
const CLAVE_MARCA = 'dazujo_marca_actual';
const LOGOS_MARCA = {
  dazujo: 'assets/logo_dazujo_azul.png',
  tomox: 'assets/logo_tomox.png',
  laboratorio: 'assets/logo_dazujo_azul.png',
};

function marcaActual() {
  const guardada = localStorage.getItem(CLAVE_MARCA);
  return MARCAS_DISPONIBLES.includes(guardada) ? guardada : 'dazujo';
}

function aplicarMarcaEnPagina() {
  const marca = marcaActual();

  document.querySelectorAll('[data-marca-dazujo-only]').forEach((el) => {
    el.hidden = marca !== 'dazujo';
  });

  const logo = document.querySelector('.logo');
  if (logo) logo.src = LOGOS_MARCA[marca];
}

function inicializarMarcaSelector() {
  const select = document.getElementById('marca-selector');
  if (select) {
    select.innerHTML = MARCAS_DISPONIBLES.map((m) => `<option value="${m}">${NOMBRES_MARCA[m]}</option>`).join('');
    select.value = marcaActual();

    select.addEventListener('change', () => {
      const nuevaMarca = select.value;
      localStorage.setItem(CLAVE_MARCA, nuevaMarca);
      aplicarMarcaEnPagina();

      // Tomox y Laboratorio solo trabajan con Gastos y Cierre de Mes; al
      // cambiar a cualquiera de las dos, se abre directo la de Gastos.
      if (nuevaMarca !== 'dazujo' && !window.location.pathname.endsWith('gastos.html')) {
        window.location.href = 'gastos.html';
        return;
      }

      window.dispatchEvent(new CustomEvent('marcaCambiada', { detail: nuevaMarca }));
    });
  }

  aplicarMarcaEnPagina();
}

document.addEventListener('DOMContentLoaded', inicializarMarcaSelector);
