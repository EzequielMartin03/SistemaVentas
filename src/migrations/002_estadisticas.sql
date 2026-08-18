-- Migración 002: código de barras + datos del comercio (para tickets/reportes).
-- Aditiva: no borra nada, segura de correr varias veces.

ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(64) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_productos_codigo_barras ON productos(codigo_barras);

CREATE TABLE IF NOT EXISTS negocio_config (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nombre      VARCHAR(150) NOT NULL DEFAULT 'Polirubro Avellaneda',
  direccion   VARCHAR(200),
  telefono    VARCHAR(50),
  mensaje_pie VARCHAR(200) NOT NULL DEFAULT 'Gracias por su compra'
);

INSERT INTO negocio_config (id, nombre) VALUES (1, 'Polirubro Avellaneda')
  ON CONFLICT (id) DO NOTHING;
