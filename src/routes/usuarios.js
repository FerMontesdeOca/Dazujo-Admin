const express = require('express');
const db = require('../db');
const { hashPassword } = require('../auth');

const router = express.Router();

function validarNuevoUsuario(body) {
  if (!body.nombre) return 'Falta el nombre';
  if (!body.email) return 'Falta el email';
  if (!body.password || body.password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  return null;
}

router.get('/', (req, res) => {
  const usuarios = db.prepare('SELECT id, nombre, email, is_admin, active, created_at FROM users ORDER BY created_at ASC').all();
  res.json(usuarios);
});

router.post('/', (req, res) => {
  const error = validarNuevoUsuario(req.body);
  if (error) return res.status(400).json({ error });

  const email = String(req.body.email).toLowerCase().trim();
  const existente = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existente) return res.status(400).json({ error: 'Ya existe un usuario con ese email' });

  const info = db
    .prepare('INSERT INTO users (nombre, email, password_hash, is_admin) VALUES (?, ?, ?, ?)')
    .run(req.body.nombre.trim(), email, hashPassword(req.body.password), req.body.is_admin ? 1 : 0);

  const nuevo = db.prepare('SELECT id, nombre, email, is_admin, active, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(nuevo);
});

router.put('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ error: 'No encontrado' });

  if (Number(req.params.id) === req.user.id && req.body.active === false) {
    return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
  }

  const nombre = req.body.nombre ?? existente.nombre;
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : existente.active;
  const is_admin = req.body.is_admin !== undefined ? (req.body.is_admin ? 1 : 0) : existente.is_admin;
  const password_hash = req.body.password ? hashPassword(req.body.password) : existente.password_hash;

  if (req.body.password && req.body.password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  db.prepare('UPDATE users SET nombre = ?, active = ?, is_admin = ?, password_hash = ? WHERE id = ?').run(
    nombre,
    active,
    is_admin,
    password_hash,
    req.params.id
  );

  const actualizado = db.prepare('SELECT id, nombre, email, is_admin, active, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json(actualizado);
});

module.exports = router;
