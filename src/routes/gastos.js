const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { enviarCSV, enviarXLSX } = require('../export');
const { TIPOS_GASTO, MARCAS, TOMOX_SUCURSALES, SUCURSAL_LABORATORIO } = require('../constants');
const sucursalesDb = require('../sucursales');

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

function borrarComprobante(nombreArchivo) {
  if (!nombreArchivo) return;
  fs.unlink(path.join(DIR_COMPROBANTES, nombreArchivo), () => {});
}

const COLUMNAS = [
  { header: 'Marca', key: 'marca', width: 14 },
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

// Valida que la sucursal tenga sentido para la marca indicada. Para
// Laboratorio no se le pide sucursal al usuario: siempre se usa la misma
// sucursal ficticia fija (el gasto de Laboratorio no se reparte por clinica).
function sucursalValidaParaMarca(sucursal, marca) {
  if (marca === 'laboratorio') return sucursal === SUCURSAL_LABORATORIO;
  if (marca === 'tomox') return TOMOX_SUCURSALES.includes(sucursal) && sucursalesDb.existeActiva(sucursal);
  return sucursalesDb.existeActiva(sucursal);
}

function normalizarMarcaYSucursal(body) {
  const marca = MARCAS.includes(body.marca) ? body.marca : 'dazujo';
  if (marca === 'laboratorio') body.sucursal = SUCURSAL_LABORATORIO;
  return marca;
}

function validarGasto(body, marca) {
  const requeridos = ['sucursal', 'tipo_gasto', 'concepto', 'fecha', 'monto'];
  for (const campo of requeridos) {
    if (body[campo] === undefined || body[campo] === null || body[campo] === '') {
      return `Falta el campo: ${campo}`;
    }
  }
  if (!sucursalValidaParaMarca(body.sucursal, marca)) return 'Sucursal invalida';
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

router.get('/comprobante/:archivo', (req, res) => {
  const existe = db.prepare('SELECT id FROM gastos WHERE comprobante = ?').get(req.params.archivo);
  if (!existe) return res.status(404).json({ error: 'No encontrado' });
  res.sendFile(path.join(DIR_COMPROBANTES, req.params.archivo));
});

router.post('/', upload.single('comprobante'), manejarErrorMulter, (req, res) => {
  const marca = normalizarMarcaYSucursal(req.body);
  const error = validarGasto(req.body, marca);
  if (error) {
    borrarComprobante(req.file?.filename);
    return res.status(400).json({ error });
  }

  const { sucursal, tipo_gasto, concepto, fecha, monto } = req.body;
  const info = db
    .prepare(
      `INSERT INTO gastos (sucursal, tipo_gasto, concepto, fecha, monto, comprobante, marca)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(sucursal, tipo_gasto, concepto, fecha, Number(monto), req.file?.filename || null, marca);

  const nuevo = db.prepare('SELECT * FROM gastos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(nuevo);
});

const MODOS_DIVISION = ['igual', 'cantidad', 'porcentaje'];

router.post('/compartido', upload.single('comprobante'), manejarErrorMulter, (req, res) => {
  const { tipo_gasto, concepto, fecha } = req.body;
  const modo = req.body.modo || 'igual';
  const marca = MARCAS.includes(req.body.marca) ? req.body.marca : 'dazujo';

  let partes = req.body.partes;
  if (typeof partes === 'string') {
    try {
      partes = JSON.parse(partes);
    } catch {
      partes = [];
    }
  }

  if (marca === 'laboratorio') {
    borrarComprobante(req.file?.filename);
    return res.status(400).json({ error: 'Laboratorio no admite gastos divididos por sucursal' });
  }
  if (!MODOS_DIVISION.includes(modo)) {
    borrarComprobante(req.file?.filename);
    return res.status(400).json({ error: 'Modo de division invalido' });
  }
  if (!Array.isArray(partes) || partes.length < 2) {
    borrarComprobante(req.file?.filename);
    return res.status(400).json({ error: 'Selecciona al menos 2 sucursales' });
  }

  const nombresSucursales = partes.map((p) => p && p.sucursal);
  if (new Set(nombresSucursales).size !== nombresSucursales.length) {
    borrarComprobante(req.file?.filename);
    return res.status(400).json({ error: 'No repitas la misma sucursal' });
  }
  for (const nombre of nombresSucursales) {
    if (!sucursalValidaParaMarca(nombre, marca)) {
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

  let filasMonto;
  let montoTotal;

  if (modo === 'igual') {
    montoTotal = Number(req.body.monto);
    if (Number.isNaN(montoTotal) || montoTotal <= 0) {
      borrarComprobante(req.file?.filename);
      return res.status(400).json({ error: 'El monto debe ser un numero mayor a 0' });
    }

    const n = partes.length;
    const montoBase = Math.floor((montoTotal / n) * 100) / 100;
    const ajusteFinal = Math.round((montoTotal - montoBase * (n - 1)) * 100) / 100;
    filasMonto = partes.map((p, i) => ({ sucursal: p.sucursal, monto: i === n - 1 ? ajusteFinal : montoBase }));
  } else if (modo === 'cantidad') {
    filasMonto = partes.map((p) => ({ sucursal: p.sucursal, monto: Math.round(Number(p.valor) * 100) / 100 }));
    if (filasMonto.some((f) => Number.isNaN(f.monto) || f.monto <= 0)) {
      borrarComprobante(req.file?.filename);
      return res.status(400).json({ error: 'Cada clinica necesita una cantidad valida mayor a 0' });
    }
    montoTotal = Math.round(filasMonto.reduce((s, f) => s + f.monto, 0) * 100) / 100;
  } else {
    montoTotal = Number(req.body.monto);
    if (Number.isNaN(montoTotal) || montoTotal <= 0) {
      borrarComprobante(req.file?.filename);
      return res.status(400).json({ error: 'El monto debe ser un numero mayor a 0' });
    }

    const porcentajes = partes.map((p) => Number(p.valor));
    if (porcentajes.some((p) => Number.isNaN(p) || p <= 0)) {
      borrarComprobante(req.file?.filename);
      return res.status(400).json({ error: 'Cada clinica necesita un porcentaje valido mayor a 0' });
    }
    const sumaPct = porcentajes.reduce((s, p) => s + p, 0);
    if (Math.abs(sumaPct - 100) > 0.5) {
      borrarComprobante(req.file?.filename);
      return res.status(400).json({ error: `Los porcentajes deben sumar 100% (suman ${sumaPct.toFixed(1)}%)` });
    }

    filasMonto = partes.map((p) => ({ sucursal: p.sucursal, monto: Math.round(montoTotal * (Number(p.valor) / 100) * 100) / 100 }));
    // La ultima fila absorbe el redondeo para que la suma cuadre exacto con el total.
    const sumaParcial = filasMonto.slice(0, -1).reduce((s, f) => s + f.monto, 0);
    filasMonto[filasMonto.length - 1].monto = Math.round((montoTotal - sumaParcial) * 100) / 100;
  }

  const grupoId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const insert = db.prepare(
    `INSERT INTO gastos (sucursal, tipo_gasto, concepto, fecha, monto, grupo_id, monto_total, comprobante, marca)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const creados = filasMonto.map((f) => {
    const info = insert.run(f.sucursal, tipo_gasto, concepto, fecha, f.monto, grupoId, montoTotal, req.file?.filename || null, marca);
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

function gastosFiltrados(query) {
  const condiciones = [];
  const parametros = [];

  if (query.sucursal) {
    condiciones.push('sucursal = ?');
    parametros.push(query.sucursal);
  }
  if (query.mes && /^\d{2}$/.test(query.mes)) {
    condiciones.push("substr(fecha, 6, 2) = ?");
    parametros.push(query.mes);
  }
  if (query.anio && /^\d{4}$/.test(query.anio)) {
    condiciones.push("substr(fecha, 1, 4) = ?");
    parametros.push(query.anio);
  }
  if (query.marca && MARCAS.includes(query.marca)) {
    condiciones.push('marca = ?');
    parametros.push(query.marca);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM gastos ${where} ORDER BY fecha DESC, id DESC`).all(...parametros);
}

function nombreArchivoExport(query) {
  const partes = ['gastos', query.marca, query.sucursal, query.anio, query.mes].filter(Boolean);
  return partes.join('_');
}

function conFilaTotal(filas) {
  const suma = Math.round(filas.reduce((s, f) => s + f.monto, 0) * 100) / 100;
  return [...filas, { marca: '', sucursal: '', tipo_gasto: '', concepto: 'TOTAL', fecha: '', monto: suma, compartido: '', monto_total: '' }];
}

router.get('/export/csv', (req, res) => {
  const gastos = gastosFiltrados(req.query);
  enviarCSV(res, nombreArchivoExport(req.query), COLUMNAS, conFilaTotal(paraExportar(gastos)));
});

router.get('/export/xlsx', async (req, res) => {
  const gastos = gastosFiltrados(req.query);
  await enviarXLSX(res, nombreArchivoExport(req.query), 'Gastos', COLUMNAS, conFilaTotal(paraExportar(gastos)));
});

module.exports = router;
