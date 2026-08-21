const express = require('express');
const db = require('../db');
const { SUCURSALES } = require('../constants');
const { enviarCSV, enviarXLSX } = require('../export');

const router = express.Router();

const COLUMNAS = [
  { header: 'Sucursal', key: 'sucursal', width: 18 },
  { header: 'Ingreso', key: 'ingreso', width: 16 },
  { header: 'Gasto', key: 'gasto', width: 16 },
  { header: 'Utilidad', key: 'utilidad', width: 16 },
  { header: 'Margen', key: 'margen', width: 12 },
];

function mesActual() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

function margenTexto(ingreso, utilidad) {
  return ingreso > 0 ? `${((utilidad / ingreso) * 100).toFixed(1)}%` : '-';
}

function resumenMes(mes) {
  const gastos = db.prepare("SELECT sucursal, monto FROM gastos WHERE substr(fecha, 1, 7) = ?").all(mes);
  const ingresos = db.prepare('SELECT sucursal, monto FROM ingresos WHERE mes = ?').all(mes);

  const filas = SUCURSALES.map((sucursal) => {
    const ingreso = ingresos.filter((i) => i.sucursal === sucursal).reduce((s, i) => s + i.monto, 0);
    const gasto = gastos.filter((g) => g.sucursal === sucursal).reduce((s, g) => s + g.monto, 0);
    const utilidad = ingreso - gasto;
    return { sucursal, ingreso, gasto, utilidad, margen: margenTexto(ingreso, utilidad) };
  });

  const totalIngreso = filas.reduce((s, f) => s + f.ingreso, 0);
  const totalGasto = filas.reduce((s, f) => s + f.gasto, 0);
  const totalUtilidad = totalIngreso - totalGasto;
  filas.push({
    sucursal: 'TOTAL',
    ingreso: totalIngreso,
    gasto: totalGasto,
    utilidad: totalUtilidad,
    margen: margenTexto(totalIngreso, totalUtilidad),
  });

  return filas;
}

function mesValido(valor) {
  return /^\d{4}-\d{2}$/.test(valor) ? valor : mesActual();
}

router.get('/export/csv', (req, res) => {
  const mes = mesValido(req.query.mes);
  enviarCSV(res, `cierre_${mes}`, COLUMNAS, resumenMes(mes));
});

// POST (no GET) porque va con las imagenes de las graficas ya renderizadas en
// el navegador, que no caben de forma practica en la URL de un enlace normal.
router.post('/export/xlsx', async (req, res) => {
  const mes = mesValido(req.body.mes);
  const graficas = Array.isArray(req.body.graficas) ? req.body.graficas : [];
  await enviarXLSX(res, `cierre_${mes}`, 'Cierre de mes', COLUMNAS, resumenMes(mes), graficas);
});

module.exports = router;
