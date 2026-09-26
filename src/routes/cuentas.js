const express = require('express');
const db = require('../db');
const { revisarVencimientos, revisarAvisosWhatsApp } = require('../cron');
const { enviarCSV, enviarXLSX } = require('../export');
const { TIPOS_GASTO } = require('../constants');
const sucursalesDb = require('../sucursales');
const { calcularDivision, nuevoGrupoId } = require('../division');

const router = express.Router();

const COLUMNAS = [
  { header: 'Proveedor', key: 'proveedor', width: 25 },
  { header: 'Concepto', key: 'concepto', width: 25 },
  { header: 'Sucursal', key: 'sucursal', width: 18 },
  { header: 'Division', key: 'division_texto', width: 40 },
  { header: 'Tipo de Gasto', key: 'tipo_gasto', width: 25 },
  { header: 'Fecha Emision', key: 'fecha_emision', width: 15 },
  { header: 'Fecha Vencimiento', key: 'fecha_vencimiento', width: 18 },
  { header: 'Monto', key: 'monto', width: 15 },
  { header: 'Fija', key: 'es_fijo', width: 10 },
  { header: 'Pagada', key: 'pagada', width: 10 },
];

// Texto que se guarda en la columna sucursal cuando la cuenta se reparte
// entre varias clinicas (el detalle vive en la columna division).
const SUCURSAL_DIVIDIDA = 'Varias clinicas';

function leerDivision(cuenta) {
  if (!cuenta.division) return null;
  try {
    return JSON.parse(cuenta.division);
  } catch {
    return null;
  }
}

// Monto que le toca a cada clinica de una cuenta dividida (null si no esta dividida).
function repartoDeCuenta(cuenta) {
  const division = leerDivision(cuenta);
  if (!division) return null;
  const resultado = calcularDivision(division.modo, division.partes, cuenta.monto, () => true);
  return resultado.error ? null : resultado.filas;
}

// Sucursales de una cuenta dividida que ya pagaron su parte. Las cuentas
// pagadas antes de que existiera el pago por clinica cuentan como pagadas completas.
function partesPagadasDeCuenta(cuenta) {
  const reparto = repartoDeCuenta(cuenta);
  if (!reparto) return [];
  if (cuenta.partes_pagadas) {
    try {
      const pagadas = JSON.parse(cuenta.partes_pagadas);
      return reparto.map((f) => f.sucursal).filter((s) => pagadas.includes(s));
    } catch {
      return [];
    }
  }
  return cuenta.pagada ? reparto.map((f) => f.sucursal) : [];
}

function conReparto(cuenta) {
  return {
    ...cuenta,
    division: leerDivision(cuenta),
    reparto: repartoDeCuenta(cuenta),
    partes_pagadas: partesPagadasDeCuenta(cuenta),
  };
}

// Valida la division que manda el formulario. Regresa { error } o
// { division, monto }: division es el JSON a guardar (null si no se divide) y
// monto el total de la cuenta (en modo cantidad es la suma de las partes).
function prepararDivision(division, monto) {
  if (!division) return { division: null, monto };
  const modo = division.modo || 'igual';
  const partes = Array.isArray(division.partes)
    ? division.partes.map((p) => ({ sucursal: p && p.sucursal, valor: modo === 'igual' ? null : Number(p && p.valor) }))
    : [];
  const resultado = calcularDivision(modo, partes, monto, (s) => sucursalesDb.existeActiva(s));
  if (resultado.error) return { error: resultado.error };
  return { division: JSON.stringify({ modo, partes }), monto: resultado.montoTotal };
}

function validarCuenta(body) {
  const requeridos = ['proveedor', 'concepto', 'fecha_emision', 'fecha_vencimiento', 'tipo_gasto'];
  if (!body.division) requeridos.push('sucursal');
  if (!body.division || body.division.modo !== 'cantidad') requeridos.push('monto');
  for (const campo of requeridos) {
    if (body[campo] === undefined || body[campo] === null || body[campo] === '') {
      return `Falta el campo: ${campo}`;
    }
  }
  if (body.monto !== undefined && body.monto !== '' && Number.isNaN(Number(body.monto))) return 'El monto debe ser un numero';
  if (!body.division && !sucursalesDb.existeActiva(body.sucursal)) return 'Sucursal invalida';
  if (!TIPOS_GASTO.includes(body.tipo_gasto)) return 'Tipo de gasto invalido';
  return null;
}

