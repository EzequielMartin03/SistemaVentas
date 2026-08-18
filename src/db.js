const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

// El local opera en Argentina: NOW()/CURRENT_DATE deben reflejar ese huso
// horario sin importar en qué servidor/zona corra Postgres, para que "el
// día de hoy" en Caja/Estadísticas coincida con el día real del comercio.
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'America/Argentina/Buenos_Aires'");
});

module.exports = { pool };
