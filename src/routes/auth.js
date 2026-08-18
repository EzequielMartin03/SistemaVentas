const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { verifyPassword, requireAuth, MAX_INTENTOS, BLOQUEO_MINUTOS } = require('../lib/auth');

const router = express.Router();

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá unos minutos antes de volver a intentar.' },
});

const MENSAJE_GENERICO = 'Usuario o contraseña incorrectos.';

router.post('/login', limitadorLogin, async (req, res, next) => {
  try {
    const nombreUsuario = (req.body.usuario || '').trim();
    const password = req.body.password || '';

    if (!nombreUsuario || !password) {
      return res.status(400).json({ error: MENSAJE_GENERICO });
    }

    const { rows } = await pool.query('SELECT * FROM usuarios WHERE nombre_usuario = $1', [nombreUsuario]);
    const usuario = rows[0];

    if (usuario && usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
      return res.status(423).json({ error: 'Usuario bloqueado temporalmente por demasiados intentos fallidos. Probá de nuevo en unos minutos.' });
    }

    const passwordOk = usuario && usuario.activo
      ? await verifyPassword(password, usuario.password_hash)
      : await verifyPassword(password, null); // igual corre bcrypt.compare contra un hash dummy

    if (!usuario || !usuario.activo || !passwordOk) {
      if (usuario && usuario.activo) {
        const intentos = usuario.intentos_fallidos + 1;
        const bloqueadoHasta = intentos >= MAX_INTENTOS
          ? new Date(Date.now() + BLOQUEO_MINUTOS * 60 * 1000)
          : null;
        await pool.query(
          'UPDATE usuarios SET intentos_fallidos = $1, bloqueado_hasta = $2 WHERE id = $3',
          [bloqueadoHasta ? 0 : intentos, bloqueadoHasta, usuario.id]
        );
      }
      return res.status(401).json({ error: MENSAJE_GENERICO });
    }

    await pool.query(
      'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_login = NOW() WHERE id = $1',
      [usuario.id]
    );

    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = usuario.id;
      res.json({
        id: usuario.id,
        nombre_usuario: usuario.nombre_usuario,
        nombre_completo: usuario.nombre_completo,
        rol: usuario.rol,
      });
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.usuario);
});

module.exports = router;
