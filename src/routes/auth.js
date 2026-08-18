const express = require('express');
const db = require('../db');
const { COOKIE_NAME, verifyPassword, crearSesion, obtenerUsuarioPorSesion, destruirSesion } = require('../auth');

const router = express.Router();

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000,
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Falta email o contraseña' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }

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

module.exports = router;
