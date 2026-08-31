const db = require('./db');

function listarActivas() {
  return db.prepare('SELECT nombre FROM sucursales WHERE activa = 1 ORDER BY id ASC').all().map((r) => r.nombre);
}

function listarTodas() {
  return db.prepare('SELECT id, nombre, activa, created_at FROM sucursales ORDER BY id ASC').all();
}

function existeActiva(nombre) {
  return !!db.prepare('SELECT id FROM sucursales WHERE nombre = ? AND activa = 1').get(nombre);
}

function crear(nombre) {
  const limpio = String(nombre || '').trim();
  if (!limpio) throw new Error('Falta el nombre de la sucursal');

  const existente = db.prepare('SELECT id, activa FROM sucursales WHERE nombre = ?').get(limpio);
  if (existente) {
    if (existente.activa) throw new Error('Ya existe una sucursal con ese nombre');
    // Ya existia pero estaba dada de baja: reactivarla en vez de duplicarla.
    db.prepare('UPDATE sucursales SET activa = 1 WHERE id = ?').run(existente.id);
    return db.prepare('SELECT id, nombre, activa, created_at FROM sucursales WHERE id = ?').get(existente.id);
  }

  const info = db.prepare('INSERT INTO sucursales (nombre) VALUES (?)').run(limpio);
  return db.prepare('SELECT id, nombre, activa, created_at FROM sucursales WHERE id = ?').get(info.lastInsertRowid);
}

function cambiarEstado(id, activa) {
  const info = db.prepare('UPDATE sucursales SET activa = ? WHERE id = ?').run(activa ? 1 : 0, id);
  if (info.changes === 0) return null;
  return db.prepare('SELECT id, nombre, activa, created_at FROM sucursales WHERE id = ?').get(id);
}

module.exports = { listarActivas, listarTodas, existeActiva, crear, cambiarEstado };
