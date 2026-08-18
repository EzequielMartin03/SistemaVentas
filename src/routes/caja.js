const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/caja/resumen?fecha=YYYY-MM-DD (por defecto: hoy)
router.get('/resumen', async (req, res, next) => {
  try {
    const fecha = req.query.fecha || null;

    const { rows } = await pool.query(
      `SELECT v.*,
        COALESCE(json_agg(json_build_object(
          'producto_id', vi.producto_id,
          'nombre_producto', vi.nombre_producto,
          'modo_venta', vi.modo_venta,
          'cantidad', vi.cantidad,
          'precio_unitario', vi.precio_unitario,
          'subtotal', vi.subtotal,
          'ganancia_subtotal', vi.ganancia_subtotal
        ) ORDER BY vi.id) FILTER (WHERE vi.id IS NOT NULL), '[]') AS items
      FROM ventas v
      LEFT JOIN venta_items vi ON vi.venta_id = v.id
      WHERE v.creado_en::date = COALESCE($1::date, CURRENT_DATE)
      GROUP BY v.id
      ORDER BY v.creado_en DESC`,
      [fecha]
    );

    const { rows: [{ fecha_resuelta }] } = await pool.query(
      'SELECT COALESCE($1::date, CURRENT_DATE) AS fecha_resuelta', [fecha]
    );

    const porFormaPago = { efectivo: 0, tarjeta: 0, transferencia: 0 };
    let total = 0;
    let gananciaTotal = 0;

    for (const venta of rows) {
      total += Number(venta.total);
      gananciaTotal += Number(venta.ganancia_total);
      porFormaPago[venta.forma_pago] += Number(venta.total);
    }

    res.json({
      fecha: fecha_resuelta.toISOString().slice(0, 10),
      cantidad_ventas: rows.length,
      total: Number(total.toFixed(2)),
      ganancia_total: Number(gananciaTotal.toFixed(2)),
      por_forma_pago: {
        efectivo: Number(porFormaPago.efectivo.toFixed(2)),
        tarjeta: Number(porFormaPago.tarjeta.toFixed(2)),
        transferencia: Number(porFormaPago.transferencia.toFixed(2)),
      },
      ventas: rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
