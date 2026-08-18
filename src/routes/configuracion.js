const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM negocio_config WHERE id = 1');
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const nombre = (req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre del comercio es obligatorio.' });

    const direccion = (req.body.direccion || '').trim() || null;
    const telefono = (req.body.telefono || '').trim() || null;
    const mensaje_pie = (req.body.mensaje_pie || '').trim() || 'Gracias por su compra';

    const { rows } = await pool.query(
      `UPDATE negocio_config SET nombre=$1, direccion=$2, telefono=$3, mensaje_pie=$4
       WHERE id = 1 RETURNING *`,
      [nombre, direccion, telefono, mensaje_pie]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
