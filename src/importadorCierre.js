const ExcelJS = require('exceljs');

const MESES = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7,
  AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};
const NOMBRES_MES = Object.keys(MESES);

function normalizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

function mapearSucursal(etiqueta) {
  const t = normalizar(etiqueta);
  if (!t) return null;
  if (t.includes('RAMOS')) return 'Benavides';
  if (t.includes('SATELITE') || t.includes('ROMA')) return 'Satélite';
  if (t.includes('NAZAS')) return 'Torreón';
  if (t.includes('TORRES')) return 'Las Torres';
  if (t.includes('TORREON')) return 'Torreón';
  if (t.includes('TERESITAS')) return 'Cardenas';
  if (t.includes('MUSA') && t.includes('IXTLERO')) return 'Ixtlero';
  if (t.includes('LOURDES')) return 'Lourdes';
  if (t === 'MUSA') return 'Musa';
  if (t === 'FLORES') return 'Flores';
  if (t === 'MIRASIERRA') return 'Mirasierra';
  if (t === 'SEMINARIO') return 'Seminario';
  if (t === 'CARDENAS') return 'Cardenas';
  if (t === 'IXTLERO') return 'Ixtlero';
  if (t === 'CENTRO') return 'Centro';
  if (t === 'PARRAS') return 'Parras';
  return null;
}

function esOdontomovil(etiqueta) {
  return normalizar(etiqueta).includes('ODONTOMOVIL');
}

function esCeldaDeClinica(etiqueta) {
  return !!mapearSucursal(etiqueta) || esOdontomovil(etiqueta);
}

const MAPA_TIPO_GASTO = {
  DENTALMIX: 'Dentalmix (depósito dental interno)',
  ESPECIALISTAS: 'Especialistas',
  LABORATORIO: 'Laboratorio interno',
  'COMISIONES MANAGER': 'Comisiones manager global',
  'COMISIONES DOCTORES': 'Comisiones doctores',
  'COMISIONES RECEPCION': 'Comisiones recepción',
  RENTA: 'Renta local comercial',
  CELULAR: 'Pago celulares y saldo',
  LIMPIEZA: 'Limpieza',
  PAPELERIA: 'Papelería y oficina',
  MANTENIMIENTO: 'Mantenimiento',
  GASOLINA: 'Gasolina y tag',
  MERCADOTECNIA: 'Mercadotecnia (agencias y saldo meta)',
  'NOMINA/IMSS/ISN/ISR': 'Nómina/IMSS/ISN/ISR',
  COMODIN: 'Nómina IMSS ISN e ISR de comodines',
  ADMINISTRACION: 'Nómina IMSS ISN e ISR administración',
  'GASTOS ADMINISTRATIVOS': 'Trámites administrativos',
  'DEVOLUCION A PXS': 'Devolución a pacientes',
  'RENTA DRA LUPITA': 'Renta de casas',
  'RENTAS DOCTORES': 'Renta de casas',
  TOMOX: 'Tomox',
  'COMISION POR RX TOMOX': 'Tomox',
  MEDICAMENTOS: 'Insumos médicos externos',
  'SERVICIO BECARIO': 'Servicio becario',
  BECARIAS: 'Servicio becario',
  'COMISIONES BANCARIAS TPV': 'Comisiones bancarias',
  CMP: 'Software odontológico',
  'HONORARIOS CONTABLES': 'Honorarios contables y timbres',
  'HONARIOS CONTADORES': 'Honorarios contables y timbres',
  OTROS: 'Otros',
};
const CATEGORIAS_SERVICIOS = ['LUZ', 'AGUA', 'INTERNET'];
const CATEGORIAS_IGNORAR = new Set([
  'META MENSUAL', '% DE ALCANCE', 'TOTAL DE VENTA', 'PUNTO DE EQUILIBRIO', 'MES', '',
  'UTILIDAD', 'UTILIDAD ANTES DE IMP', 'UTILIDAD ANTES DE IMPUESTOS', 'FALTANTE PARA META',
]);

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'object' && v.result !== undefined) return Number(v.result) || 0;
  return Number(v) || 0;
};

function detectarMesArchivo(nombreArchivo) {
  const t = normalizar(nombreArchivo);
  const mesEncontrado = NOMBRES_MES.find((m) => t.includes(m));
  const anioMatch = t.match(/\b(20\d{2})\b/);
  return { mes: mesEncontrado || null, anio: anioMatch ? Number(anioMatch[1]) : null };
}

function encontrarHojaIngresos(workbook) {
  let mejor = null;
  let mejorAnio = -1;
  workbook.worksheets.forEach((ws) => {
    const t = normalizar(ws.name);
    if (!t.includes('REPORTE') || !t.includes('INGRES')) return;
    const m = t.match(/(20\d{2})/);
    const anio = m ? Number(m[1]) : 0;
    if (anio >= mejorAnio) {
      mejorAnio = anio;
      mejor = ws;
    }
  });
  return { hoja: mejor, anio: mejorAnio > 0 ? mejorAnio : null };
}

function encontrarHojaGastos(workbook, nombreMes) {
  const candidatas = workbook.worksheets.filter((ws) => normalizar(ws.name).includes('GASTOS'));
  if (candidatas.length === 0) return null;
  if (nombreMes) {
    const conMes = candidatas.find((ws) => normalizar(ws.name).includes(nombreMes));
    if (conMes) return conMes;
  }
  return candidatas[0];
}

