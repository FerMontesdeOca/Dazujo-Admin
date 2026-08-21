const express = require('express');
const db = require('../db');
const { SUCURSALES } = require('../constants');

const router = express.Router();

function validarIngreso(body) {
  const requeridos = ['sucursal', 'mes', 'monto'];
  for (const campo of requeridos) {
    if (body[campo] === undefined || body[campo] === null || body[campo] === '') {
      return `Falta el campo: ${campo}`;
    }
  }
  if (!SUCURSALES.includes(body.sucursal)) return 'Sucursal invalida';
  if (!/^\d{4}-\d{2}$/.test(body.mes)) return 'Mes invalido, usa el formato AAAA-MM';
  if (Number.isNaN(Number(body.monto)) || Number(body.monto) < 0) return 'El monto debe ser un numero valido';
  return null;
}

router.get('/', (req, res) => {
  const ingresos = db.prepare('SELECT * FROM ingresos ORDER BY mes DESC, sucursal ASC, id DESC').all();
  res.json(ingresos);
});

router.post('/', (req, res) => {
  const error = validarIngreso(req.body);
  if (error) return res.status(400).json({ error });

  const { sucursal, mes, concepto } = req.body;
  const monto = Number(req.body.monto);

  const info = db
    .prepare('INSERT INTO ingresos (sucursal, mes, monto, concepto) VALUES (?, ?, ?, ?)')
    .run(sucursal, mes, monto, concepto || null);

  const fila = db.prepare('SELECT * FROM ingresos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(fila);
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM ingresos WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.status(204).end();
});

module.exports = router;
