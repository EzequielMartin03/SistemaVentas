const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function calcularPrecio(costo, margen) {
  if (costo === null || costo === undefined || costo === '') return null;
  if (margen === null || margen === undefined || margen === '') return null;
  return Number((Number(costo) * (1 + Number(margen) / 100)).toFixed(2));
}

function validarProducto(body, { esCreacion }) {
  const errores = [];
  const {
    nombre, categoria_id,
    vende_por_peso, costo_kg, precio_kg,
    vende_por_bolsa, peso_bolsa_kg, costo_bolsa, precio_bolsa,
    vende_por_unidad, costo_unidad, precio_unidad,
  } = body;

  if (esCreacion && (!nombre || typeof nombre !== 'string' || !nombre.trim())) {
    errores.push('El nombre es obligatorio.');
  }
  if (esCreacion && !categoria_id) {
    errores.push('La categoría es obligatoria.');
  }

  const porPeso = !!vende_por_peso;
  const porBolsa = !!vende_por_bolsa;
  const porUnidad = !!vende_por_unidad;

  if (esCreacion && !porPeso && !porBolsa && !porUnidad) {
    errores.push('El producto debe habilitar al menos una modalidad de venta (peso, bolsa o unidad).');
  }
  if (porPeso && (costo_kg === undefined || costo_kg === null || Number(costo_kg) < 0)) {
    errores.push('Si vende por peso, debe indicar el costo por kg.');
  }
  if (porPeso && (precio_kg === undefined || precio_kg === null || Number(precio_kg) < 0)) {
    errores.push('Si vende por peso, debe indicar el precio por kg (o costo + margen).');
  }
  if (porBolsa && (!peso_bolsa_kg || Number(peso_bolsa_kg) <= 0)) {
    errores.push('Si vende por bolsa, debe indicar el peso de la bolsa (kg) mayor a 0.');
  }
  if (porBolsa && (costo_bolsa === undefined || costo_bolsa === null || Number(costo_bolsa) < 0)) {
    errores.push('Si vende por bolsa, debe indicar el costo de la bolsa.');
  }
  if (porBolsa && (precio_bolsa === undefined || precio_bolsa === null || Number(precio_bolsa) < 0)) {
    errores.push('Si vende por bolsa, debe indicar el precio de la bolsa (o costo + margen).');
  }
  if (porUnidad && (costo_unidad === undefined || costo_unidad === null || Number(costo_unidad) < 0)) {
    errores.push('Si vende por unidad, debe indicar el costo por unidad.');
  }
  if (porUnidad && (precio_unidad === undefined || precio_unidad === null || Number(precio_unidad) < 0)) {
    errores.push('Si vende por unidad, debe indicar el precio por unidad (o costo + margen).');
  }

  return errores;
}

