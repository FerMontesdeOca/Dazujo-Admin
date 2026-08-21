const express = require('express');
const db = require('../db');
const { enviarCSV, enviarXLSX } = require('../export');
const { SUCURSALES, TIPOS_GASTO } = require('../constants');

const router = express.Router();

const COLUMNAS = [
  { header: 'Sucursal', key: 'sucursal', width: 18 },
  { header: 'Tipo de Gasto', key: 'tipo_gasto', width: 25 },
  { header: 'Concepto', key: 'concepto', width: 25 },
  { header: 'Fecha', key: 'fecha', width: 15 },
  { header: 'Monto', key: 'monto', width: 15 },
  { header: 'Compartido', key: 'compartido', width: 14 },
  { header: 'Monto Total Compartido', key: 'monto_total', width: 22 },
  { header: 'Proveedor', key: 'proveedor', width: 20 },
  { header: 'Numero Factura', key: 'numero_factura', width: 18 },
];

function paraExportar(gastos) {
  return gastos.map((g) => ({ ...g, compartido: g.grupo_id ? 'Si' : 'No' }));
}

function validarGasto(body) {
  const requeridos = ['sucursal', 'tipo_gasto', 'concepto', 'fecha', 'monto'];
  for (const campo of requeridos) {
    if (body[campo] === undefined || body[campo] === null || body[campo] === '') {
      return `Falta el campo: ${campo}`;
    }
  }
  if (!SUCURSALES.includes(body.sucursal)) return 'Sucursal invalida';
  if (!TIPOS_GASTO.includes(body.tipo_gasto)) return 'Tipo de gasto invalido';
  if (Number.isNaN(Number(body.monto))) return 'El monto debe ser un numero';
  return null;
}

router.get('/', (req, res) => {
  const gastos = db.prepare('SELECT * FROM gastos ORDER BY fecha DESC, id DESC').all();
  res.json(gastos);
});

router.post('/', (req, res) => {
  const error = validarGasto(req.body);
  if (error) return res.status(400).json({ error });

  const { sucursal, tipo_gasto, concepto, fecha, monto, proveedor, numero_factura } = req.body;
  const info = db
    .prepare(
      `INSERT INTO gastos (sucursal, tipo_gasto, concepto, fecha, monto, proveedor, numero_factura)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(sucursal, tipo_gasto, concepto, fecha, Number(monto), proveedor || null, numero_factura || null);

  const nuevo = db.prepare('SELECT * FROM gastos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(nuevo);
});

router.post('/compartido', (req, res) => {
  const { sucursales, tipo_gasto, concepto, fecha, monto, proveedor, numero_factura } = req.body;

  if (!Array.isArray(sucursales) || sucursales.length < 2) {
    return res.status(400).json({ error: 'Selecciona al menos 2 sucursales' });
  }
  if (new Set(sucursales).size !== sucursales.length) {
    return res.status(400).json({ error: 'No repitas la misma sucursal' });
  }
  for (const s of sucursales) {
    if (!SUCURSALES.includes(s)) return res.status(400).json({ error: 'Sucursal invalida' });
  }
  if (!tipo_gasto || !TIPOS_GASTO.includes(tipo_gasto)) return res.status(400).json({ error: 'Tipo de gasto invalido' });
  if (!concepto) return res.status(400).json({ error: 'Falta el campo: concepto' });
  if (!fecha) return res.status(400).json({ error: 'Falta el campo: fecha' });

  const montoTotal = Number(monto);
  if (Number.isNaN(montoTotal) || montoTotal <= 0) {
    return res.status(400).json({ error: 'El monto debe ser un numero mayor a 0' });
  }

  const n = sucursales.length;
  const montoBase = Math.floor((montoTotal / n) * 100) / 100;
  const ajusteFinal = Math.round((montoTotal - montoBase * (n - 1)) * 100) / 100;

  const grupoId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const insert = db.prepare(
    `INSERT INTO gastos (sucursal, tipo_gasto, concepto, fecha, monto, proveedor, numero_factura, grupo_id, monto_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const creados = sucursales.map((sucursal, i) => {
    const montoFila = i === n - 1 ? ajusteFinal : montoBase;
    const info = insert.run(
      sucursal,
      tipo_gasto,
      concepto,
      fecha,
      montoFila,
      proveedor || null,
      numero_factura || null,
      grupoId,
      montoTotal
    );
    return db.prepare('SELECT * FROM gastos WHERE id = ?').get(info.lastInsertRowid);
  });

  res.status(201).json(creados);
});

router.put('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ error: 'No encontrado' });

  const sucursal = req.body.sucursal ?? existente.sucursal;
  const tipo_gasto = req.body.tipo_gasto ?? existente.tipo_gasto;
  const concepto = req.body.concepto ?? existente.concepto;
  const fecha = req.body.fecha ?? existente.fecha;
  const monto = req.body.monto !== undefined ? Number(req.body.monto) : existente.monto;
  const proveedor = req.body.proveedor !== undefined ? req.body.proveedor : existente.proveedor;
  const numero_factura = req.body.numero_factura !== undefined ? req.body.numero_factura : existente.numero_factura;

  db.prepare(
    `UPDATE gastos
     SET sucursal = ?, tipo_gasto = ?, concepto = ?, fecha = ?, monto = ?, proveedor = ?, numero_factura = ?
     WHERE id = ?`
  ).run(sucursal, tipo_gasto, concepto, fecha, monto, proveedor, numero_factura, req.params.id);

  const actualizado = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
  res.json(actualizado);
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM gastos WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.status(204).end();
});

router.get('/export/csv', (req, res) => {
  const gastos = db.prepare('SELECT * FROM gastos ORDER BY fecha DESC, id DESC').all();
  enviarCSV(res, 'gastos', COLUMNAS, paraExportar(gastos));
});

router.get('/export/xlsx', async (req, res) => {
  const gastos = db.prepare('SELECT * FROM gastos ORDER BY fecha DESC, id DESC').all();
  await enviarXLSX(res, 'gastos', 'Gastos', COLUMNAS, paraExportar(gastos));
});

module.exports = router;
