const { Pool } = require('pg');

// El local opera en Argentina: NOW()/CURRENT_DATE deben reflejar ese huso
// horario sin importar en qué servidor/zona corra Postgres, para que "el
// día de hoy" en Caja/Estadísticas coincida con el día real del comercio.
// Se pasa como parámetro de arranque de la conexión (no como query aparte)
// para evitar una condición de carrera con la primera consulta real.
const TIMEZONE_OPTION = '-c TimeZone=America/Argentina/Buenos_Aires';

// DATABASE_URL (Neon, Render, Railway, etc.) trae host/user/password/db en
// una sola cadena y requiere SSL. En local seguimos usando las variables
// PG* sueltas del .env, sin SSL.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      options: TIMEZONE_OPTION,
    })
  : new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      options: TIMEZONE_OPTION,
    });

module.exports = { pool };