// GET /api/productos?categoria_id=1&activo=true
router.get('/', async (req, res, next) => {
  try {
    const { categoria_id, activo } = req.query;
    const condiciones = [];
    const params = [];

    if (categoria_id) {
      params.push(categoria_id);
      condiciones.push(`p.categoria_id = $${params.length}`);
    }

    if (activo !== undefined) {
      params.push(activo === 'true');
      condiciones.push(`p.activo = $${params.length}`);
    } else {
      condiciones.push('p.activo = TRUE');
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT p.*, c.nombre AS categoria_nombre
       FROM productos p
       JOIN categorias c ON c.id = p.categoria_id
       ${where}
       ORDER BY c.nombre, p.nombre`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/productos/codigo/XXXX — búsqueda por código de barras (lector).
router.get('/codigo/:codigo', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.nombre AS categoria_nombre
       FROM productos p JOIN categorias c ON c.id = p.categoria_id
       WHERE p.codigo_barras = $1 AND p.activo = TRUE`,
      [req.params.codigo]
    );
    if (!rows.length) return res.status(404).json({ error: 'No se encontró ningún producto con ese código de barras.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.nombre AS categoria_nombre
       FROM productos p JOIN categorias c ON c.id = p.categoria_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      nombre, categoria_id, codigo_barras = null,
      vende_por_peso = false, costo_kg = null, margen_kg = 35,
      vende_por_bolsa = false, peso_bolsa_kg = null, costo_bolsa = null, margen_bolsa = 35,
      vende_por_unidad = false, costo_unidad = null, margen_unidad = 35,
    } = req.body;

    const precio_kg = req.body.precio_kg ?? calcularPrecio(costo_kg, margen_kg);
    const precio_bolsa = req.body.precio_bolsa ?? calcularPrecio(costo_bolsa, margen_bolsa);
    const precio_unidad = req.body.precio_unidad ?? calcularPrecio(costo_unidad, margen_unidad);

    const errores = validarProducto(
      { ...req.body, precio_kg, precio_bolsa, precio_unidad },
      { esCreacion: true }
    );
    if (errores.length) return res.status(400).json({ errores });

    const { rows } = await pool.query(
      `INSERT INTO productos (
        nombre, categoria_id, codigo_barras,
        vende_por_peso, costo_kg, margen_kg, precio_kg,
        vende_por_bolsa, peso_bolsa_kg, costo_bolsa, margen_bolsa, precio_bolsa,
        vende_por_unidad, costo_unidad, margen_unidad, precio_unidad
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        nombre.trim(), categoria_id, codigo_barras || null,
        vende_por_peso, costo_kg, margen_kg, precio_kg,
        vende_por_bolsa, peso_bolsa_kg, costo_bolsa, margen_bolsa, precio_bolsa,
        vende_por_unidad, costo_unidad, margen_unidad, precio_unidad,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23514') return res.status(400).json({ error: 'Datos inconsistentes: ' + err.message });
    if (err.code === '23503') return res.status(400).json({ error: 'La categoría indicada no existe.' });
    if (err.code === '23505') return res.status(400).json({ error: 'Ya existe un producto con ese código de barras.' });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { rows: existentes } = await pool.query('SELECT * FROM productos WHERE id = $1', [req.params.id]);
    if (!existentes.length) return res.status(404).json({ error: 'Producto no encontrado.' });
    const actual = existentes[0];
    const merged = { ...actual, ...req.body };

    // Si no mandaron precio explícito pero cambió costo/margen (o se activó
    // la modalidad recién ahora), se recalcula antes de validar.
    if (req.body.precio_kg === undefined && (req.body.costo_kg !== undefined || req.body.margen_kg !== undefined || req.body.vende_por_peso !== undefined)) {
      merged.precio_kg = calcularPrecio(merged.costo_kg, merged.margen_kg);
    }
    if (req.body.precio_bolsa === undefined && (req.body.costo_bolsa !== undefined || req.body.margen_bolsa !== undefined || req.body.vende_por_bolsa !== undefined)) {
      merged.precio_bolsa = calcularPrecio(merged.costo_bolsa, merged.margen_bolsa);
    }
    if (req.body.precio_unidad === undefined && (req.body.costo_unidad !== undefined || req.body.margen_unidad !== undefined || req.body.vende_por_unidad !== undefined)) {
      merged.precio_unidad = calcularPrecio(merged.costo_unidad, merged.margen_unidad);
    }

    const errores = validarProducto(merged, { esCreacion: false });
    if (errores.length) return res.status(400).json({ errores });

    merged.codigo_barras = merged.codigo_barras || null;

    const campos = [
      'nombre', 'categoria_id', 'codigo_barras',
      'vende_por_peso', 'costo_kg', 'margen_kg', 'precio_kg',
      'vende_por_bolsa', 'peso_bolsa_kg', 'costo_bolsa', 'margen_bolsa', 'precio_bolsa',
      'vende_por_unidad', 'costo_unidad', 'margen_unidad', 'precio_unidad',
      'activo',
    ];

    const { rows } = await pool.query(
      `UPDATE productos SET
        nombre=$1, categoria_id=$2, codigo_barras=$3,
        vende_por_peso=$4, costo_kg=$5, margen_kg=$6, precio_kg=$7,
        vende_por_bolsa=$8, peso_bolsa_kg=$9, costo_bolsa=$10, margen_bolsa=$11, precio_bolsa=$12,
        vende_por_unidad=$13, costo_unidad=$14, margen_unidad=$15, precio_unidad=$16,
        activo=$17, actualizado_en=NOW()
      WHERE id=$18 RETURNING *`,
      [...campos.map((c) => merged[c]), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23514') return res.status(400).json({ error: 'Datos inconsistentes: ' + err.message });
    if (err.code === '23503') return res.status(400).json({ error: 'La categoría indicada no existe.' });
    if (err.code === '23505') return res.status(400).json({ error: 'Ya existe un producto con ese código de barras.' });
    next(err);
  }
});

// Baja lógica (no se borra el histórico de ventas).
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'UPDATE productos SET activo = FALSE, actualizado_en = NOW() WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado.' });
    res.json({ ok: true, producto: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
