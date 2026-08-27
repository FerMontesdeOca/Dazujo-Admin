const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { enviarCSV, enviarXLSX } = require('../export');
const { SUCURSALES, TIPOS_GASTO } = require('../constants');
const { procesarArchivo } = require('../importadorCierre');

const router = express.Router();

const DIR_COMPROBANTES = path.join(__dirname, '..', '..', 'data', 'comprobantes');
fs.mkdirSync(DIR_COMPROBANTES, { recursive: true });

const EXTENSIONES_PERMITIDAS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic' };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, DIR_COMPROBANTES),
    filename: (req, file, cb) => {
      const ext = EXTENSIONES_PERMITIDAS[file.mimetype] || path.extname(file.originalname) || '';
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!EXTENSIONES_PERMITIDAS[file.mimetype]) return cb(new Error('El comprobante debe ser una imagen (jpg, png o webp)'));
    cb(null, true);
  },
});

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/\.xlsx$/i.test(file.originalname)) return cb(new Error('El archivo debe ser un Excel (.xlsx)'));
    cb(null, true);
  },
});

function borrarComprobante(nombreArchivo) {
  if (!nombreArchivo) return;
  fs.unlink(path.join(DIR_COMPROBANTES, nombreArchivo), () => {});
}

const COLUMNAS = [
  { header: 'Sucursal', key: 'sucursal', width: 18 },
  { header: 'Tipo de Gasto', key: 'tipo_gasto', width: 25 },
  { header: 'Concepto', key: 'concepto', width: 25 },
  { header: 'Fecha', key: 'fecha', width: 15 },
  { header: 'Monto', key: 'monto', width: 15 },
  { header: 'Compartido', key: 'compartido', width: 14 },
  { header: 'Monto Total Compartido', key: 'monto_total', width: 22 },
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

function manejarErrorMulter(err, req, res, next) {
  if (err) return res.status(400).json({ error: err.message || 'Error al subir el comprobante' });
  next();
}

router.get('/', (req, res) => {
  const gastos = db.prepare('SELECT * FROM gastos ORDER BY fecha DESC, id DESC').all();
  res.json(gastos);
});

const MARCA_IMPORTADO = 'Importado de Excel (histórico)';

router.post('/importar', uploadExcel.single('archivo'), manejarErrorMulter, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });

  let resultado;
  try {
    resultado = await procesarArchivo(req.file.buffer, req.file.originalname);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'No se pudo leer el archivo' });
  }

  const { mes, ingresos, gastos, sinMapear } = resultado;

  const delIngreso = db.prepare('DELETE FROM ingresos WHERE sucursal = ? AND mes = ?');
  const insIngreso = db.prepare('INSERT INTO ingresos (sucursal, mes, monto) VALUES (?, ?, ?)');
  const vistosIngreso = new Set();
  for (const i of ingresos) {
    if (!vistosIngreso.has(i.sucursal)) {
      delIngreso.run(i.sucursal, mes);
      vistosIngreso.add(i.sucursal);
    }
    insIngreso.run(i.sucursal, mes, i.monto);
  }

  const delGasto = db.prepare('DELETE FROM gastos WHERE sucursal = ? AND substr(fecha,1,7) = ? AND concepto = ?');
  const insGasto = db.prepare('INSERT INTO gastos (sucursal, tipo_gasto, concepto, fecha, monto) VALUES (?, ?, ?, ?, ?)');
  const vistosGasto = new Set();
  for (const g of gastos) {
    if (!vistosGasto.has(g.sucursal)) {
      delGasto.run(g.sucursal, mes, MARCA_IMPORTADO);
      vistosGasto.add(g.sucursal);
    }
    insGasto.run(g.sucursal, g.tipo_gasto, MARCA_IMPORTADO, `${mes}-01`, g.monto);
  }

  const totalesGastoPorSucursal = {};
  for (const g of gastos) {
    totalesGastoPorSucursal[g.sucursal] = (totalesGastoPorSucursal[g.sucursal] || 0) + g.monto;
  }

  res.json({
    mes,
    ingresos: ingresos.map((i) => ({ sucursal: i.sucursal, monto: i.monto })),
    gastos: Object.entries(totalesGastoPorSucursal).map(([sucursal, monto]) => ({ sucursal, monto: Math.round(monto * 100) / 100 })),
    sinMapear,
  });
});

router.get('/comprobante/:archivo', (req, res) => {
  const existe = db.prepare('SELECT id FROM gastos WHERE comprobante = ?').get(req.params.archivo);
  if (!existe) return res.status(404).json({ error: 'No encontrado' });
  res.sendFile(path.join(DIR_COMPROBANTES, req.params.archivo));
});

