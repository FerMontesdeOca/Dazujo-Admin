const express = require('express');
const db = require('../db');
const sucursales = require('../sucursales');
const { MARCAS, TOMOX_SUCURSALES } = require('../constants');

const router = express.Router();

// Dazujo y Laboratorio facturan en cualquier clinica activa de Dazujo; Tomox
// solo en sus propias sucursales.
function sucursalValidaParaIngreso(sucursal, marca) {
  if (marca === 'tomox') return TOMOX_SUCURSALES.includes(sucursal) && sucursales.existeActiva(sucursal);
  return sucursales.existeActiva(sucursal);
}

function validarIngreso(body, marca) {
  const requeridos = ['sucursal', 'mes', 'monto'];
  for (const campo of requeridos) {
    if (body[campo] === undefined || body[campo] === null || body[campo] === '') {
      return `Falta el campo: ${campo}`;
    }
  }
  if (!sucursalValidaParaIngreso(body.sucursal, marca)) return 'Sucursal invalida';
  if (!/^\d{4}-\d{2}$/.test(body.mes)) return 'Mes invalido, usa el formato AAAA-MM';
  if (Number.isNaN(Number(body.monto)) || Number(body.monto) < 0) return 'El monto debe ser un numero valido';
  return null;
}

router.get('/', (req, res) => {
  const ingresos = db.prepare('SELECT * FROM ingresos ORDER BY mes DESC, sucursal ASC, id DESC').all();
  res.json(ingresos);
});

router.post('/', (req, res) => {
  const marca = MARCAS.includes(req.body.marca) ? req.body.marca : 'dazujo';
  const error = validarIngreso(req.body, marca);
  if (error) return res.status(400).json({ error });

  const { sucursal, mes } = req.body;
  const monto = Number(req.body.monto);

  // El ingreso capturado reemplaza al anterior de esa clinica, mes y marca
  // (no se suma). El filtro por marca es clave: Dazujo, Tomox y Laboratorio
  // pueden tener cada uno su propio ingreso en la misma clinica y mes.
  db.prepare('DELETE FROM ingresos WHERE sucursal = ? AND mes = ? AND marca = ?').run(sucursal, mes, marca);
  const info = db
    .prepare('INSERT INTO ingresos (sucursal, mes, monto, marca) VALUES (?, ?, ?, ?)')
    .run(sucursal, mes, monto, marca);

  const fila = db.prepare('SELECT * FROM ingresos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(fila);
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM ingresos WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.status(204).end();
});

module.exports = router;
