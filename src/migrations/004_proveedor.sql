-- Migración 004: campo proveedor en productos (para poder actualizar
-- precios masivamente agrupando por proveedor). Aditiva.

ALTER TABLE productos ADD COLUMN IF NOT EXISTS proveedor VARCHAR(150);
CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos(proveedor);
