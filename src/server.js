require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const categoriasRouter = require('./routes/categorias');
const productosRouter = require('./routes/productos');
const ventasRouter = require('./routes/ventas');
const cajaRouter = require('./routes/caja');
const configuracionRouter = require('./routes/configuracion');
const estadisticasRouter = require('./routes/estadisticas');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/categorias', categoriasRouter);
app.use('/api/productos', productosRouter);
app.use('/api/ventas', ventasRouter);
app.use('/api/caja', cajaRouter);
app.use('/api/configuracion', configuracionRouter);
app.use('/api/estadisticas', estadisticasRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Manejo de errores centralizado
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de forraje-stock corriendo en http://localhost:${PORT}`);
});
