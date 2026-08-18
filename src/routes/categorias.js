const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { activa } = req.query;
    const condiciones = [];
    const params = [];

    if (activa !== undefined) {
      params.push(activa === 'true');
      condiciones.push(`activa = $${params.length}`);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM categorias ${where} ORDER BY nombre`,
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
      'INSERT INTO categorias (nombre) VALUES ($1) RETURNING *',
      [nombre]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ya existe una categoría con ese nombre.' });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const nombre = (req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    const activa = req.body.activa === undefined ? true : !!req.body.activa;

    const { rows } = await pool.query(
      'UPDATE categorias SET nombre=$1, activa=$2 WHERE id=$3 RETURNING *',
      [nombre, activa, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Categoría no encontrada.' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ya existe una categoría con ese nombre.' });
    next(err);
  }
});

// Baja lógica (no se borra: puede haber productos referenciándola).
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'UPDATE categorias SET activa = FALSE WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Categoría no encontrada.' });
    res.json({ ok: true, categoria: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
