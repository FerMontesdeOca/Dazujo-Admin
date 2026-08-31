const XLSX = require('xlsx');
const sucursalesDb = require('./sucursales');

function normalizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

// Alias de nombres historicos/alternos hacia el nombre canonico de la sucursal
// (el mismo criterio que se uso para mapear los Excel de cierre de mes).
const ALIAS_SUCURSAL = [
  ['RAMOS', 'Benavides'],
  ['BENAVIDES', 'Benavides'],
  ['NAZAS', 'Torreón'],
  ['TORREON', 'Torreón'],
  ['LAS TORRES', 'Las Torres'],
  ['TORRES', 'Las Torres'],
  ['TERESITAS', 'Cardenas'],
  ['CARDENAS', 'Cardenas'],
  ['SATELITE', 'Satélite'],
  ['ROMA', 'Satélite'],
  ['FLORES', 'Flores'],
  ['MIRASIERRA', 'Mirasierra'],
  ['SEMINARIO', 'Seminario'],
  ['IXTLERO', 'Ixtlero'],
  ['CENTRO', 'Centro'],
  ['PARRAS', 'Parras'],
  ['OFICINA', 'Oficina'],
];

function mapearSucursal(etiqueta) {
  const t = normalizar(etiqueta);
  if (!t) return null;
  const encontrado = ALIAS_SUCURSAL.find(([alias]) => t.includes(alias));
  return encontrado ? encontrado[1] : null;
}

function extraerSucursalDeTitulo(filas) {
  for (let r = 0; r < Math.min(10, filas.length); r++) {
    for (const celda of filas[r] || []) {
      if (typeof celda === 'string' && /CORTE\s+DE\s+CAJA/i.test(celda)) {
        return celda.replace(/CORTE\s+DE\s+CAJA/i, '').trim();
      }
    }
  }
  return null;
}

function encontrarEncabezadoTabla(filas) {
  for (let r = 0; r < filas.length; r++) {
    const fila = filas[r] || [];
    const colMonto = fila.findIndex((c) => typeof c === 'string' && /MONTO\s*PAGO/i.test(c));
    if (colMonto === -1) continue;
    const colFecha = fila.findIndex((c) => typeof c === 'string' && /FECHA\s*PAGO/i.test(c));
    return { filaHeader: r, colMonto, colFecha };
  }
  return null;
}

function extraerTotalYMes(filas, filaHeader, colMonto, colFecha) {
  const conteoMeses = {};

  for (let r = filaHeader + 1; r < filas.length; r++) {
    const fila = filas[r] || [];
    const primerTexto = fila.find((c) => typeof c === 'string' && c.trim());

    if (primerTexto && normalizar(primerTexto) === 'TOTAL') {
      const total = Number(fila[colMonto]);
      if (Number.isNaN(total)) return null;
      return { total, conteoMeses };
    }

    if (colFecha !== -1) {
      const valor = fila[colFecha];
      const fecha = valor instanceof Date ? valor : typeof valor === 'string' && valor ? new Date(valor) : null;
      if (fecha && !Number.isNaN(fecha.getTime())) {
        const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        conteoMeses[clave] = (conteoMeses[clave] || 0) + 1;
      }
    }
  }

  return null;
}

function procesarHoja(sheet) {
  const filas = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  const tituloSucursal = extraerSucursalDeTitulo(filas);
  if (!tituloSucursal) return { error: 'No se encontro el titulo "CORTE DE CAJA <sucursal>" en el archivo.' };

  const sucursal = mapearSucursal(tituloSucursal);
  if (!sucursal) return { error: `No se pudo identificar la sucursal a partir de "${tituloSucursal}".` };
  if (!sucursalesDb.existeActiva(sucursal)) {
    return { error: `La sucursal "${sucursal}" no esta activa; no se puede importar.` };
  }

  const encabezado = encontrarEncabezadoTabla(filas);
  if (!encabezado) return { error: 'No se encontro la columna "Monto Pago" de la primera tabla.' };

  const resultado = extraerTotalYMes(filas, encabezado.filaHeader, encabezado.colMonto, encabezado.colFecha);
  if (!resultado) return { error: 'No se encontro la fila "Total" de la primera tabla, o su monto no es valido.' };

  const meses = Object.entries(resultado.conteoMeses).sort((a, b) => b[1] - a[1]);
  if (meses.length === 0) return { error: 'No se pudieron leer fechas en la primera tabla para determinar el mes.' };

  return {
    sucursal,
    mes: meses[0][0],
    total: Math.round(resultado.total * 100) / 100,
  };
}

function procesarCorteMes(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const errores = [];
  for (const nombreHoja of workbook.SheetNames) {
    const resultado = procesarHoja(workbook.Sheets[nombreHoja]);
    if (!resultado.error) return resultado;
    errores.push(`${nombreHoja}: ${resultado.error}`);
  }

  throw new Error(errores[0] || 'No se pudo leer el archivo.');
}

module.exports = { procesarCorteMes };
