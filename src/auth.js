const crypto = require('crypto');
const db = require('./db');

const SESSION_DIAS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const hashBuffer = Buffer.from(hash, 'hex');
  const testHash = crypto.scryptSync(password, salt, 64);
  return hashBuffer.length === testHash.length && crypto.timingSafeEqual(hashBuffer, testHash);
}

function crearSesion(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + SESSION_DIAS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expira);
  return { token, expira };
}

function obtenerUsuarioPorSesion(token) {
  if (!token) return null;
  const sesion = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!sesion) return null;
  if (new Date(sesion.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  const user = db.prepare('SELECT id, nombre, email, is_admin, active FROM users WHERE id = ?').get(sesion.user_id);
  if (!user || !user.active) return null;
  return user;
}

function destruirSesion(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

const COOKIE_NAME = 'dazujo_sid';

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const user = obtenerUsuarioPorSesion(token);
  if (!user) return res.status(401).json({ error: 'No autenticado' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Requiere permisos de administrador' });
  next();
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  crearSesion,
  obtenerUsuarioPorSesion,
  destruirSesion,
  requireAuth,
  requireAdmin,
};
