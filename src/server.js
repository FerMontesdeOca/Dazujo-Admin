require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cuentasRouter = require('./routes/cuentas');
const gastosRouter = require('./routes/gastos');
const ingresosRouter = require('./routes/ingresos');
const metasRouter = require('./routes/metas');
const authRouter = require('./routes/auth');
const usuariosRouter = require('./routes/usuarios');
const { SUCURSALES, TIPOS_GASTO } = require('./constants');
const { requireAuth, requireAdmin } = require('./auth');
const { iniciarCron } = require('./cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway (y la mayoria de hosts) ponen la app detras de un proxy; esto permite
// que req.ip refleje la IP real del visitante en vez de la del proxy interno.
app.set('trust proxy', true);

app.use(express.json());
app.use(cookieParser());

// Evita que el navegador guarde en cache (disco o bfcache) las paginas y
// respuestas de la app: sin esto, alguien podria usar "atras" o el historial
// en una computadora compartida y ver datos de una sesion ya cerrada.
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', authRouter);

app.get('/api/config', requireAuth, (req, res) => {
  res.json({ sucursales: SUCURSALES, tiposGasto: TIPOS_GASTO });
});

app.use('/api/cuentas', requireAuth, cuentasRouter);
app.use('/api/gastos', requireAuth, gastosRouter);
app.use('/api/ingresos', requireAuth, ingresosRouter);
app.use('/api/metas', requireAuth, metasRouter);
app.use('/api/usuarios', requireAuth, requireAdmin, usuariosRouter);

app.listen(PORT, () => {
  console.log(`Servidor de Dazujo corriendo en http://localhost:${PORT}`);
  iniciarCron();
});