function extraerIngresosDelMes(ws, anio, mesNombre) {
  const resultados = [];
  const sinMapear = [];
  if (!ws || !anio || !mesNombre) return { resultados, sinMapear };

  let filaHeader = null;
  let colEnero = null;
  for (let r = 1; r <= 10 && !filaHeader; r++) {
    for (let c = 1; c <= 20; c++) {
      if (normalizar(ws.getCell(r, c).value) === 'ENERO') {
        filaHeader = r;
        colEnero = c;
        break;
      }
    }
  }
  if (!filaHeader) return { resultados, sinMapear };

  const colClinica = colEnero - 1;
  const colMes = colEnero + (MESES[mesNombre] - 1);

  for (let r = filaHeader + 1; r <= filaHeader + 40; r++) {
    const etiqueta = ws.getCell(r, colClinica).value;
    if (!etiqueta) continue;
    if (normalizar(etiqueta) === 'TOTAL') break;

    const sucursal = mapearSucursal(etiqueta);
    if (!sucursal) {
      if (!esOdontomovil(etiqueta)) sinMapear.push(`ingreso sucursal sin mapear: "${etiqueta}"`);
      continue;
    }
    const monto = num(ws.getCell(r, colMes).value);
    if (!monto) continue;
    resultados.push({ sucursal, monto });
  }

  return { resultados, sinMapear };
}

function extraerGastosDelMes(ws) {
  const gastos = [];
  const sinMapear = [];
  if (!ws) return { gastos, sinMapear };

  const maxCol = Math.min(ws.columnCount || 60, 200);

  let filaHeader = null;
  let bloques = [];
  for (let r = 1; r <= 5; r++) {
    const candidatos = [];
    for (let c = 1; c <= maxCol; c++) {
      const valor = ws.getCell(r, c).value;
      if (valor && esCeldaDeClinica(valor)) candidatos.push({ col: c, etiqueta: valor });
    }
    if (candidatos.length > bloques.length) {
      bloques = candidatos;
      filaHeader = r;
    }
  }
  if (!filaHeader || bloques.length < 3) return { gastos, sinMapear };

  const acumuladoPorSucursal = {};

  for (const bloque of bloques) {
    const sucursal = mapearSucursal(bloque.etiqueta);
    if (!sucursal) continue; // ej. Odontomovil, se omite a proposito

    const acumulado = acumuladoPorSucursal[sucursal] || {};
    let servicios = 0;

    for (let r = filaHeader + 1; r <= filaHeader + 45; r++) {
      const etiquetaCat = ws.getCell(r, bloque.col).value;
      if (!etiquetaCat) continue;
      const catNorm = normalizar(etiquetaCat);
      if (CATEGORIAS_IGNORAR.has(catNorm)) continue;

      const monto = num(ws.getCell(r, bloque.col + 1).value);

      if (CATEGORIAS_SERVICIOS.includes(catNorm)) {
        servicios += monto;
        continue;
      }

      const tipoApp = MAPA_TIPO_GASTO[catNorm];
      if (!tipoApp) {
        if (monto) sinMapear.push(`categoria de gasto sin mapear: "${etiquetaCat}" (clinica ${bloque.etiqueta})`);
        continue;
      }
      if (!monto) continue;
      acumulado[tipoApp] = (acumulado[tipoApp] || 0) + monto;
    }

    if (servicios) {
      acumulado['Servicios (agua, luz, teléfono, internet)'] = (acumulado['Servicios (agua, luz, teléfono, internet)'] || 0) + servicios;
    }

    acumuladoPorSucursal[sucursal] = acumulado;
  }

  for (const [sucursal, categorias] of Object.entries(acumuladoPorSucursal)) {
    for (const [tipo_gasto, monto] of Object.entries(categorias)) {
      gastos.push({ sucursal, tipo_gasto, monto: Math.round(monto * 100) / 100 });
    }
  }

  return { gastos, sinMapear };
}

async function procesarArchivo(buffer, nombreArchivo) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const { mes: mesNombre, anio: anioArchivo } = detectarMesArchivo(nombreArchivo);
  if (!mesNombre) {
    throw new Error('No se pudo identificar el mes en el nombre del archivo. Incluye el mes en el nombre (ej. "Cierre de mes Diciembre").');
  }

  const { hoja: hojaIngresos, anio: anioHoja } = encontrarHojaIngresos(workbook);
  const anio = anioArchivo || anioHoja;
  if (!anio) {
    throw new Error('No se pudo determinar el año (ni en el nombre del archivo ni en las hojas de ingresos).');
  }

  const mes = `${anio}-${String(MESES[mesNombre]).padStart(2, '0')}`;

  const { resultados: ingresos, sinMapear: sinMapearIngresos } = extraerIngresosDelMes(hojaIngresos, anio, mesNombre);

  const hojaGastos = encontrarHojaGastos(workbook, mesNombre);
  if (!hojaGastos) {
    throw new Error('No se encontro ninguna hoja de GASTOS en el archivo.');
  }
  const { gastos, sinMapear: sinMapearGastos } = extraerGastosDelMes(hojaGastos);

  return { mes, ingresos, gastos, sinMapear: [...sinMapearIngresos, ...sinMapearGastos] };
}

module.exports = { procesarArchivo };
