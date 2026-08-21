-- Migración 005: módulo de proveedores completo (antes era solo un campo
-- de texto libre en productos). Migra los valores de texto ya cargados a
-- la tabla nueva antes de eliminar la columna vieja. Aditiva/idempotente.

CREATE TABLE IF NOT EXISTS proveedores (
  id         SERIAL PRIMARY KEY,
  nombre     VARCHAR(150) NOT NULL UNIQUE,
  contacto   VARCHAR(150),
  telefono   VARCHAR(50),
  email      VARCHAR(150),
  notas      TEXT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Si venían proveedores cargados como texto libre (columna vieja), se
-- crean como proveedores reales antes de migrar la referencia.
INSERT INTO proveedores (nombre)
  SELECT DISTINCT proveedor FROM productos WHERE proveedor IS NOT NULL
  ON CONFLICT (nombre) DO NOTHING;

ALTER TABLE productos ADD COLUMN IF NOT EXISTS proveedor_id INTEGER REFERENCES proveedores(id);

UPDATE productos p SET proveedor_id = pr.id
  FROM proveedores pr
  WHERE p.proveedor = pr.nombre AND p.proveedor_id IS NULL;

ALTER TABLE productos DROP COLUMN IF EXISTS proveedor;

CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos(proveedor_id);
