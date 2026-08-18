require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const { pool } = require('./db');
const { requireAuth, requireAdmin } = require('./lib/auth');

const authRouter = require('./routes/auth');
const usuariosRouter = require('./routes/usuarios');
const categoriasRouter = require('./routes/categorias');
const productosRouter = require('./routes/productos');
const ventasRouter = require('./routes/ventas');
const cajaRouter = require('./routes/caja');
const configuracionRouter = require('./routes/configuracion');
const estadisticasRouter = require('./routes/estadisticas');

if (!process.env.SESSION_SECRET) {
  console.error('Falta la variable de entorno SESSION_SECRET. Definila antes de iniciar el servidor (una cadena larga y aleatoria).');
  process.exit(1);
}

const app = express();
const enProduccion = process.env.NODE_ENV === 'production';

// Detrás del proxy de Render: necesario para que las cookies "secure" y el
// rate-limit por IP vean la IP real del cliente.
app.set('trust proxy', 1);

// crossOriginEmbedderPolicy queda desactivado porque rompe la carga de
// Google Fonts (no mandan el header Cross-Origin-Resource-Policy que exige).
app.use(helmet({ crossOriginEmbedderPolicy: false }));

app.use(express.json());

app.use(session({
  store: new pgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: enProduccion,
    maxAge: 12 * 60 * 60 * 1000, // 12 horas
  },
}));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);

// Todo lo que se registre después de esta línea exige sesión iniciada.
app.use('/api', requireAuth);

app.use('/api/categorias', categoriasRouter);
app.use('/api/productos', productosRouter);
app.use('/api/ventas', ventasRouter);
app.use('/api/caja', cajaRouter);
app.use('/api/configuracion', requireAdmin, configuracionRouter);
app.use('/api/estadisticas', estadisticasRouter);
app.use('/api/usuarios', requireAdmin, usuariosRouter);

// Manejo de errores centralizado
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de forraje-stock corriendo en http://localhost:${PORT}`);
});
