const express = require('express');
const { pool } = require('../db');
const { generarEtiquetasPDF } = require('../lib/pdfEtiquetas');

const router = express.Router();

// GET /api/etiquetas/pdf?ambito=todos|categoria|proveedor|seleccion&categoria_id=&proveedor_id=&ids=1,2,3
router.get('/pdf', async (req, res, next) => {
  try {
    const { ambito, categoria_id, proveedor_id, ids } = req.query;
    const condiciones = ['activo = TRUE'];
    const params = [];

    if (ambito === 'categoria') {
      if (!categoria_id) return res.status(400).json({ error: 'Elegí una categoría.' });
      params.push(categoria_id);
      condiciones.push(`categoria_id = $${params.length}`);
    } else if (ambito === 'proveedor') {
      if (!proveedor_id) return res.status(400).json({ error: 'Elegí un proveedor.' });
      params.push(proveedor_id);
      condiciones.push(`proveedor_id = $${params.length}`);
    } else if (ambito === 'seleccion') {
      const idsArray = (ids || '').split(',').map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
      if (!idsArray.length) return res.status(400).json({ error: 'Elegí al menos un producto.' });
      params.push(idsArray);
      condiciones.push(`id = ANY($${params.length})`);
    } else if (ambito !== 'todos') {
      return res.status(400).json({ error: 'Elegí qué productos incluir.' });
    }

    const [{ rows: productos }, { rows: configRows }] = await Promise.all([
      pool.query(`SELECT * FROM productos WHERE ${condiciones.join(' AND ')} ORDER BY nombre`, params),
      pool.query('SELECT * FROM negocio_config WHERE id = 1'),
    ]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="etiquetas-precios.pdf"');

    const doc = generarEtiquetasPDF(productos, configRows[0]);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
