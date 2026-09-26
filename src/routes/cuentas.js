const express = require('express');
const db = require('../db');
const { revisarVencimientos, revisarAvisosWhatsApp } = require('../cron');
const { probarWhatsApp } = require('../whatsapp');
const { requireAdmin } = require('../auth');
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

function conReparto(cuenta) {
  return { ...cuenta, division: leerDivision(cuenta), reparto: repartoDeCuenta(cuenta) };
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

// Registra el gasto de una cuenta pagada. Si la cuenta esta dividida se crea un
// gasto compartido (un renglon por clinica) y se regresa su grupo_id.
function registrarGastoDeCuenta(cuenta) {
  const reparto = repartoDeCuenta(cuenta);
  if (!reparto) return { gastoId: crearGastoDesdeCuenta(cuenta), grupoId: null };

  const grupoId = nuevoGrupoId();
  const insert = db.prepare(
    'INSERT INTO gastos (sucursal, tipo_gasto, concepto, fecha, monto, grupo_id, monto_total) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const f of reparto) {
    insert.run(f.sucursal, cuenta.tipo_gasto, cuenta.concepto, cuenta.fecha_vencimiento, f.monto, grupoId, cuenta.monto);
  }
  return { gastoId: null, grupoId };
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

  if (!existente.pagada && pagadaNueva) {
    // Se marca como pagada: se registra automaticamente como gasto.
    if (!sucursal || !tipo_gasto) {
      return res.status(400).json({ error: 'Para marcar como pagada, la cuenta necesita sucursal y tipo de gasto' });
    }
    ({ gastoId, grupoId } = registrarGastoDeCuenta(cuentaActualizada));
    if (es_fijo) crearSiguienteFija(cuentaActualizada);
  } else if (existente.pagada && !pagadaNueva) {
    // Se regresa a pendiente: se deshace el gasto que se habia registrado.
    eliminarGastosDeCuenta(gastoId, grupoId);
    gastoId = null;
    grupoId = null;
  } else if (existente.pagada && pagadaNueva && (division || grupoId)) {
    // Sigue pagada pero se edito una cuenta dividida (o que lo estaba): se
    // rehacen los gastos para que el reparto quede igual que la cuenta.
    eliminarGastosDeCuenta(gastoId, grupoId);
    ({ gastoId, grupoId } = registrarGastoDeCuenta(cuentaActualizada));
  } else if (existente.pagada && pagadaNueva && gastoId) {
    // Sigue pagada pero se edito algun dato: se refleja en el gasto ya creado.
    actualizarGastoDesdeCuenta(gastoId, cuentaActualizada);
  }

  db.prepare(
    `UPDATE cuentas_por_pagar
     SET proveedor = ?, concepto = ?, fecha_emision = ?, fecha_vencimiento = ?, monto = ?, pagada = ?, sucursal = ?, tipo_gasto = ?, es_fijo = ?, gasto_id = ?, division = ?, gasto_grupo_id = ?
     WHERE id = ?`
  ).run(proveedor, concepto, fecha_emision, fecha_vencimiento, monto, pagadaNueva, sucursal, tipo_gasto, es_fijo, gastoId, division, grupoId, req.params.id);

  if (fecha_vencimiento !== existente.fecha_vencimiento) {
    // Nueva fecha de vencimiento: los avisos se vuelven a mandar con respecto a ella.
    db.prepare(
      'UPDATE cuentas_por_pagar SET aviso_7_enviado = 0, aviso_3_enviado = 0, aviso_1_enviado = 0, notificada_at = NULL WHERE id = ?'
    ).run(req.params.id);
  }

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

router.post('/probar-whatsapp', requireAdmin, async (req, res) => {
  try {
    res.json(await probarWhatsApp());
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al probar WhatsApp' });
  }
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
      pagada: c.pagada ? 'Si' : 'No',
      es_fijo: c.es_fijo ? 'Si' : 'No',
      division_texto: reparto ? reparto.map((f) => `${f.sucursal}: ${f.monto.toFixed(2)}`).join(', ') : '',
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
