require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrar() {
  const dir = path.join(__dirname, 'migrations');
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  try {
    for (const archivo of archivos) {
      const sql = fs.readFileSync(path.join(dir, archivo), 'utf8');
      console.log(`Aplicando ${archivo}...`);
      await pool.query(sql);
    }
    console.log('Migración aplicada correctamente.');
  } catch (err) {
    console.error('Error al migrar:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrar();
