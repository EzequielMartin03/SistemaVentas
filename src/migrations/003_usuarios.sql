-- Migración 003: usuarios con roles (admin / cajero) para el login.
-- Aditiva. No se hardcodea ningún usuario/contraseña acá: el primer admin
-- se crea con `npm run seed:admin` (lee credenciales de variables de
-- entorno, nunca quedan en el repo).

CREATE TABLE IF NOT EXISTS usuarios (
  id                SERIAL PRIMARY KEY,
  nombre_usuario    VARCHAR(50) NOT NULL UNIQUE,
  nombre_completo   VARCHAR(150) NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  rol               VARCHAR(20) NOT NULL CHECK (rol IN ('admin', 'cajero')),
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta   TIMESTAMPTZ,
  ultimo_login      TIMESTAMPTZ,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
