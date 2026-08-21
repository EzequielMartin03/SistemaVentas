-- Migración 006: campo marca en productos (filtro adicional para la
-- actualización masiva de precios y las etiquetas). Aditiva.

ALTER TABLE productos ADD COLUMN IF NOT EXISTS marca VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_productos_marca ON productos(marca);
