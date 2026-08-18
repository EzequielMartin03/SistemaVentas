const bcrypt = require('bcryptjs');
const { pool } = require('../db');

const SALT_ROUNDS = 12;
const MAX_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;

// Hash "dummy" fijo, usado para comparar cuando el usuario no existe.
// Mantiene el tiempo de respuesta parejo entre "usuario inválido" y
// "contraseña inválida", para no filtrar por timing qué usuarios existen.
const HASH_DUMMY = bcrypt.hashSync('hash-dummy-no-existe', SALT_ROUNDS);

function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash || HASH_DUMMY);
}

async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre_usuario, nombre_completo, rol, activo FROM usuarios WHERE id = $1',
      [req.session.userId]
    );
    const usuario = rows[0];
    if (!usuario || !usuario.activo) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'No autenticado.' });
    }
    req.usuario = usuario;
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'No tenés permisos para esta acción.' });
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  requireAuth,
  requireAdmin,
  MAX_INTENTOS,
  BLOQUEO_MINUTOS,
};
