require('dotenv').config();
const { pool } = require('./db');
const { hashPassword } = require('./lib/auth');

async function seed() {
  const nombreUsuario = process.env.ADMIN_USUARIO;
  const password = process.env.ADMIN_PASSWORD;
  const nombreCompleto = process.env.ADMIN_NOMBRE || 'Administrador';

  if (!nombreUsuario || !password) {
    console.error('Definí ADMIN_USUARIO y ADMIN_PASSWORD como variables de entorno antes de correr este script.');
    console.error('Ejemplo: ADMIN_USUARIO=admin ADMIN_PASSWORD="unaClaveLarga123!" npm run seed:admin');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD debe tener al menos 8 caracteres.');
    process.exitCode = 1;
    return;
  }

  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre_usuario, nombre_completo, rol, password_hash)
       VALUES ($1, $2, 'admin', $3)
       ON CONFLICT (nombre_usuario)
       DO UPDATE SET password_hash = EXCLUDED.password_hash, rol = 'admin', activo = TRUE
       RETURNING id, nombre_usuario, rol`,
      [nombreUsuario, nombreCompleto, passwordHash]
    );
    console.log(`Usuario admin listo: ${rows[0].nombre_usuario} (id ${rows[0].id}).`);
  } catch (err) {
    console.error('Error al crear el admin:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
