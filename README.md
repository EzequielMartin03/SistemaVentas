# Polirubro Avellaneda — Sistema de Ventas

Sistema de **ventas** (no de stock) para un polirubro que vende balanceado
(por **kg**, **gramos** o **bolsa cerrada**), productos de **limpieza**,
**veterinaria** y **varios** (por **unidad**). No lleva inventario: el
objetivo es registrar cada venta y saber cuánto se vendió y cuánta
**ganancia** dejó cada día.

Stack: **Node.js + Express + PostgreSQL**, interfaz web en HTML/CSS/JS sin
frameworks.

## 1. Requisitos

- Node.js 18+
- PostgreSQL corriendo (local o remoto)

## 2. Instalación

```bash
cd forraje-stock
npm install
cp .env.example .env
```

Editá `.env` con los datos de tu PostgreSQL:

```
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=tu_password
PGDATABASE=forraje_stock
PORT=3000
```

Creá la base de datos (si no existe):

```bash
createdb forraje_stock
# o desde psql: CREATE DATABASE forraje_stock;
```

Corré la migración (crea las tablas; es segura de correr varias veces):

```bash
npm run migrate
```

## 3. Levantar el servidor

```bash
npm start
```

Abrí `http://localhost:3000` en el navegador.

## 4. Cómo está pensado

- **Categorías**: un módulo aparte (`Balanceado`, `Limpieza`, `Veterinaria`,
  `Varios` precargadas). Cada producto pertenece a una.
- **Productos**: sin stock. Cada producto habilita una o varias modalidades
  de venta, cada una con su **costo** y **margen %** (default 35%), que
  sugieren automáticamente el precio de venta:
  - **Por peso**: el cajero elige libremente **kg o gramos** al vender; el
    precio siempre se calcula sobre el precio por kg cargado.
  - **Por bolsa cerrada**: peso y precio propios, no proporcional al precio
    suelto.
  - **Por unidad**: para limpieza, veterinaria, varios.
- **Ventas**: cada venta indica la **forma de pago** (efectivo, tarjeta,
  transferencia) y uno o más ítems. El precio y el costo se recalculan en el
  servidor a partir del producto (no se confía en lo que mande el cliente) y
  quedan **congelados** en la venta, así cambiar un precio después no altera
  el historial.
- **Caja**: resumen automático del día — total vendido, ganancia, cantidad
  de ventas, desglose por forma de pago y listado de ventas. Se puede
  consultar cualquier día con el selector de fecha.

## 5. Principales endpoints de la API

| Método | Ruta                       | Descripción                                      |
|--------|----------------------------|---------------------------------------------------|
| GET    | `/api/categorias`          | Lista categorías (`?activa=true`)                 |
| POST   | `/api/categorias`          | Crea una categoría                                 |
| PUT    | `/api/categorias/:id`      | Edita una categoría                                |
| DELETE | `/api/categorias/:id`      | Baja lógica                                        |
| GET    | `/api/productos`           | Lista productos (`?categoria_id=`, `?activo=`)     |
| GET    | `/api/productos/:id`       | Detalle de un producto                             |
| POST   | `/api/productos`           | Crea un producto                                   |
| PUT    | `/api/productos/:id`       | Edita un producto                                  |
| DELETE | `/api/productos/:id`       | Baja lógica (no borra histórico de ventas)         |
| GET    | `/api/ventas`              | Lista ventas (`?fecha=YYYY-MM-DD`)                 |
| POST   | `/api/ventas`               | Registra una venta con múltiples ítems             |
| GET    | `/api/caja/resumen`        | Resumen del día (`?fecha=YYYY-MM-DD`, default hoy) |

### Ejemplo: crear un balanceado que se vende por kg/gramos y por bolsa de 20kg

```json
POST /api/productos
{
  "nombre": "Balanceado perro adulto 20kg",
  "categoria_id": 1,
  "vende_por_peso": true, "costo_kg": 1000, "margen_kg": 35,
  "vende_por_bolsa": true, "peso_bolsa_kg": 20, "costo_bolsa": 18000, "margen_bolsa": 35
}
```

`precio_kg` y `precio_bolsa` se autocalculan como `costo * (1 + margen/100)`
si no se envían explícitamente.

### Ejemplo: registrar una venta mixta

```json
POST /api/ventas
{
  "forma_pago": "efectivo",
  "items": [
    { "producto_id": 1, "modo_venta": "kg", "cantidad": 3 },
    { "producto_id": 1, "modo_venta": "g", "cantidad": 500 },
    { "producto_id": 1, "modo_venta": "bolsa", "cantidad": 1 },
    { "producto_id": 2, "modo_venta": "unidad", "cantidad": 2 }
  ]
}
```

## 6. Próximos pasos posibles (no incluidos)

- Autenticación de usuarios / roles (cajero, admin).
- Impresión de tickets.
- Reportes históricos más allá del filtro por fecha en Caja.
- Edición o anulación de una venta ya confirmada.