// Suma un mes a una fecha AAAA-MM-DD conservando el dia (con el ajuste normal
// de JS cuando ese dia no existe en el mes siguiente, p.ej. 31 de enero).
function mesSiguienteFecha(fechaISO) {
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// Deja en gastos exactamente un renglon por cada clinica pagada de una cuenta
// dividida: crea los de clinicas recien pagadas, borra solo los de clinicas
// que se desmarcaron y actualiza el resto (sin tocar su comprobante).
// Regresa el grupo_id de esos gastos (null si no quedo ninguna clinica pagada).
function sincronizarPagosDivididos(cuenta, grupoIdActual, pagadas) {
  const reparto = repartoDeCuenta(cuenta);
  const grupoId = grupoIdActual || nuevoGrupoId();
  const existentes = db.prepare('SELECT id, sucursal FROM gastos WHERE grupo_id = ?').all(grupoId);

  for (const g of existentes) {
    const parte = reparto.find((f) => f.sucursal === g.sucursal);
    if (!parte || !pagadas.includes(g.sucursal)) {
      db.prepare('DELETE FROM gastos WHERE id = ?').run(g.id);
    } else {
      db.prepare('UPDATE gastos SET tipo_gasto = ?, concepto = ?, fecha = ?, monto = ?, monto_total = ? WHERE id = ?').run(
        cuenta.tipo_gasto, cuenta.concepto, cuenta.fecha_vencimiento, parte.monto, cuenta.monto, g.id
      );
    }
  }

  const insert = db.prepare(
    'INSERT INTO gastos (sucursal, tipo_gasto, concepto, fecha, monto, grupo_id, monto_total) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const f of reparto) {
    if (pagadas.includes(f.sucursal) && !existentes.some((g) => g.sucursal === f.sucursal)) {
      insert.run(f.sucursal, cuenta.tipo_gasto, cuenta.concepto, cuenta.fecha_vencimiento, f.monto, grupoId, cuenta.monto);
    }
  }

  return pagadas.length ? grupoId : null;
}

function eliminarGastosDeCuenta(gastoId, grupoId) {
  eliminarGastoSiExiste(gastoId);
  if (grupoId) db.prepare('DELETE FROM gastos WHERE grupo_id = ?').run(grupoId);
}

function crearGastoDesdeCuenta(cuenta) {
  const info = db
    .prepare('INSERT INTO gastos (sucursal, tipo_gasto, concepto, fecha, monto) VALUES (?, ?, ?, ?, ?)')
    .run(cuenta.sucursal, cuenta.tipo_gasto, cuenta.concepto, cuenta.fecha_vencimiento, cuenta.monto);
  return info.lastInsertRowid;
}

function actualizarGastoDesdeCuenta(gastoId, cuenta) {
  db.prepare('UPDATE gastos SET sucursal = ?, tipo_gasto = ?, concepto = ?, fecha = ?, monto = ? WHERE id = ?').run(
    cuenta.sucursal,
    cuenta.tipo_gasto,
    cuenta.concepto,
    cuenta.fecha_vencimiento,
    cuenta.monto,
    gastoId
  );
}

function eliminarGastoSiExiste(gastoId) {
  if (gastoId) db.prepare('DELETE FROM gastos WHERE id = ?').run(gastoId);
}

function crearSiguienteFija(cuenta) {
  // Si se desmarca y se vuelve a pagar, la del siguiente mes ya existe: no se duplica.
  const yaExiste = db
    .prepare('SELECT id FROM cuentas_por_pagar WHERE es_fijo = 1 AND proveedor = ? AND concepto = ? AND fecha_vencimiento = ?')
    .get(cuenta.proveedor, cuenta.concepto, mesSiguienteFecha(cuenta.fecha_vencimiento));
  if (yaExiste) return;

  db.prepare(
    `INSERT INTO cuentas_por_pagar (proveedor, concepto, numero_factura, fecha_emision, fecha_vencimiento, monto, sucursal, tipo_gasto, es_fijo, division)
     VALUES (?, ?, '', ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    cuenta.proveedor,
    cuenta.concepto,
    mesSiguienteFecha(cuenta.fecha_emision),
    mesSiguienteFecha(cuenta.fecha_vencimiento),
    cuenta.monto,
    cuenta.sucursal,
    cuenta.tipo_gasto,
    cuenta.division
  );
}

router.get('/', (req, res) => {
  const cuentas = db.prepare('SELECT * FROM cuentas_por_pagar ORDER BY fecha_vencimiento ASC').all();
  res.json(cuentas.map(conReparto));
});

router.post('/', (req, res) => {
  const error = validarCuenta(req.body);
  if (error) return res.status(400).json({ error });

  const { proveedor, concepto, fecha_emision, fecha_vencimiento, tipo_gasto } = req.body;
  const es_fijo = req.body.es_fijo ? 1 : 0;

  const preparada = prepararDivision(req.body.division, Number(req.body.monto));
  if (preparada.error) return res.status(400).json({ error: preparada.error });
  const { division, monto } = preparada;
  const sucursal = division ? SUCURSAL_DIVIDIDA : req.body.sucursal;

  const info = db
    .prepare(
      `INSERT INTO cuentas_por_pagar (proveedor, concepto, numero_factura, fecha_emision, fecha_vencimiento, monto, sucursal, tipo_gasto, es_fijo, division)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(proveedor, concepto, '', fecha_emision, fecha_vencimiento, monto, sucursal, tipo_gasto, es_fijo, division);

  const nueva = db.prepare('SELECT * FROM cuentas_por_pagar WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(conReparto(nueva));
});

router.put('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM cuentas_por_pagar WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ error: 'No encontrada' });

  const proveedor = req.body.proveedor ?? existente.proveedor;
  const concepto = req.body.concepto ?? existente.concepto;
  const fecha_emision = req.body.fecha_emision ?? existente.fecha_emision;
  const fecha_vencimiento = req.body.fecha_vencimiento ?? existente.fecha_vencimiento;
  let monto = req.body.monto !== undefined && req.body.monto !== '' ? Number(req.body.monto) : existente.monto;
  let sucursal = req.body.sucursal ?? existente.sucursal;
  let division = existente.division;
  const tipo_gasto = req.body.tipo_gasto ?? existente.tipo_gasto;
  const es_fijo = req.body.es_fijo !== undefined ? (req.body.es_fijo ? 1 : 0) : existente.es_fijo;
  const pagadaNueva = req.body.pagada !== undefined ? (req.body.pagada ? 1 : 0) : existente.pagada;

  if (req.body.division !== undefined) {
    // El formulario manda division (o null) al editar: se revalida y recalcula.
    const preparada = prepararDivision(req.body.division, monto);
    if (preparada.error) return res.status(400).json({ error: preparada.error });
    division = preparada.division;
    monto = preparada.monto;
    if (division) sucursal = SUCURSAL_DIVIDIDA;
  }
  if (!division && (req.body.sucursal !== undefined || existente.division) && !sucursalesDb.existeActiva(sucursal)) {
    return res.status(400).json({ error: 'Sucursal invalida' });
  }
  if (req.body.tipo_gasto !== undefined && !TIPOS_GASTO.includes(tipo_gasto)) {
    return res.status(400).json({ error: 'Tipo de gasto invalido' });
  }
  if (Number.isNaN(monto)) {
    return res.status(400).json({ error: 'El monto debe ser un numero' });
  }

  const cuentaActualizada = { proveedor, concepto, fecha_emision, fecha_vencimiento, monto, sucursal, tipo_gasto, division };
  let gastoId = existente.gasto_id;
  let grupoId = existente.gasto_grupo_id;
  let pagadaFinal = pagadaNueva;
  let partesPagadas = null;

  if (division) {
    // Cuenta dividida: cada clinica paga su parte por separado.
    const todas = repartoDeCuenta(cuentaActualizada).map((f) => f.sucursal);
    let deseadas;
    if (Array.isArray(req.body.partes_pagadas)) deseadas = req.body.partes_pagadas;
    else if (req.body.pagada !== undefined) deseadas = req.body.pagada ? todas : [];
    else if (existente.division) deseadas = partesPagadasDeCuenta(existente);
    else deseadas = existente.pagada ? todas : [];
    deseadas = todas.filter((s) => deseadas.includes(s));

    // Si antes no estaba dividida, su gasto unico se reemplaza por los de cada clinica.
    eliminarGastoSiExiste(gastoId);
    gastoId = null;
    grupoId = sincronizarPagosDivididos(cuentaActualizada, grupoId, deseadas);
    partesPagadas = JSON.stringify(deseadas);
    pagadaFinal = deseadas.length === todas.length ? 1 : 0;
    if (!existente.pagada && pagadaFinal && es_fijo) crearSiguienteFija(cuentaActualizada);
  } else {
    let yaPagada = existente.pagada;
    if (grupoId) {
      // Se quito la division: se borran los gastos por clinica y, si estaba
      // pagada completa, se registra de nuevo como un solo gasto.
      eliminarGastosDeCuenta(null, grupoId);
      grupoId = null;
      if (existente.pagada && pagadaNueva) gastoId = crearGastoDesdeCuenta(cuentaActualizada);
      yaPagada = existente.pagada && pagadaNueva;
    }

    if (!yaPagada && pagadaNueva) {
      // Se marca como pagada: se registra automaticamente como gasto.
      if (!sucursal || !tipo_gasto) {
        return res.status(400).json({ error: 'Para marcar como pagada, la cuenta necesita sucursal y tipo de gasto' });
      }
      gastoId = crearGastoDesdeCuenta(cuentaActualizada);
      if (es_fijo && !existente.pagada) crearSiguienteFija(cuentaActualizada);
    } else if (yaPagada && !pagadaNueva) {
      // Se regresa a pendiente: se deshace el gasto que se habia registrado.
      eliminarGastoSiExiste(gastoId);
      gastoId = null;
    } else if (yaPagada && pagadaNueva && gastoId) {
      // Sigue pagada pero se edito algun dato: se refleja en el gasto ya creado.
      actualizarGastoDesdeCuenta(gastoId, cuentaActualizada);
    }
  }

  db.prepare(
    `UPDATE cuentas_por_pagar
     SET proveedor = ?, concepto = ?, fecha_emision = ?, fecha_vencimiento = ?, monto = ?, pagada = ?, sucursal = ?, tipo_gasto = ?, es_fijo = ?, gasto_id = ?, division = ?, gasto_grupo_id = ?, partes_pagadas = ?
     WHERE id = ?`
  ).run(proveedor, concepto, fecha_emision, fecha_vencimiento, monto, pagadaFinal, sucursal, tipo_gasto, es_fijo, gastoId, division, grupoId, partesPagadas, req.params.id);

  const actualizada = db.prepare('SELECT * FROM cuentas_por_pagar WHERE id = ?').get(req.params.id);
  res.json(conReparto(actualizada));
});

router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT gasto_id, gasto_grupo_id FROM cuentas_por_pagar WHERE id = ?').get(req.params.id);
  const info = db.prepare('DELETE FROM cuentas_por_pagar WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrada' });
  if (existente) eliminarGastosDeCuenta(existente.gasto_id, existente.gasto_grupo_id);
  res.status(204).end();
});