router.post('/', upload.single('comprobante'), manejarErrorMulter, (req, res) => {
  const error = validarGasto(req.body);
  if (error) {
    borrarComprobante(req.file?.filename);
    return res.status(400).json({ error });
  }

  const { sucursal, tipo_gasto, concepto, fecha, monto } = req.body;
  const info = db
    .prepare(
      `INSERT INTO gastos (sucursal, tipo_gasto, concepto, fecha, monto, comprobante)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(sucursal, tipo_gasto, concepto, fecha, Number(monto), req.file?.filename || null);

  const nuevo = db.prepare('SELECT * FROM gastos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(nuevo);
});

router.post('/compartido', upload.single('comprobante'), manejarErrorMulter, (req, res) => {
  const { tipo_gasto, concepto, fecha, monto } = req.body;
  let sucursales = req.body.sucursales;
  if (typeof sucursales === 'string') {
    try {
      sucursales = JSON.parse(sucursales);
    } catch {
      sucursales = [];
    }
  }

  if (!Array.isArray(sucursales) || sucursales.length < 2) {
    borrarComprobante(req.file?.filename);
    return res.status(400).json({ error: 'Selecciona al menos 2 sucursales' });
  }
  if (new Set(sucursales).size !== sucursales.length) {
    borrarComprobante(req.file?.filename);
    return res.status(400).json({ error: 'No repitas la misma sucursal' });
  }
  for (const s of sucursales) {
    if (!SUCURSALES.includes(s)) {
      borrarComprobante(req.file?.filename);
      return res.status(400).json({ error: 'Sucursal invalida' });
    }
  }
  if (!tipo_gasto || !TIPOS_GASTO.includes(tipo_gasto)) {
    borrarComprobante(req.file?.filename);
    return res.status(400).json({ error: 'Tipo de gasto invalido' });
  }
  if (!concepto) {
    borrarComprobante(req.file?.filename);
    return res.status(400).json({ error: 'Falta el campo: concepto' });
  }
  if (!fecha) {
    borrarComprobante(req.file?.filename);
    return res.status(400).json({ error: 'Falta el campo: fecha' });
  }

  const montoTotal = Number(monto);
  if (Number.isNaN(montoTotal) || montoTotal <= 0) {
    borrarComprobante(req.file?.filename);
    return res.status(400).json({ error: 'El monto debe ser un numero mayor a 0' });
  }

  const n = sucursales.length;
  const montoBase = Math.floor((montoTotal / n) * 100) / 100;
  const ajusteFinal = Math.round((montoTotal - montoBase * (n - 1)) * 100) / 100;

  const grupoId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const insert = db.prepare(
    `INSERT INTO gastos (sucursal, tipo_gasto, concepto, fecha, monto, grupo_id, monto_total, comprobante)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const creados = sucursales.map((sucursal, i) => {
    const montoFila = i === n - 1 ? ajusteFinal : montoBase;
    const info = insert.run(sucursal, tipo_gasto, concepto, fecha, montoFila, grupoId, montoTotal, req.file?.filename || null);
    return db.prepare('SELECT * FROM gastos WHERE id = ?').get(info.lastInsertRowid);
  });

  res.status(201).json(creados);
});

router.put('/:id', upload.single('comprobante'), manejarErrorMulter, (req, res) => {
  const existente = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
  if (!existente) {
    borrarComprobante(req.file?.filename);
    return res.status(404).json({ error: 'No encontrado' });
  }

  const sucursal = req.body.sucursal ?? existente.sucursal;
  const tipo_gasto = req.body.tipo_gasto ?? existente.tipo_gasto;
  const concepto = req.body.concepto ?? existente.concepto;
  const fecha = req.body.fecha ?? existente.fecha;
  const monto = req.body.monto !== undefined ? Number(req.body.monto) : existente.monto;
  const comprobante = req.file ? req.file.filename : existente.comprobante;

  db.prepare(
    `UPDATE gastos
     SET sucursal = ?, tipo_gasto = ?, concepto = ?, fecha = ?, monto = ?, comprobante = ?
     WHERE id = ?`
  ).run(sucursal, tipo_gasto, concepto, fecha, monto, comprobante, req.params.id);

  if (req.file && existente.comprobante) borrarComprobante(existente.comprobante);

  const actualizado = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
  res.json(actualizado);
});

router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT comprobante FROM gastos WHERE id = ?').get(req.params.id);
  const info = db.prepare('DELETE FROM gastos WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  if (existente?.comprobante) borrarComprobante(existente.comprobante);
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
