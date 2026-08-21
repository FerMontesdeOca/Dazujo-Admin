const express = require('express');
const db = require('../db');
const { SUCURSALES } = require('../constants');

const router = express.Router();

function validarMeta(body) {
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
  const metas = db.prepare('SELECT * FROM metas ORDER BY mes DESC, sucursal ASC').all();
  res.json(metas);
});

router.post('/', (req, res) => {
  const error = validarMeta(req.body);
  if (error) return res.status(400).json({ error });

  const { sucursal, mes } = req.body;
  const monto = Number(req.body.monto);

  db.prepare(
    `INSERT INTO metas (sucursal, mes, monto) VALUES (?, ?, ?)
     ON CONFLICT(sucursal, mes) DO UPDATE SET monto = excluded.monto`
  ).run(sucursal, mes, monto);

  const fila = db.prepare('SELECT * FROM metas WHERE sucursal = ? AND mes = ?').get(sucursal, mes);
  res.status(201).json(fila);
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM metas WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.status(204).end();
});

module.exports = router;