router.post('/revisar-vencimientos', async (req, res) => {
  await revisarVencimientos();
  await revisarAvisosWhatsApp();
  res.json({ ok: true });
});

function paraExportar(cuentas) {
  return cuentas.map((c) => {
    const reparto = repartoDeCuenta(c);
    return {
      ...c,
      pagada: c.pagada ? 'Si' : partesPagadasDeCuenta(c).length ? 'Parcial' : 'No',
      es_fijo: c.es_fijo ? 'Si' : 'No',
      division_texto: reparto
        ? reparto
            .map((f) => `${f.sucursal}: ${f.monto.toFixed(2)}${partesPagadasDeCuenta(c).includes(f.sucursal) ? ' (pagada)' : ''}`)
            .join(', ')
        : '',
    };
  });
}

router.get('/export/csv', (req, res) => {
  const cuentas = db.prepare('SELECT * FROM cuentas_por_pagar ORDER BY fecha_vencimiento ASC').all();
  enviarCSV(res, 'cuentas_por_pagar', COLUMNAS, paraExportar(cuentas));
});

router.get('/export/xlsx', async (req, res) => {
  const cuentas = db.prepare('SELECT * FROM cuentas_por_pagar ORDER BY fecha_vencimiento ASC').all();
  await enviarXLSX(res, 'cuentas_por_pagar', 'Cuentas por pagar', COLUMNAS, paraExportar(cuentas));
});

module.exports = router;
