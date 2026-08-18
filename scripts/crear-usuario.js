const readline = require('readline');
const db = require('../src/db');
const { hashPassword } = require('../src/auth');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pregunta = (texto) => new Promise((resolve) => rl.question(texto, resolve));

async function main() {
  console.log('=== Crear usuario para Dazujo - Administracion ===\n');

  const nombre = (await pregunta('Nombre completo: ')).trim();
  const email = (await pregunta('Email: ')).trim().toLowerCase();
  const password = await pregunta('Contraseña (minimo 8 caracteres): ');
  const esAdminRespuesta = (await pregunta('¿Es administrador? (s/n): ')).trim().toLowerCase();

  rl.close();

  if (!nombre || !email) {
    console.error('\nNombre y email son obligatorios.');
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error('\nLa contraseña debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  const existente = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existente) {
    console.error(`\nYa existe un usuario con el email ${email}.`);
    process.exit(1);
  }

  const esAdmin = esAdminRespuesta === 's' || esAdminRespuesta === 'si';
  db.prepare('INSERT INTO users (nombre, email, password_hash, is_admin) VALUES (?, ?, ?, ?)').run(
    nombre,
    email,
    hashPassword(password),
    esAdmin ? 1 : 0
  );

  console.log(`\nUsuario creado: ${nombre} <${email}> ${esAdmin ? '(administrador)' : ''}`);
}

main();
