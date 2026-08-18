const express = require('express');
const { pool } = require('../db');
const { hashPassword } = require('../lib/auth');

const router = express.Router();

const ROLES = ['admin', 'cajero'];

function validar(body, { esCreacion }) {
  const errores = [];
  if (esCreacion && !(body.nombre_usuario || '').trim()) errores.push('El nombre de usuario es obligatorio.');
  if (esCreacion && !(body.nombre_completo || '').trim()) errores.push('El nombre completo es obligatorio.');
  if (esCreacion && !ROLES.includes(body.rol)) errores.push(`El rol debe ser uno de: ${ROLES.join(', ')}.`);
  if (esCreacion && !(body.password && body.password.length >= 8)) {
    errores.push('La contraseña debe tener al menos 8 caracteres.');
  }
  if (!esCreacion && body.password !== undefined && body.password !== '' && body.password.length < 8) {
    errores.push('La contraseña debe tener al menos 8 caracteres.');
  }
  return errores;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre_usuario, nombre_completo, rol, activo, ultimo_login, creado_en
       FROM usuarios ORDER BY nombre_completo`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const errores = validar(req.body, { esCreacion: true });
    if (errores.length) return res.status(400).json({ errores });

    const { nombre_usuario, nombre_completo, rol, password } = req.body;
    const passwordHash = await hashPassword(password);

    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre_usuario, nombre_completo, rol, password_hash)
       VALUES ($1,$2,$3,$4)
       RETURNING id, nombre_usuario, nombre_completo, rol, activo, creado_en`,
      [nombre_usuario.trim(), nombre_completo.trim(), rol, passwordHash]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ya existe un usuario con ese nombre.' });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { rows: existentes } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [req.params.id]);
    if (!existentes.length) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const actual = existentes[0];

    const errores = validar(req.body, { esCreacion: false });
    if (errores.length) return res.status(400).json({ errores });

    const nombreCompleto = req.body.nombre_completo !== undefined ? req.body.nombre_completo.trim() : actual.nombre_completo;
    const rol = req.body.rol !== undefined ? req.body.rol : actual.rol;
    const activo = req.body.activo !== undefined ? !!req.body.activo : actual.activo;
    if (req.body.rol !== undefined && !ROLES.includes(rol)) {
      return res.status(400).json({ error: `El rol debe ser uno de: ${ROLES.join(', ')}.` });
    }

    let passwordHash = actual.password_hash;
    if (req.body.password) passwordHash = await hashPassword(req.body.password);

    const { rows } = await pool.query(
      `UPDATE usuarios SET nombre_completo=$1, rol=$2, activo=$3, password_hash=$4 WHERE id=$5
       RETURNING id, nombre_usuario, nombre_completo, rol, activo, ultimo_login, creado_en`,
      [nombreCompleto, rol, activo, passwordHash, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Baja lógica: revoca el acceso sin borrar el historial.
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'UPDATE usuarios SET activo = FALSE WHERE id = $1 RETURNING id, nombre_usuario, activo',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ ok: true, usuario: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
