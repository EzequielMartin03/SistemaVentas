-- Esquema: Polirubro Avellaneda — sistema de ventas (sin control de stock).
-- Idempotente: se puede correr varias veces sobre la misma base sin romper
-- ni pisar datos ya cargados. Solo se eliminan objetos que pertenecían
-- exclusivamente al viejo esquema de control de stock (nunca los datos
-- del esquema de ventas actual).

DROP TABLE IF EXISTS movimientos_stock CASCADE;
DROP TYPE IF EXISTS categoria_producto;

CREATE TABLE IF NOT EXISTS categorias (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  activa      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO categorias (nombre) VALUES
  ('Balanceado'), ('Limpieza'), ('Veterinaria'), ('Varios')
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS productos (
  id                 SERIAL PRIMARY KEY,
  nombre             VARCHAR(150) NOT NULL,
  categoria_id       INTEGER NOT NULL REFERENCES categorias(id),

  -- Venta por peso: unidad libre (kg o gramos) en el momento de la venta.
  vende_por_peso     BOOLEAN NOT NULL DEFAULT FALSE,
  costo_kg           NUMERIC(12,2),
  margen_kg          NUMERIC(6,2) NOT NULL DEFAULT 35,
  precio_kg          NUMERIC(12,2),

  -- Venta por bolsa cerrada, precio propio (no proporcional al precio suelto).
  vende_por_bolsa    BOOLEAN NOT NULL DEFAULT FALSE,
  peso_bolsa_kg      NUMERIC(10,3),
  costo_bolsa        NUMERIC(12,2),
  margen_bolsa       NUMERIC(6,2) NOT NULL DEFAULT 35,
  precio_bolsa       NUMERIC(12,2),

  -- Venta por unidad (limpieza, veterinaria, varios).
  vende_por_unidad   BOOLEAN NOT NULL DEFAULT FALSE,
  costo_unidad       NUMERIC(12,2),
  margen_unidad      NUMERIC(6,2) NOT NULL DEFAULT 35,
  precio_unidad      NUMERIC(12,2),

  activo             BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en          TIMESTAMP NOT NULL DEFAULT NOW(),
  actualizado_en     TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_alguna_modalidad CHECK (
    vende_por_peso OR vende_por_bolsa OR vende_por_unidad
  ),
  CONSTRAINT chk_peso_requiere_datos CHECK (
    NOT vende_por_peso OR (costo_kg IS NOT NULL AND precio_kg IS NOT NULL)
  ),
  CONSTRAINT chk_bolsa_requiere_datos CHECK (
    NOT vende_por_bolsa OR (
      peso_bolsa_kg IS NOT NULL AND peso_bolsa_kg > 0
      AND costo_bolsa IS NOT NULL AND precio_bolsa IS NOT NULL
    )
  ),
  CONSTRAINT chk_unidad_requiere_datos CHECK (
    NOT vende_por_unidad OR (costo_unidad IS NOT NULL AND precio_unidad IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS ventas (
  id               SERIAL PRIMARY KEY,
  forma_pago       VARCHAR(20) NOT NULL CHECK (forma_pago IN ('efectivo', 'tarjeta', 'transferencia')),
  total            NUMERIC(14,2) NOT NULL,
  costo_total      NUMERIC(14,2) NOT NULL,
  ganancia_total   NUMERIC(14,2) NOT NULL,
  creado_en        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venta_items (
  id                  SERIAL PRIMARY KEY,
  venta_id            INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id         INTEGER NOT NULL REFERENCES productos(id),
  nombre_producto     VARCHAR(150) NOT NULL,
  modo_venta          VARCHAR(10) NOT NULL CHECK (modo_venta IN ('kg', 'g', 'bolsa', 'unidad')),
  cantidad            NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
  precio_unitario     NUMERIC(12,2) NOT NULL,
  costo_unitario      NUMERIC(12,2) NOT NULL,
  subtotal            NUMERIC(14,2) NOT NULL,
  costo_subtotal      NUMERIC(14,2) NOT NULL,
  ganancia_subtotal   NUMERIC(14,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_venta_items_venta ON venta_items(venta_id);
CREATE INDEX IF NOT EXISTS idx_ventas_creado_en ON ventas(creado_en);
