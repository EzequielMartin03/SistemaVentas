const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { activo } = req.query;
    const condiciones = [];
    const params = [];

    if (activo !== undefined) {
      params.push(activo === 'true');
      condiciones.push(`activo = $${params.length}`);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM proveedores ${where} ORDER BY nombre`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const nombre = (req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    const { rows } = await pool.query(
      `INSERT INTO proveedores (nombre, contacto, telefono, email, notas)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [
        nombre,
        (req.body.contacto || '').trim() || null,
        (req.body.telefono || '').trim() || null,
        (req.body.email || '').trim() || null,
        (req.body.notas || '').trim() || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ya existe un proveedor con ese nombre.' });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { rows: existentes } = await pool.query('SELECT * FROM proveedores WHERE id = $1', [req.params.id]);
    if (!existentes.length) return res.status(404).json({ error: 'Proveedor no encontrado.' });
    const actual = existentes[0];

    const nombre = req.body.nombre !== undefined ? req.body.nombre.trim() : actual.nombre;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    const merged = {
      nombre,
      contacto: req.body.contacto !== undefined ? (req.body.contacto.trim() || null) : actual.contacto,
      telefono: req.body.telefono !== undefined ? (req.body.telefono.trim() || null) : actual.telefono,
      email: req.body.email !== undefined ? (req.body.email.trim() || null) : actual.email,
      notas: req.body.notas !== undefined ? (req.body.notas.trim() || null) : actual.notas,
      activo: req.body.activo !== undefined ? !!req.body.activo : actual.activo,
    };

    const { rows } = await pool.query(
      `UPDATE proveedores SET nombre=$1, contacto=$2, telefono=$3, email=$4, notas=$5, activo=$6
       WHERE id=$7 RETURNING *`,
      [merged.nombre, merged.contacto, merged.telefono, merged.email, merged.notas, merged.activo, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ya existe un proveedor con ese nombre.' });
    next(err);
  }
});

// Baja lógica (los productos que lo referencian conservan el vínculo histórico).
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'UPDATE proveedores SET activo = FALSE WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Proveedor no encontrado.' });
    res.json({ ok: true, proveedor: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
