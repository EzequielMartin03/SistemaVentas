const express = require('express');
const { pool } = require('../db');

const router = express.Router();

const FORMAS_PAGO = ['efectivo', 'tarjeta', 'transferencia'];
const MODOS_VENTA = ['kg', 'g', 'bolsa', 'unidad'];

const SELECT_VENTAS_CON_ITEMS = `
  SELECT v.*,
    COALESCE(json_agg(json_build_object(
      'producto_id', vi.producto_id,
      'nombre_producto', vi.nombre_producto,
      'modo_venta', vi.modo_venta,
      'cantidad', vi.cantidad,
      'precio_unitario', vi.precio_unitario,
      'costo_unitario', vi.costo_unitario,
      'subtotal', vi.subtotal,
      'costo_subtotal', vi.costo_subtotal,
      'ganancia_subtotal', vi.ganancia_subtotal
    ) ORDER BY vi.id) FILTER (WHERE vi.id IS NOT NULL), '[]') AS items
  FROM ventas v
  LEFT JOIN venta_items vi ON vi.venta_id = v.id
`;

// GET /api/ventas?fecha=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    const { fecha } = req.query;
    if (fecha) {
      const { rows } = await pool.query(
        `${SELECT_VENTAS_CON_ITEMS}
         WHERE v.creado_en::date = $1::date
         GROUP BY v.id
         ORDER BY v.creado_en DESC`,
        [fecha]
      );
      return res.json(rows);
    }

    const { rows } = await pool.query(
      `${SELECT_VENTAS_CON_ITEMS}
       GROUP BY v.id
       ORDER BY v.creado_en DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `${SELECT_VENTAS_CON_ITEMS} WHERE v.id = $1 GROUP BY v.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Venta no encontrada.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/ventas  { forma_pago, items: [{ producto_id, modo_venta, cantidad }] }
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { forma_pago, items } = req.body;

    if (!FORMAS_PAGO.includes(forma_pago)) {
      return res.status(400).json({ error: `forma_pago debe ser una de: ${FORMAS_PAGO.join(', ')}.` });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe enviar al menos un ítem en "items".' });
    }
    for (const it of items) {
      if (!it.producto_id || !MODOS_VENTA.includes(it.modo_venta) || !(Number(it.cantidad) > 0)) {
        return res.status(400).json({
          error: 'Cada ítem requiere producto_id, modo_venta (kg|g|bolsa|unidad) y cantidad > 0.',
        });
      }
    }

    await client.query('BEGIN');

    let total = 0;
    let costoTotal = 0;
    let gananciaTotal = 0;
    const itemsCalculados = [];

    for (const it of items) {
      const { rows } = await client.query('SELECT * FROM productos WHERE id = $1', [it.producto_id]);
      if (!rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Producto ${it.producto_id} no encontrado.` });
      }
      const producto = rows[0];

      if (!producto.activo) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Producto "${producto.nombre}" no está activo.` });
      }

      let precioUnitario;
      let costoUnitario;
      let cantidadEquivalente;
      const cantidad = Number(it.cantidad);

      if (it.modo_venta === 'kg' || it.modo_venta === 'g') {
        if (!producto.vende_por_peso) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `"${producto.nombre}" no se vende por peso.` });
        }
        precioUnitario = Number(producto.precio_kg);
        costoUnitario = Number(producto.costo_kg);
        cantidadEquivalente = it.modo_venta === 'g' ? cantidad / 1000 : cantidad;
      } else if (it.modo_venta === 'bolsa') {
        if (!producto.vende_por_bolsa) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `"${producto.nombre}" no se vende por bolsa.` });
        }
        precioUnitario = Number(producto.precio_bolsa);
        costoUnitario = Number(producto.costo_bolsa);
        cantidadEquivalente = cantidad;
      } else {
        if (!producto.vende_por_unidad) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `"${producto.nombre}" no se vende por unidad.` });
        }
        precioUnitario = Number(producto.precio_unidad);
        costoUnitario = Number(producto.costo_unidad);
        cantidadEquivalente = cantidad;
      }

      const subtotal = Number((precioUnitario * cantidadEquivalente).toFixed(2));
      const costoSubtotal = Number((costoUnitario * cantidadEquivalente).toFixed(2));
      const gananciaSubtotal = Number((subtotal - costoSubtotal).toFixed(2));

      total += subtotal;
      costoTotal += costoSubtotal;
      gananciaTotal += gananciaSubtotal;

      itemsCalculados.push({
        producto_id: producto.id,
        nombre_producto: producto.nombre,
        modo_venta: it.modo_venta,
        cantidad,
        precio_unitario: precioUnitario,
        costo_unitario: costoUnitario,
        subtotal,
        costo_subtotal: costoSubtotal,
        ganancia_subtotal: gananciaSubtotal,
      });
    }

    total = Number(total.toFixed(2));
    costoTotal = Number(costoTotal.toFixed(2));
    gananciaTotal = Number(gananciaTotal.toFixed(2));

    const { rows: ventaRows } = await client.query(
      'INSERT INTO ventas (forma_pago, total, costo_total, ganancia_total) VALUES ($1,$2,$3,$4) RETURNING *',
      [forma_pago, total, costoTotal, gananciaTotal]
    );
    const venta = ventaRows[0];

    for (const it of itemsCalculados) {
      await client.query(
        `INSERT INTO venta_items (
          venta_id, producto_id, nombre_producto, modo_venta, cantidad,
          precio_unitario, costo_unitario, subtotal, costo_subtotal, ganancia_subtotal
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          venta.id, it.producto_id, it.nombre_producto, it.modo_venta, it.cantidad,
          it.precio_unitario, it.costo_unitario, it.subtotal, it.costo_subtotal, it.ganancia_subtotal,
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ...venta, items: itemsCalculados });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
