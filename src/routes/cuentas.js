const express = require('express');
const db = require('../db');
const { revisarVencimientos, revisarAvisosWhatsApp } = require('../cron');
const { enviarCSV, enviarXLSX } = require('../export');
const { TIPOS_GASTO } = require('../constants');
const sucursalesDb = require('../sucursales');

const router = express.Router();

const COLUMNAS = [
  { header: 'Proveedor', key: 'proveedor', width: 25 },
  { header: 'Concepto', key: 'concepto', width: 25 },
  { header: 'Sucursal', key: 'sucursal', width: 18 },
  { header: 'Tipo de Gasto', key: 'tipo_gasto', width: 25 },
  { header: 'Fecha Emision', key: 'fecha_emision', width: 15 },
  { header: 'Fecha Vencimiento', key: 'fecha_vencimiento', width: 18 },
  { header: 'Monto', key: 'monto', width: 15 },
  { header: 'Fija', key: 'es_fijo', width: 10 },
  { header: 'Pagada', key: 'pagada', width: 10 },
];

function validarCuenta(body) {
  const requeridos = ['proveedor', 'concepto', 'fecha_emision', 'fecha_vencimiento', 'monto', 'sucursal', 'tipo_gasto'];
  for (const campo of requeridos) {
    if (body[campo] === undefined || body[campo] === null || body[campo] === '') {
      return `Falta el campo: ${campo}`;
    }
  }
  if (Number.isNaN(Number(body.monto))) return 'El monto debe ser un numero';
  if (!sucursalesDb.existeActiva(body.sucursal)) return 'Sucursal invalida';
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
    `INSERT INTO cuentas_por_pagar (proveedor, concepto, numero_factura, fecha_emision, fecha_vencimiento, monto, sucursal, tipo_gasto, es_fijo)
     VALUES (?, ?, '', ?, ?, ?, ?, ?, 1)`
  ).run(
    cuenta.proveedor,
    cuenta.concepto,
    mesSiguienteFecha(cuenta.fecha_emision),
    mesSiguienteFecha(cuenta.fecha_vencimiento),
    cuenta.monto,
    cuenta.sucursal,
    cuenta.tipo_gasto
  );
}

router.get('/', (req, res) => {
  const cuentas = db.prepare('SELECT * FROM cuentas_por_pagar ORDER BY fecha_vencimiento ASC').all();
  res.json(cuentas);
});

router.post('/', (req, res) => {
  const error = validarCuenta(req.body);
  if (error) return res.status(400).json({ error });

  const { proveedor, concepto, fecha_emision, fecha_vencimiento, monto, sucursal, tipo_gasto } = req.body;
  const es_fijo = req.body.es_fijo ? 1 : 0;

  const info = db
    .prepare(
      `INSERT INTO cuentas_por_pagar (proveedor, concepto, numero_factura, fecha_emision, fecha_vencimiento, monto, sucursal, tipo_gasto, es_fijo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(proveedor, concepto, '', fecha_emision, fecha_vencimiento, Number(monto), sucursal, tipo_gasto, es_fijo);

  const nueva = db.prepare('SELECT * FROM cuentas_por_pagar WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(nueva);
});

router.put('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM cuentas_por_pagar WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ error: 'No encontrada' });

  const proveedor = req.body.proveedor ?? existente.proveedor;
  const concepto = req.body.concepto ?? existente.concepto;
  const fecha_emision = req.body.fecha_emision ?? existente.fecha_emision;
  const fecha_vencimiento = req.body.fecha_vencimiento ?? existente.fecha_vencimiento;
  const monto = req.body.monto !== undefined ? Number(req.body.monto) : existente.monto;
  const sucursal = req.body.sucursal ?? existente.sucursal;
  const tipo_gasto = req.body.tipo_gasto ?? existente.tipo_gasto;
  const es_fijo = req.body.es_fijo !== undefined ? (req.body.es_fijo ? 1 : 0) : existente.es_fijo;
  const pagadaNueva = req.body.pagada !== undefined ? (req.body.pagada ? 1 : 0) : existente.pagada;

  if (req.body.sucursal !== undefined && !sucursalesDb.existeActiva(sucursal)) {
    return res.status(400).json({ error: 'Sucursal invalida' });
  }
  if (req.body.tipo_gasto !== undefined && !TIPOS_GASTO.includes(tipo_gasto)) {
    return res.status(400).json({ error: 'Tipo de gasto invalido' });
  }
  if (Number.isNaN(monto)) {
    return res.status(400).json({ error: 'El monto debe ser un numero' });
  }

  const cuentaActualizada = { proveedor, concepto, fecha_emision, fecha_vencimiento, monto, sucursal, tipo_gasto };
  let gastoId = existente.gasto_id;

  if (!existente.pagada && pagadaNueva) {
    // Se marca como pagada: se registra automaticamente como gasto.
    if (!sucursal || !tipo_gasto) {
      return res.status(400).json({ error: 'Para marcar como pagada, la cuenta necesita sucursal y tipo de gasto' });
    }
    gastoId = crearGastoDesdeCuenta(cuentaActualizada);
    if (es_fijo) crearSiguienteFija(cuentaActualizada);
  } else if (existente.pagada && !pagadaNueva) {
    // Se regresa a pendiente: se deshace el gasto que se habia registrado.
    eliminarGastoSiExiste(gastoId);
    gastoId = null;
  } else if (existente.pagada && pagadaNueva && gastoId) {
    // Sigue pagada pero se edito algun dato: se refleja en el gasto ya creado.
    actualizarGastoDesdeCuenta(gastoId, cuentaActualizada);
  }

  db.prepare(
    `UPDATE cuentas_por_pagar
     SET proveedor = ?, concepto = ?, fecha_emision = ?, fecha_vencimiento = ?, monto = ?, pagada = ?, sucursal = ?, tipo_gasto = ?, es_fijo = ?, gasto_id = ?
     WHERE id = ?`
  ).run(proveedor, concepto, fecha_emision, fecha_vencimiento, monto, pagadaNueva, sucursal, tipo_gasto, es_fijo, gastoId, req.params.id);

  const actualizada = db.prepare('SELECT * FROM cuentas_por_pagar WHERE id = ?').get(req.params.id);
  res.json(actualizada);
});

router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT gasto_id FROM cuentas_por_pagar WHERE id = ?').get(req.params.id);
  const info = db.prepare('DELETE FROM cuentas_por_pagar WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrada' });
  if (existente?.gasto_id) db.prepare('DELETE FROM gastos WHERE id = ?').run(existente.gasto_id);
  res.status(204).end();
});

router.post('/revisar-vencimientos', async (req, res) => {
  await revisarVencimientos();
  await revisarAvisosWhatsApp();
  res.json({ ok: true });
});

function paraExportar(cuentas) {
  return cuentas.map((c) => ({ ...c, pagada: c.pagada ? 'Si' : 'No', es_fijo: c.es_fijo ? 'Si' : 'No' }));
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
