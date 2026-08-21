const express = require('express');
const db = require('../db');
const { COOKIE_NAME, verifyPassword, hashPassword, crearSesion, obtenerUsuarioPorSesion, destruirSesion } = require('../auth');

const router = express.Router();

// Sin maxAge: es una cookie de sesion, el navegador la borra al cerrarse por
// completo (no solo la pestana). El respaldo de 30 dias en el servidor
// (SESSION_DIAS en src/auth.js) sigue como limite maximo por si el navegador
// no la borra (por ejemplo, si tiene activado "restaurar pestañas").
const cookieOpts = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
});

// Limite de intentos de login para frenar fuerza bruta: 5 intentos fallidos
// por email+IP bloquean ese par por 15 minutos. En memoria, se reinicia si el servidor reinicia.
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;
const intentosFallidos = new Map();

function claveIntento(req, email) {
  return `${req.ip}:${email}`;
}

function estaBloqueado(clave) {
  const info = intentosFallidos.get(clave);
  return !!(info?.bloqueadoHasta && info.bloqueadoHasta > Date.now());
}

function registrarFallo(clave) {
  const info = intentosFallidos.get(clave) || { count: 0 };
  info.count += 1;
  if (info.count >= MAX_INTENTOS) {
    info.bloqueadoHasta = Date.now() + BLOQUEO_MS;
    info.count = 0;
  }
  intentosFallidos.set(clave, info);
}

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Falta email o contraseña' });

  const clave = claveIntento(req, String(email).toLowerCase().trim());
  if (estaBloqueado(clave)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    registrarFallo(clave);
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }

  intentosFallidos.delete(clave);
  const { token } = crearSesion(user.id);
  res.cookie(COOKIE_NAME, token, cookieOpts());
  res.json({ id: user.id, nombre: user.nombre, email: user.email, is_admin: !!user.is_admin });
});

router.post('/logout', (req, res) => {
  destruirSesion(req.cookies?.[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const user = obtenerUsuarioPorSesion(req.cookies?.[COOKIE_NAME]);
  if (!user) return res.status(401).json({ error: 'No autenticado' });
  res.json({ id: user.id, nombre: user.nombre, email: user.email, is_admin: !!user.is_admin });
});

// Crea el primer administrador en un servidor recien publicado, sin necesitar acceso por terminal.
// Se autodesactiva en cuanto ya existe al menos un usuario.
router.post('/setup-admin', (req, res) => {
  const totalUsuarios = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
  if (totalUsuarios > 0) {
    return res.status(403).json({ error: 'Ya existe al menos un usuario, este metodo ya no esta disponible' });
  }
  if (!process.env.SETUP_TOKEN || req.headers['x-setup-token'] !== process.env.SETUP_TOKEN) {
    return res.status(401).json({ error: 'Token invalido' });
  }

  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Falta nombre, email, o la contraseña tiene menos de 8 caracteres' });
  }

  db.prepare('INSERT INTO users (nombre, email, password_hash, is_admin) VALUES (?, ?, ?, 1)').run(
    nombre.trim(),
    String(email).toLowerCase().trim(),
    hashPassword(password)
  );

  res.status(201).json({ ok: true });
});

module.exports = router;
