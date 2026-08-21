const express = require('express');
const db = require('../db');
const { revisarVencimientos, revisarAvisosWhatsApp } = require('../cron');
const { enviarCSV, enviarXLSX } = require('../export');

const router = express.Router();

const COLUMNAS = [
  { header: 'Proveedor', key: 'proveedor', width: 25 },
  { header: 'Concepto', key: 'concepto', width: 25 },
  { header: 'Fecha Emision', key: 'fecha_emision', width: 15 },
  { header: 'Fecha Vencimiento', key: 'fecha_vencimiento', width: 18 },
  { header: 'Monto', key: 'monto', width: 15 },
  { header: 'Pagada', key: 'pagada', width: 10 },
];

function validarCuenta(body) {
  const requeridos = ['proveedor', 'concepto', 'fecha_emision', 'fecha_vencimiento', 'monto'];
  for (const campo of requeridos) {
    if (body[campo] === undefined || body[campo] === null || body[campo] === '') {
      return `Falta el campo: ${campo}`;
    }
  }
  if (Number.isNaN(Number(body.monto))) {
    return 'El monto debe ser un numero';
  }
  return null;
}

router.get('/', (req, res) => {
  const cuentas = db.prepare('SELECT * FROM cuentas_por_pagar ORDER BY fecha_vencimiento ASC').all();
  res.json(cuentas);
});

router.post('/', (req, res) => {
  const error = validarCuenta(req.body);
  if (error) return res.status(400).json({ error });

  const { proveedor, concepto, fecha_emision, fecha_vencimiento, monto } = req.body;
  const info = db
    .prepare(
      `INSERT INTO cuentas_por_pagar (proveedor, concepto, numero_factura, fecha_emision, fecha_vencimiento, monto)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(proveedor, concepto, '', fecha_emision, fecha_vencimiento, Number(monto));

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
  const pagada = req.body.pagada !== undefined ? (req.body.pagada ? 1 : 0) : existente.pagada;

  db.prepare(
    `UPDATE cuentas_por_pagar
     SET proveedor = ?, concepto = ?, fecha_emision = ?, fecha_vencimiento = ?, monto = ?, pagada = ?
     WHERE id = ?`
  ).run(proveedor, concepto, fecha_emision, fecha_vencimiento, monto, pagada, req.params.id);

  const actualizada = db.prepare('SELECT * FROM cuentas_por_pagar WHERE id = ?').get(req.params.id);
  res.json(actualizada);
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM cuentas_por_pagar WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrada' });
  res.status(204).end();
});

router.post('/revisar-vencimientos', async (req, res) => {
  await revisarVencimientos();
  await revisarAvisosWhatsApp();
  res.json({ ok: true });
});

router.get('/export/csv', (req, res) => {
  const cuentas = db.prepare('SELECT * FROM cuentas_por_pagar ORDER BY fecha_vencimiento ASC').all();
  const filas = cuentas.map((c) => ({ ...c, pagada: c.pagada ? 'Si' : 'No' }));
  enviarCSV(res, 'cuentas_por_pagar', COLUMNAS, filas);
});

router.get('/export/xlsx', async (req, res) => {
  const cuentas = db.prepare('SELECT * FROM cuentas_por_pagar ORDER BY fecha_vencimiento ASC').all();
  const filas = cuentas.map((c) => ({ ...c, pagada: c.pagada ? 'Si' : 'No' }));
  await enviarXLSX(res, 'cuentas_por_pagar', 'Cuentas por pagar', COLUMNAS, filas);
});

module.exports = router;
