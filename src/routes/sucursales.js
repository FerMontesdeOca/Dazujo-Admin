const express = require('express');
const sucursales = require('../sucursales');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(sucursales.listarTodas());
});

router.post('/', (req, res) => {
  try {
    const nueva = sucursales.crear(req.body.nombre);
    res.status(201).json(nueva);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  if (req.body.activa === undefined) return res.status(400).json({ error: 'Falta el campo activa' });

  const actualizada = sucursales.cambiarEstado(req.params.id, req.body.activa);
  if (!actualizada) return res.status(404).json({ error: 'No encontrada' });
  res.json(actualizada);
});

module.exports = router;
