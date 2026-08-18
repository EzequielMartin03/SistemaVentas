const express = require('express');
const { pool } = require('../db');
const { generarReportePDF } = require('../lib/pdfReporte');

const router = express.Router();

async function calcularEstadisticas(desdeParam, hastaParam) {
  const { rows: [{ desde, hasta }] } = await pool.query(
    `SELECT COALESCE($1::date, CURRENT_DATE) AS desde, COALESCE($2::date, CURRENT_DATE) AS hasta`,
    [desdeParam || null, hastaParam || null]
  );

  const [totales, porFormaPago, porCategoria, topProductos, porDia] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS cantidad_ventas,
              COALESCE(SUM(total), 0) AS total,
              COALESCE(SUM(costo_total), 0) AS costo_total,
              COALESCE(SUM(ganancia_total), 0) AS ganancia_total
       FROM ventas WHERE creado_en::date BETWEEN $1 AND $2`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT forma_pago, COALESCE(SUM(total), 0) AS total, COUNT(*)::int AS cantidad
       FROM ventas WHERE creado_en::date BETWEEN $1 AND $2
       GROUP BY forma_pago`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT c.nombre AS categoria,
              COALESCE(SUM(vi.subtotal), 0) AS total,
              COALESCE(SUM(vi.ganancia_subtotal), 0) AS ganancia,
              COUNT(*)::int AS cantidad
       FROM venta_items vi
       JOIN ventas v ON v.id = vi.venta_id
       JOIN productos p ON p.id = vi.producto_id
       JOIN categorias c ON c.id = p.categoria_id
       WHERE v.creado_en::date BETWEEN $1 AND $2
       GROUP BY c.nombre ORDER BY total DESC`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT vi.producto_id,
              MAX(vi.nombre_producto) AS nombre_producto,
              COALESCE(SUM(vi.subtotal), 0) AS total,
              COALESCE(SUM(vi.ganancia_subtotal), 0) AS ganancia,
              COUNT(*)::int AS cantidad_ventas
       FROM venta_items vi
       JOIN ventas v ON v.id = vi.venta_id
       WHERE v.creado_en::date BETWEEN $1 AND $2
       GROUP BY vi.producto_id ORDER BY total DESC LIMIT 10`,
      [desde, hasta]
    ),
    pool.query(
      `SELECT v.creado_en::date AS fecha,
              COALESCE(SUM(v.total), 0) AS total,
              COALESCE(SUM(v.ganancia_total), 0) AS ganancia,
              COUNT(*)::int AS cantidad_ventas
       FROM ventas v WHERE v.creado_en::date BETWEEN $1 AND $2
       GROUP BY v.creado_en::date ORDER BY fecha`,
      [desde, hasta]
    ),
  ]);

  const t = totales.rows[0];
  const total = Number(t.total);
  const cantidadVentas = t.cantidad_ventas;

  return {
    desde: desde.toISOString().slice(0, 10),
    hasta: hasta.toISOString().slice(0, 10),
    total,
    costo_total: Number(t.costo_total),
    ganancia_total: Number(t.ganancia_total),
    cantidad_ventas: cantidadVentas,
    ticket_promedio: cantidadVentas > 0 ? Number((total / cantidadVentas).toFixed(2)) : 0,
    por_forma_pago: porFormaPago.rows.map((r) => ({ ...r, total: Number(r.total) })),
    por_categoria: porCategoria.rows.map((r) => ({ ...r, total: Number(r.total), ganancia: Number(r.ganancia) })),
    top_productos: topProductos.rows.map((r) => ({ ...r, total: Number(r.total), ganancia: Number(r.ganancia) })),
    por_dia: porDia.rows.map((r) => ({
      fecha: r.fecha.toISOString().slice(0, 10),
      total: Number(r.total),
      ganancia: Number(r.ganancia),
      cantidad_ventas: r.cantidad_ventas,
    })),
  };
}

// GET /api/estadisticas/resumen?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/resumen', async (req, res, next) => {
  try {
    const datos = await calcularEstadisticas(req.query.desde, req.query.hasta);
    res.json(datos);
  } catch (err) {
    next(err);
  }
});

// GET /api/estadisticas/reporte.pdf?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/reporte.pdf', async (req, res, next) => {
  try {
    const [datos, configRows] = await Promise.all([
      calcularEstadisticas(req.query.desde, req.query.hasta),
      pool.query('SELECT * FROM negocio_config WHERE id = 1'),
    ]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-ventas-${datos.desde}_${datos.hasta}.pdf"`);

    const doc = generarReportePDF(datos, configRows.rows[0]);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
