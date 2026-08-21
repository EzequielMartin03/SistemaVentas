const API = '/api';

let categoriasCache = [];
let productosCache = [];
let carrito = [];
let filtroCategoriaProductos = '';
let formaPagoSeleccionada = 'efectivo';
let unidadPesoSeleccionada = 'kg';
let productoEditandoId = null;
let negocioConfigCache = null;
let ultimaVentaConfirmada = null;
let estadisticasModo = 'rango';
let usuarioActual = null;
let usuariosCache = [];
let usuarioEditandoId = null;
let proveedoresCache = [];
let proveedorEditandoId = null;

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

function money(n) {
  const num = Number(n) || 0;
  return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Deshabilita el botón y le muestra un spinner mientras `fn` está en curso,
// para que una acción que tarda (el server gratis puede tardar en
// responder) no parezca que el sistema quedó colgado.
async function conCarga(boton, textoCargando, fn) {
  const textoOriginal = boton.innerHTML;
  boton.disabled = true;
  boton.innerHTML = `<span class="spinner"></span>${textoCargando}`;
  try {
    return await fn();
  } finally {
    boton.disabled = false;
    boton.innerHTML = textoOriginal;
  }
}

// Modal de confirmación propio (reemplaza el confirm() nativo del navegador,
// que se ve feo y no combina con el resto del sistema). Devuelve una
// promesa que resuelve true/false según lo que elija el usuario.
function confirmarAccion(mensaje, opciones = {}) {
  const { titulo = 'Confirmar acción', textoConfirmar = 'Confirmar', peligro = false } = opciones;
  return new Promise((resolve) => {
    $('#mc-titulo').textContent = titulo;
    $('#mc-mensaje').textContent = mensaje;
    const btnConfirmar = $('#mc-confirmar');
    btnConfirmar.textContent = textoConfirmar;
    btnConfirmar.classList.toggle('btn-peligro', peligro);
    $('#modal-confirmar').classList.remove('oculto');

    const cerrar = (resultado) => {
      $('#modal-confirmar').classList.add('oculto');
      btnConfirmar.removeEventListener('click', onConfirmar);
      $('#mc-cancelar').removeEventListener('click', onCancelar);
      resolve(resultado);
    };
    const onConfirmar = () => cerrar(true);
    const onCancelar = () => cerrar(false);
    btnConfirmar.addEventListener('click', onConfirmar);
    $('#mc-cancelar').addEventListener('click', onCancelar);
  });
}

// Overlay grande de "cargando" para acciones que tardan y son importantes
// (ej: aplicar cambios de precio) — más visible que el spinner del botón.
function mostrarCargaGrande(texto) {
  $('#cg-texto-cargando').textContent = texto;
  $('#cg-estado-cargando').classList.remove('oculto');
  $('#cg-estado-exito').classList.add('oculto');
  $('#modal-carga-grande').classList.remove('oculto');
}
function mostrarExitoCargaGrande(mensaje) {
  $('#cg-texto-exito').textContent = mensaje;
  $('#cg-estado-cargando').classList.add('oculto');
  $('#cg-estado-exito').classList.remove('oculto');
}
function cerrarCargaGrande() {
  $('#modal-carga-grande').classList.add('oculto');
}
$('#cg-btn-cerrar').addEventListener('click', cerrarCargaGrande);

function hoyISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

// Si la sesión expira (o un admin desactiva al usuario) mientras está
// usando el sistema, cualquier pedido a la API que devuelva 401 lo manda
// de vuelta a la pantalla de login, sin tener que revisar cada fetch().
const fetchOriginal = window.fetch.bind(window);
window.fetch = async (...args) => {
  const res = await fetchOriginal(...args);
  const url = typeof args[0] === 'string' ? args[0] : args[0].url;
  if (res.status === 401 && url.startsWith(API) && !url.includes('/auth/')) {
    mostrarPantallaLogin();
  }
  return res;
};

/* ---------- NAVEGACIÓN ---------- */
$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    activarVista(tab.dataset.vista);
    cerrarMenuMovil();
  });
});

function abrirMenuMovil() {
  $('#topbar').classList.add('menu-abierto');
  $('#menu-movil-fondo').classList.remove('oculto');
  $('#btn-menu-movil').setAttribute('aria-expanded', 'true');
}
function cerrarMenuMovil() {
  $('#topbar').classList.remove('menu-abierto');
  $('#menu-movil-fondo').classList.add('oculto');
  $('#btn-menu-movil').setAttribute('aria-expanded', 'false');
}
$('#btn-menu-movil').addEventListener('click', () => {
  if ($('#topbar').classList.contains('menu-abierto')) cerrarMenuMovil();
  else abrirMenuMovil();
});
$('#menu-movil-fondo').addEventListener('click', cerrarMenuMovil);

function activarVista(vista) {
  $$('.tab').forEach((t) => t.classList.toggle('activo', t.dataset.vista === vista));
  $$('.vista').forEach((v) => v.classList.toggle('activa', v.id === `vista-${vista}`));
  if (vista === 'caja') cargarCaja();
  if (vista === 'venta') iniciarVistaVenta();
  if (vista === 'productos') cargarProductos();
  if (vista === 'categorias') cargarCategorias();
  if (vista === 'estadisticas') iniciarVistaEstadisticas();
  if (vista === 'ajustes') cargarAjustes();
  if (vista === 'usuarios') cargarUsuarios();
  if (vista === 'proveedores') cargarProveedores();
  if (vista === 'precios') iniciarVistaPrecios();
  if (vista === 'etiquetas') iniciarVistaEtiquetas();
}

/* ---------- PROVEEDORES (compartido) ---------- */
async function obtenerProveedores() {
  const res = await fetch(`${API}/proveedores`);
  proveedoresCache = await res.json();
  return proveedoresCache;
}

/* ---------- AUTENTICACIÓN ---------- */
async function verificarSesion() {
  const res = await fetch(`${API}/auth/me`);
  if (!res.ok) {
    mostrarPantallaLogin();
    return;
  }
  usuarioActual = await res.json();
  mostrarApp();
}

function mostrarPantallaLogin() {
  usuarioActual = null;
  $('#pantalla-login').classList.remove('oculto');
  $('#topbar').classList.add('oculto');
  $('#main-app').classList.add('oculto');
  $('#login-password').value = '';
  $('#login-mensaje').textContent = '';
  $('#login-usuario').focus();
}

function mostrarApp() {
  $('#pantalla-login').classList.add('oculto');
  $('#topbar').classList.remove('oculto');
  $('#main-app').classList.remove('oculto');
  $('#sesion-nombre').textContent = `${usuarioActual.nombre_completo} (${usuarioActual.rol === 'admin' ? 'Admin' : 'Cajero'})`;
  $$('.solo-admin').forEach((el) => el.classList.toggle('oculto', usuarioActual.rol !== 'admin'));
  activarVista('caja');
}

$('#btn-login').addEventListener('click', intentarLogin);
$('#login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') intentarLogin(); });
$('#login-usuario').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#login-password').focus(); });

async function intentarLogin() {
  const usuario = $('#login-usuario').value.trim();
  const password = $('#login-password').value;
  const msg = $('#login-mensaje');
  if (!usuario || !password) {
    msg.textContent = 'Ingresá usuario y contraseña.';
    msg.className = 'mensaje error';
    return;
  }

  await conCarga($('#btn-login'), 'Ingresando…', async () => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || 'No se pudo iniciar sesión.';
      msg.className = 'mensaje error';
      return;
    }
    usuarioActual = data;
    mostrarApp();
  });
}

$('#btn-cerrar-sesion').addEventListener('click', async () => {
  await fetch(`${API}/auth/logout`, { method: 'POST' });
  mostrarPantallaLogin();
});

/* ---------- USUARIOS (solo admin) ---------- */
async function cargarUsuarios() {
  const res = await fetch(`${API}/usuarios`);
  if (!res.ok) return;
  usuariosCache = await res.json();
  const tbody = $('#tabla-usuarios');
  if (!usuariosCache.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="vacio">No hay usuarios.</td></tr>';
    return;
  }
  tbody.innerHTML = usuariosCache.map((u) => `
    <tr>
      <td>${u.nombre_usuario}</td>
      <td>${u.nombre_completo}</td>
      <td>${u.rol === 'admin' ? 'Admin' : 'Cajero'}</td>
      <td>${u.activo ? 'Activo' : 'Inactivo'}</td>
      <td>${u.ultimo_login ? new Date(u.ultimo_login).toLocaleString('es-AR') : '—'}</td>
      <td>
        <button class="btn-fila" data-accion="editar" data-id="${u.id}">Editar</button>
        <button class="btn-fila ${u.activo ? 'peligro' : ''}" data-accion="toggle" data-id="${u.id}">${u.activo ? 'Desactivar' : 'Activar'}</button>
      </td>
    </tr>
  `).join('');

  $$('[data-accion="editar"]', tbody).forEach((btn) => {
    btn.addEventListener('click', () => abrirModalUsuario(Number(btn.dataset.id)));
  });
  $$('[data-accion="toggle"]', tbody).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const u = usuariosCache.find((x) => x.id === Number(btn.dataset.id));
      await fetch(`${API}/usuarios/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !u.activo }),
      });
      cargarUsuarios();
    });
  });
}

const modalUsuario = $('#modal-usuario');
$('#btn-nuevo-usuario').addEventListener('click', () => abrirModalUsuario(null));
$('#cerrar-modal-usuario').addEventListener('click', () => modalUsuario.classList.add('oculto'));

function abrirModalUsuario(id) {
  usuarioEditandoId = id;
  $('#us-mensaje').textContent = '';
  const u = id ? usuariosCache.find((x) => x.id === id) : null;

  $('#modal-usuario-titulo').textContent = u ? 'Editar usuario' : 'Nuevo usuario';
  $('#us-nombre-usuario').value = u ? u.nombre_usuario : '';
  $('#us-nombre-usuario').disabled = !!u;
  $('#us-nombre-completo').value = u ? u.nombre_completo : '';
  $('#us-rol').value = u ? u.rol : 'cajero';
  $('#us-activo').checked = u ? u.activo : true;
  $('#us-password').value = '';
  $('#us-label-password').textContent = u ? 'Nueva contraseña (dejar vacío para no cambiarla)' : 'Contraseña (mínimo 8 caracteres)';

  modalUsuario.classList.remove('oculto');
}

$('#btn-guardar-usuario').addEventListener('click', async (e) => {
  const msg = $('#us-mensaje');
  const body = {
    nombre_usuario: $('#us-nombre-usuario').value.trim(),
    nombre_completo: $('#us-nombre-completo').value.trim(),
    rol: $('#us-rol').value,
    activo: $('#us-activo').checked,
  };
  if ($('#us-password').value) body.password = $('#us-password').value;

  const url = usuarioEditandoId ? `${API}/usuarios/${usuarioEditandoId}` : `${API}/usuarios`;
  const method = usuarioEditandoId ? 'PUT' : 'POST';

  await conCarga(e.currentTarget, 'Guardando…', async () => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = (data.errores || [data.error]).join(' ');
      msg.className = 'mensaje error';
      return;
    }
    msg.textContent = 'Usuario guardado.';
    msg.className = 'mensaje ok';
    setTimeout(() => modalUsuario.classList.add('oculto'), 500);
    cargarUsuarios();
  });
});

/* ---------- CONFIGURACIÓN DEL NEGOCIO (compartido) ---------- */
async function obtenerConfiguracion() {
  if (negocioConfigCache) return negocioConfigCache;
  const res = await fetch(`${API}/configuracion`);
  negocioConfigCache = await res.json();
  return negocioConfigCache;
}

/* ---------- CATEGORÍAS (compartido) ---------- */
async function obtenerCategorias() {
  const res = await fetch(`${API}/categorias`);
  categoriasCache = await res.json();
  return categoriasCache;
}

/* ---------- CAJA ---------- */
const inputFecha = $('#caja-fecha');
inputFecha.value = hoyISO();
inputFecha.addEventListener('change', cargarCaja);

async function cargarCaja() {
  const fecha = inputFecha.value || hoyISO();
  const res = await fetch(`${API}/caja/resumen?fecha=${fecha}`);
  const data = await res.json();

  $('#stat-total').textContent = money(data.total);
  $('#stat-ganancia').textContent = money(data.ganancia_total);
  $('#stat-cantidad').textContent = data.cantidad_ventas;
  $('#pago-efectivo').textContent = money(data.por_forma_pago.efectivo);
  $('#pago-tarjeta').textContent = money(data.por_forma_pago.tarjeta);
  $('#pago-transferencia').textContent = money(data.por_forma_pago.transferencia);

  const tbody = $('#tabla-caja');
  if (!data.ventas.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="vacio">Sin ventas registradas para este día.</td></tr>';
    return;
  }
  tbody.innerHTML = data.ventas.map((v) => {
    const detalle = v.items.map((it) => `${it.nombre_producto} (${textoModo(it)})`).join(', ');
    return `
      <tr>
        <td>${new Date(v.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
        <td>${detalle}</td>
        <td>${capitalizar(v.forma_pago)}</td>
        <td>${money(v.total)}</td>
        <td class="ganancia-positiva">${money(v.ganancia_total)}</td>
        <td><button class="btn-fila" data-accion="imprimir" data-id="${v.id}">🖨 Imprimir</button></td>
      </tr>
    `;
  }).join('');

  $$('[data-accion="imprimir"]', tbody).forEach((btn) => {
    btn.addEventListener('click', () => {
      const venta = data.ventas.find((v) => v.id === Number(btn.dataset.id));
      if (venta) imprimirTicket(venta);
    });
  });
}

function capitalizar(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function textoModo(it) {
  if (it.modo_venta === 'kg') return `${it.cantidad} kg`;
  if (it.modo_venta === 'g') return `${it.cantidad} g`;
  if (it.modo_venta === 'bolsa') return `${it.cantidad} bolsa${it.cantidad > 1 ? 's' : ''}`;
  return `${it.cantidad} u`;
}

/* ---------- NUEVA VENTA ---------- */
async function iniciarVistaVenta() {
  await Promise.all([obtenerCategorias(), cargarProductosCache(), obtenerConfiguracion()]);
  poblarListaVenta();
  carrito = [];
  renderCarrito();
  ultimaVentaConfirmada = null;
  $('#venta-codigo-barras').value = '';
  $('#venta-codigo-mensaje').textContent = '';
  $('#venta-codigo-barras').focus();
}

$('#venta-codigo-barras').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = e.target;
  const codigo = input.value.trim();
  const msg = $('#venta-codigo-mensaje');
  if (!codigo) return;

  const res = await fetch(`${API}/productos/codigo/${encodeURIComponent(codigo)}`);
  input.value = '';

  if (!res.ok) {
    msg.textContent = 'No se encontró ningún producto con ese código.';
    msg.className = 'ayuda mensaje error';
    input.focus();
    return;
  }
  const producto = await res.json();
  if (!productosCache.some((p) => p.id === producto.id)) productosCache.push(producto);

  $('#venta-buscar').value = '';
  poblarListaVenta();
  $('#venta-producto').value = String(producto.id);
  actualizarModosVenta();

  // Nunca se agrega solo: siempre se pide la cantidad, así el cajero puede
  // cargar más de una unidad sin tener que corregir el carrito después.
  const cantidadInput = $('#venta-cantidad');
  cantidadInput.value = producto.vende_por_peso && !producto.vende_por_bolsa && !producto.vende_por_unidad ? '' : '1';
  cantidadInput.focus();
  cantidadInput.select();
  actualizarPreview();

  msg.textContent = `${producto.nombre} — indicá la cantidad y presioná Enter para agregarlo.`;
  msg.className = 'ayuda mensaje ok';
});

async function cargarProductosCache() {
  const res = await fetch(`${API}/productos?activo=true`);
  productosCache = await res.json();
}

function poblarListaVenta(filtro = '') {
  const sel = $('#venta-producto');
  const texto = filtro.trim().toLowerCase();
  const lista = productosCache.filter((p) => p.nombre.toLowerCase().includes(texto));
  sel.innerHTML = lista.map((p) => `<option value="${p.id}">${p.nombre} — ${p.categoria_nombre}</option>`).join('')
    || '<option disabled>Sin resultados</option>';
  actualizarModosVenta();
}

$('#venta-buscar').addEventListener('input', (e) => poblarListaVenta(e.target.value));
$('#venta-producto').addEventListener('change', actualizarModosVenta);

function productoSeleccionado() {
  const id = Number($('#venta-producto').value);
  return productosCache.find((p) => p.id === id);
}

function actualizarModosVenta() {
  const p = productoSeleccionado();
  const sel = $('#venta-modo');
  if (!p) { sel.innerHTML = ''; $('#venta-preview').textContent = ''; return; }

  const opciones = [];
  if (p.vende_por_peso) opciones.push(`<option value="peso">Por peso (${money(p.precio_kg)}/kg)</option>`);
  if (p.vende_por_bolsa) opciones.push(`<option value="bolsa">Bolsa de ${Number(p.peso_bolsa_kg)}kg (${money(p.precio_bolsa)})</option>`);
  if (p.vende_por_unidad) opciones.push(`<option value="unidad">Unidad (${money(p.precio_unidad)})</option>`);
  sel.innerHTML = opciones.join('');
  actualizarUnidadPesoVisible();
  actualizarPreview();
}

$('#venta-modo').addEventListener('change', () => { actualizarUnidadPesoVisible(); actualizarPreview(); });
$('#venta-cantidad').addEventListener('input', actualizarPreview);

function actualizarUnidadPesoVisible() {
  const esPeso = $('#venta-modo').value === 'peso';
  $('#venta-unidad-peso').classList.toggle('oculto', !esPeso);
}

$$('#venta-unidad-peso .toggle-opcion').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#venta-unidad-peso .toggle-opcion').forEach((b) => b.classList.remove('activo'));
    btn.classList.add('activo');
    unidadPesoSeleccionada = btn.dataset.unidad;
    actualizarPreview();
  });
});

function calcularItemVenta() {
  const p = productoSeleccionado();
  const modoAlto = $('#venta-modo').value;
  const cantidad = Number($('#venta-cantidad').value);
  if (!p || !modoAlto || !(cantidad > 0)) return null;

  let modoVenta, precioUnitario, cantidadKgEquivalente = null, subtotal;
  if (modoAlto === 'peso') {
    modoVenta = unidadPesoSeleccionada;
    precioUnitario = Number(p.precio_kg);
    cantidadKgEquivalente = modoVenta === 'g' ? cantidad / 1000 : cantidad;
    subtotal = precioUnitario * cantidadKgEquivalente;
  } else if (modoAlto === 'bolsa') {
    modoVenta = 'bolsa';
    precioUnitario = Number(p.precio_bolsa);
    subtotal = precioUnitario * cantidad;
  } else {
    modoVenta = 'unidad';
    precioUnitario = Number(p.precio_unidad);
    subtotal = precioUnitario * cantidad;
  }

  return {
    producto_id: p.id,
    nombre: p.nombre,
    modo_venta: modoVenta,
    cantidad,
    precio_unitario: precioUnitario,
    subtotal: Number(subtotal.toFixed(2)),
  };
}

function actualizarPreview() {
  const item = calcularItemVenta();
  $('#venta-preview').textContent = item ? `Subtotal: ${money(item.subtotal)}` : '';
}

function agregarItemAlCarrito() {
  const item = calcularItemVenta();
  if (!item) {
    $('#venta-preview').textContent = 'Elegí producto, modalidad y una cantidad mayor a 0.';
    return false;
  }
  carrito.push(item);
  $('#venta-cantidad').value = '';
  $('#venta-preview').textContent = '';
  renderCarrito();
  return true;
}

$('#btn-agregar-item').addEventListener('click', agregarItemAlCarrito);

$('#venta-cantidad').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (agregarItemAlCarrito()) $('#venta-codigo-barras').focus();
});

function renderCarrito() {
  const tbody = $('#carrito-items');
  if (!carrito.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="vacio">Sin ítems todavía</td></tr>';
  } else {
    tbody.innerHTML = carrito.map((it, idx) => `
      <tr>
        <td>${it.nombre}</td>
        <td>${textoModo(it)}</td>
        <td>${money(it.precio_unitario)}${it.modo_venta === 'kg' || it.modo_venta === 'g' ? '/kg' : ''}</td>
        <td>${money(it.subtotal)}</td>
        <td><button class="btn-fila peligro" data-idx="${idx}">Quitar</button></td>
      </tr>
    `).join('');
    $$('[data-idx]', tbody).forEach((btn) => {
      btn.addEventListener('click', () => {
        carrito.splice(Number(btn.dataset.idx), 1);
        renderCarrito();
      });
    });
  }
  const total = carrito.reduce((acc, it) => acc + it.subtotal, 0);
  $('#carrito-total-valor').textContent = money(total);
  $('#btn-confirmar-venta').disabled = carrito.length === 0;
}

$$('#venta-forma-pago .toggle-opcion').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#venta-forma-pago .toggle-opcion').forEach((b) => b.classList.remove('activo'));
    btn.classList.add('activo');
    formaPagoSeleccionada = btn.dataset.pago;
  });
});

$('#btn-confirmar-venta').addEventListener('click', async (e) => {
  const msg = $('#venta-mensaje');
  const items = carrito.map(({ producto_id, modo_venta, cantidad }) => ({ producto_id, modo_venta, cantidad }));

  await conCarga(e.currentTarget, 'Registrando venta…', async () => {
    const res = await fetch(`${API}/ventas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forma_pago: formaPagoSeleccionada, items }),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || 'No se pudo registrar la venta.';
      msg.className = 'mensaje error';
      return;
    }
    msg.textContent = '';
    ultimaVentaConfirmada = data;
    carrito = [];
    renderCarrito();
    mostrarModalVentaExito(data);
  });
});

function mostrarModalVentaExito(venta) {
  $('#ve-numero').textContent = String(venta.id).padStart(6, '0');
  $('#ve-total').textContent = money(venta.total);
  $('#ve-ganancia').textContent = money(venta.ganancia_total);
  $('#modal-venta-exito').classList.remove('oculto');
}

function cerrarModalVentaExito() {
  $('#modal-venta-exito').classList.add('oculto');
  $('#venta-codigo-barras').focus();
}

$('#ve-btn-imprimir').addEventListener('click', () => {
  cerrarModalVentaExito();
  if (ultimaVentaConfirmada) imprimirTicket(ultimaVentaConfirmada);
});
$('#ve-btn-cerrar').addEventListener('click', cerrarModalVentaExito);

/* ---------- TICKET DE IMPRESIÓN (80mm) ---------- */
async function imprimirTicket(venta) {
  const negocio = await obtenerConfiguracion();

  $('#tk-nombre').textContent = negocio.nombre;
  $('#tk-direccion').textContent = negocio.direccion || '';
  $('#tk-direccion').classList.toggle('oculto', !negocio.direccion);
  $('#tk-telefono').textContent = negocio.telefono ? `Tel: ${negocio.telefono}` : '';
  $('#tk-telefono').classList.toggle('oculto', !negocio.telefono);

  $('#tk-numero').textContent = String(venta.id).padStart(6, '0');
  $('#tk-fecha').textContent = new Date(venta.creado_en).toLocaleString('es-AR');

  $('#tk-items').innerHTML = venta.items.map((it) => `
    <tr>
      <td>${it.cantidad}${it.modo_venta === 'g' ? 'g' : it.modo_venta === 'kg' ? 'kg' : ''}</td>
      <td>${it.nombre_producto}</td>
      <td>${money(it.subtotal)}</td>
    </tr>
  `).join('');

  $('#tk-total').textContent = money(venta.total);
  $('#tk-forma-pago').textContent = capitalizar(venta.forma_pago);
  $('#tk-mensaje-pie').textContent = negocio.mensaje_pie || '';

  window.print();
}

/* ---------- PRODUCTOS ---------- */
async function cargarProductos() {
  await obtenerCategorias();
  renderFiltrosCategoriaProductos();

  const params = new URLSearchParams({ activo: 'true' });
  if (filtroCategoriaProductos) params.set('categoria_id', filtroCategoriaProductos);
  const res = await fetch(`${API}/productos?${params.toString()}`);
  productosCache = await res.json();
  renderTablaProductos();
}

function renderFiltrosCategoriaProductos() {
  const wrap = $('#filtros-categoria-productos');
  const botones = ['<button class="filtro-categoria' + (filtroCategoriaProductos === '' ? ' activo' : '') + '" data-cat="">Todas</button>']
    .concat(categoriasCache.filter((c) => c.activa).map((c) => `
      <button class="filtro-categoria${filtroCategoriaProductos === String(c.id) ? ' activo' : ''}" data-cat="${c.id}">${c.nombre}</button>
    `));
  wrap.innerHTML = botones.join('');
  $$('.filtro-categoria', wrap).forEach((btn) => {
    btn.addEventListener('click', () => {
      filtroCategoriaProductos = btn.dataset.cat;
      cargarProductos();
    });
  });
}

function precioTexto(p) {
  const partes = [];
  if (p.vende_por_peso) partes.push(`${money(p.precio_kg)}/kg`);
  if (p.vende_por_bolsa) partes.push(`${money(p.precio_bolsa)}/bolsa (${Number(p.peso_bolsa_kg)}kg)`);
  if (p.vende_por_unidad) partes.push(`${money(p.precio_unidad)}/u`);
  return partes.join(' · ');
}

function gananciaTexto(p) {
  const partes = [];
  if (p.vende_por_peso) partes.push(`${money(Number(p.precio_kg) - Number(p.costo_kg))}/kg`);
  if (p.vende_por_bolsa) partes.push(`${money(Number(p.precio_bolsa) - Number(p.costo_bolsa))}/bolsa`);
  if (p.vende_por_unidad) partes.push(`${money(Number(p.precio_unidad) - Number(p.costo_unidad))}/u`);
  return partes.join(' · ');
}

function renderTablaProductos() {
  const tbody = $('#tabla-productos');
  if (!productosCache.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="vacio">No hay productos que coincidan.</td></tr>';
    return;
  }
  tbody.innerHTML = productosCache.map((p) => `
    <tr>
      <td>${p.nombre}</td>
      <td>${p.categoria_nombre}</td>
      <td>${precioTexto(p)}</td>
      <td class="ganancia-positiva">${gananciaTexto(p)}</td>
      <td>
        <button class="btn-fila" data-accion="editar" data-id="${p.id}">Editar</button>
        <button class="btn-fila peligro" data-accion="baja" data-id="${p.id}">Dar de baja</button>
      </td>
    </tr>
  `).join('');

  $$('[data-accion="editar"]', tbody).forEach((btn) => {
    btn.addEventListener('click', () => abrirModalProducto(Number(btn.dataset.id)));
  });
  $$('[data-accion="baja"]', tbody).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmarAccion(
        'El producto deja de estar disponible para nuevas ventas. Vas a poder reactivarlo cuando quieras.',
        { titulo: 'Dar de baja producto', textoConfirmar: 'Dar de baja', peligro: true }
      );
      if (!ok) return;
      await fetch(`${API}/productos/${btn.dataset.id}`, { method: 'DELETE' });
      cargarProductos();
    });
  });
}

/* ---------- MODAL PRODUCTO ---------- */
const modal = $('#modal-producto');

$('#btn-nuevo-producto').addEventListener('click', async () => {
  await abrirModalProducto(null);
});

$('#cerrar-modal').addEventListener('click', () => modal.classList.add('oculto'));

async function poblarSelectCategoriasModal(seleccionarId) {
  await obtenerCategorias();
  const sel = $('#np-categoria');
  sel.innerHTML = categoriasCache.filter((c) => c.activa).map((c) => `<option value="${c.id}">${c.nombre}</option>`).join('');
  if (seleccionarId) sel.value = seleccionarId;
}

async function poblarSelectProveedoresModal(seleccionarId) {
  await obtenerProveedores();
  const sel = $('#np-proveedor');
  sel.innerHTML = '<option value="">Sin proveedor</option>' +
    proveedoresCache.filter((p) => p.activo).map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('');
  sel.value = seleccionarId || '';
}

function poblarListaMarcasDatalist() {
  const marcas = [...new Set(productosCache.map((p) => p.marca).filter(Boolean))].sort();
  $('#lista-marcas').innerHTML = marcas.map((m) => `<option value="${m}"></option>`).join('');
}

async function abrirModalProducto(id) {
  productoEditandoId = id;
  limpiarFormularioProducto();
  await Promise.all([poblarSelectCategoriasModal(), poblarSelectProveedoresModal()]);
  poblarListaMarcasDatalist();

  if (id) {
    const p = productosCache.find((x) => x.id === id) || await (await fetch(`${API}/productos/${id}`)).json();
    $('#modal-producto-titulo').textContent = 'Editar producto';
    $('#np-nombre').value = p.nombre;
    $('#np-categoria').value = p.categoria_id;
    $('#np-codigo-barras').value = p.codigo_barras || '';
    $('#np-proveedor').value = p.proveedor_id || '';
    $('#np-marca').value = p.marca || '';

    $('#np-vende-peso').checked = p.vende_por_peso;
    $('#np-costo-kg').value = p.costo_kg ?? '';
    $('#np-margen-kg').value = p.margen_kg ?? 35;
    $('#np-precio-kg').value = p.precio_kg ?? '';

    $('#np-vende-bolsa').checked = p.vende_por_bolsa;
    $('#np-peso-bolsa').value = p.peso_bolsa_kg ?? '';
    $('#np-costo-bolsa').value = p.costo_bolsa ?? '';
    $('#np-margen-bolsa').value = p.margen_bolsa ?? 35;
    $('#np-precio-bolsa').value = p.precio_bolsa ?? '';

    $('#np-vende-unidad').checked = p.vende_por_unidad;
    $('#np-costo-unidad').value = p.costo_unidad ?? '';
    $('#np-margen-unidad').value = p.margen_unidad ?? 35;
    $('#np-precio-unidad').value = p.precio_unidad ?? '';

    actualizarBloquesModalidad();
  } else {
    $('#modal-producto-titulo').textContent = 'Nuevo producto';
  }

  modal.classList.remove('oculto');
}

function limpiarFormularioProducto() {
  $$('#modal-producto input[type="text"], #modal-producto input[type="number"]').forEach((i) => { i.value = ''; });
  $$('#modal-producto input[type="checkbox"]').forEach((i) => { i.checked = false; });
  $('#np-margen-kg').value = 35;
  $('#np-margen-bolsa').value = 35;
  $('#np-margen-unidad').value = 35;
  $('#np-mensaje').textContent = '';
  actualizarBloquesModalidad();
}

function actualizarBloquesModalidad() {
  $('#np-campos-peso').classList.toggle('oculto', !$('#np-vende-peso').checked);
  $('#np-campos-bolsa').classList.toggle('oculto', !$('#np-vende-bolsa').checked);
  $('#np-campos-unidad').classList.toggle('oculto', !$('#np-vende-unidad').checked);
}
['#np-vende-peso', '#np-vende-bolsa', '#np-vende-unidad'].forEach((sel) => {
  $(sel).addEventListener('change', actualizarBloquesModalidad);
});

function autocalcularPrecio(costoSel, margenSel, precioSel) {
  const recalcular = () => {
    const costo = Number($(costoSel).value);
    const margen = Number($(margenSel).value);
    if (costo >= 0 && margen >= 0 && $(costoSel).value !== '' && $(margenSel).value !== '') {
      $(precioSel).value = (costo * (1 + margen / 100)).toFixed(2);
    }
  };
  $(costoSel).addEventListener('input', recalcular);
  $(margenSel).addEventListener('input', recalcular);
}
autocalcularPrecio('#np-costo-kg', '#np-margen-kg', '#np-precio-kg');
autocalcularPrecio('#np-costo-bolsa', '#np-margen-bolsa', '#np-precio-bolsa');
autocalcularPrecio('#np-costo-unidad', '#np-margen-unidad', '#np-precio-unidad');

$('#btn-guardar-producto').addEventListener('click', async (e) => {
  const vendePeso = $('#np-vende-peso').checked;
  const vendeBolsa = $('#np-vende-bolsa').checked;
  const vendeUnidad = $('#np-vende-unidad').checked;

  const numOrNull = (sel) => ($(sel).value === '' ? null : Number($(sel).value));

  const body = {
    nombre: $('#np-nombre').value.trim(),
    categoria_id: Number($('#np-categoria').value),
    codigo_barras: $('#np-codigo-barras').value.trim() || null,
    proveedor_id: $('#np-proveedor').value ? Number($('#np-proveedor').value) : null,
    marca: $('#np-marca').value.trim() || null,

    vende_por_peso: vendePeso,
    costo_kg: vendePeso ? numOrNull('#np-costo-kg') : null,
    margen_kg: vendePeso ? numOrNull('#np-margen-kg') : 35,
    precio_kg: vendePeso ? numOrNull('#np-precio-kg') : null,

    vende_por_bolsa: vendeBolsa,
    peso_bolsa_kg: vendeBolsa ? numOrNull('#np-peso-bolsa') : null,
    costo_bolsa: vendeBolsa ? numOrNull('#np-costo-bolsa') : null,
    margen_bolsa: vendeBolsa ? numOrNull('#np-margen-bolsa') : 35,
    precio_bolsa: vendeBolsa ? numOrNull('#np-precio-bolsa') : null,

    vende_por_unidad: vendeUnidad,
    costo_unidad: vendeUnidad ? numOrNull('#np-costo-unidad') : null,
    margen_unidad: vendeUnidad ? numOrNull('#np-margen-unidad') : 35,
    precio_unidad: vendeUnidad ? numOrNull('#np-precio-unidad') : null,
  };

  const msg = $('#np-mensaje');
  const url = productoEditandoId ? `${API}/productos/${productoEditandoId}` : `${API}/productos`;
  const method = productoEditandoId ? 'PUT' : 'POST';

  await conCarga(e.currentTarget, 'Guardando…', async () => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      msg.textContent = (data.errores || [data.error]).join(' ');
      msg.className = 'mensaje error';
      return;
    }
    msg.textContent = 'Producto guardado.';
    msg.className = 'mensaje ok';
    setTimeout(() => modal.classList.add('oculto'), 500);
    cargarProductos();
  });
});

/* ---------- ACTUALIZAR PRECIOS ---------- */
let preciosProductosCache = [];
let preciosAmbito = 'todos';
let preciosMetodo = 'porcentaje';
let preciosTipoPorcentaje = 'aumento';
let preciosTipoMonto = 'aumento';
let preciosSeleccionados = new Set();
let preciosUltimaConsulta = null;

async function iniciarVistaPrecios() {
  await Promise.all([obtenerCategorias(), obtenerProveedores()]);
  const res = await fetch(`${API}/productos?activo=true`);
  preciosProductosCache = await res.json();

  $('#precios-categoria').innerHTML = categoriasCache.filter((c) => c.activa)
    .map((c) => `<option value="${c.id}">${c.nombre}</option>`).join('');

  const proveedoresActivos = proveedoresCache.filter((p) => p.activo);
  $('#precios-proveedor').innerHTML = proveedoresActivos.length
    ? proveedoresActivos.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('')
    : '<option disabled>No hay proveedores cargados</option>';

  const marcas = [...new Set(preciosProductosCache.map((p) => p.marca).filter(Boolean))].sort();
  $('#precios-marca').innerHTML = marcas.length
    ? marcas.map((m) => `<option value="${m}">${m}</option>`).join('')
    : '<option disabled>No hay marcas cargadas</option>';

  preciosSeleccionados = new Set();
  renderListaPreciosSeleccion();
  $('#precios-resultado-wrap').classList.add('oculto');
  $('#precios-mensaje').textContent = '';
  preciosUltimaConsulta = null;
  actualizarDisponibilidadManual();
}

function renderListaPreciosSeleccion(filtro = '') {
  const texto = filtro.trim().toLowerCase();
  const lista = preciosProductosCache.filter((p) => p.nombre.toLowerCase().includes(texto));
  const cont = $('#precios-lista-productos');
  cont.innerHTML = lista.length
    ? lista.map((p) => `
      <label class="item-seleccionable ${preciosSeleccionados.has(p.id) ? 'seleccionado' : ''}">
        <input type="checkbox" class="precios-chk-producto" value="${p.id}" ${preciosSeleccionados.has(p.id) ? 'checked' : ''} />
        <span class="item-seleccionable-check"></span>
        <span class="item-seleccionable-info">
          <span class="item-seleccionable-nombre">${p.nombre}</span>
          <span class="item-seleccionable-categoria">${p.categoria_nombre}</span>
        </span>
      </label>
    `).join('')
    : '<p class="ayuda">Sin resultados.</p>';

  $$('.precios-chk-producto', cont).forEach((chk) => {
    chk.addEventListener('change', () => {
      const id = Number(chk.value);
      if (chk.checked) preciosSeleccionados.add(id); else preciosSeleccionados.delete(id);
      chk.closest('.item-seleccionable').classList.toggle('seleccionado', chk.checked);
      actualizarContadorPreciosSeleccion();
      actualizarDisponibilidadManual();
    });
  });
  actualizarContadorPreciosSeleccion();
}
function actualizarContadorPreciosSeleccion() {
  $('#precios-contador-seleccion').textContent = preciosSeleccionados.size;
}
$('#precios-producto-buscar').addEventListener('input', (e) => renderListaPreciosSeleccion(e.target.value));
$('#precios-vaciar-seleccion').addEventListener('click', () => {
  preciosSeleccionados.clear();
  renderListaPreciosSeleccion($('#precios-producto-buscar').value);
  actualizarDisponibilidadManual();
});

$$('#precios-ambito .toggle-opcion').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#precios-ambito .toggle-opcion').forEach((b) => b.classList.remove('activo'));
    btn.classList.add('activo');
    preciosAmbito = btn.dataset.ambito;
    $('#precios-selector-categoria').classList.toggle('oculto', preciosAmbito !== 'categoria');
    $('#precios-selector-proveedor').classList.toggle('oculto', preciosAmbito !== 'proveedor');
    $('#precios-selector-marca').classList.toggle('oculto', preciosAmbito !== 'marca');
    $('#precios-selector-seleccion').classList.toggle('oculto', preciosAmbito !== 'seleccion');
    actualizarDisponibilidadManual();
  });
});

$$('.precios-modalidad').forEach((chk) => chk.addEventListener('change', actualizarDisponibilidadManual));

function modalidadesPreciosSeleccionadas() {
  return [...$$('.precios-modalidad:checked')].map((c) => c.value);
}

function actualizarDisponibilidadManual() {
  const permiteManual = preciosAmbito === 'seleccion' && preciosSeleccionados.size === 1 && modalidadesPreciosSeleccionadas().length === 1;
  $('#precios-opcion-manual').disabled = !permiteManual;
  if (!permiteManual && preciosMetodo === 'manual') {
    $('#precios-metodo .toggle-opcion[data-metodo="porcentaje"]').click();
  }
}

$$('#precios-metodo .toggle-opcion').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    $$('#precios-metodo .toggle-opcion').forEach((b) => b.classList.remove('activo'));
    btn.classList.add('activo');
    preciosMetodo = btn.dataset.metodo;
    $('#precios-campos-porcentaje').classList.toggle('oculto', preciosMetodo !== 'porcentaje');
    $('#precios-campos-monto').classList.toggle('oculto', preciosMetodo !== 'monto_fijo');
    $('#precios-campos-manual').classList.toggle('oculto', preciosMetodo !== 'manual');
    $('#precios-campos-costo-margen').classList.toggle('oculto', preciosMetodo !== 'costo_margen');
  });
});

$$('#precios-tipo-porcentaje .toggle-opcion').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#precios-tipo-porcentaje .toggle-opcion').forEach((b) => b.classList.remove('activo'));
    btn.classList.add('activo');
    preciosTipoPorcentaje = btn.dataset.tipo;
  });
});
$$('#precios-tipo-monto .toggle-opcion').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#precios-tipo-monto .toggle-opcion').forEach((b) => b.classList.remove('activo'));
    btn.classList.add('activo');
    preciosTipoMonto = btn.dataset.tipo;
  });
});

function armarConsultaPrecios() {
  const modalidades = modalidadesPreciosSeleccionadas();
  const body = { ambito: preciosAmbito, modalidades, metodo: preciosMetodo };

  if (preciosAmbito === 'categoria') body.categoria_id = Number($('#precios-categoria').value);
  if (preciosAmbito === 'proveedor') body.proveedor_id = Number($('#precios-proveedor').value);
  if (preciosAmbito === 'marca') body.marca = $('#precios-marca').value;
  if (preciosAmbito === 'seleccion') body.producto_ids = [...preciosSeleccionados];

  if (preciosMetodo === 'porcentaje') {
    body.tipo = preciosTipoPorcentaje;
    body.porcentaje = Number($('#precios-porcentaje').value);
  } else if (preciosMetodo === 'monto_fijo') {
    body.tipo = preciosTipoMonto;
    body.monto = Number($('#precios-monto').value);
  } else if (preciosMetodo === 'manual') {
    body.precio_manual = Number($('#precios-manual-valor').value);
  }
  return body;
}

$('#btn-previsualizar-precios').addEventListener('click', async (e) => {
  const msg = $('#precios-mensaje');
  msg.textContent = '';
  $('#precios-resultado-wrap').classList.add('oculto');

  const body = armarConsultaPrecios();
  if (!body.modalidades.length) {
    msg.textContent = 'Tildá al menos un tipo de precio (kg, bolsa o unidad).';
    msg.className = 'mensaje error';
    return;
  }
  if (body.ambito === 'seleccion' && !body.producto_ids.length) {
    msg.textContent = 'Tildá al menos un producto de la lista.';
    msg.className = 'mensaje error';
    return;
  }

  await conCarga(e.currentTarget, 'Calculando…', async () => {
    const res = await fetch(`${API}/productos/actualizar-precios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, confirmar: false }),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || 'No se pudo calcular la previsualización.';
      msg.className = 'mensaje error';
      return;
    }
    preciosUltimaConsulta = body;

    if (!data.items.length) {
      msg.textContent = 'No hay productos que coincidan con estos filtros.';
      msg.className = 'mensaje error';
      return;
    }

    $('#tabla-precios-preview').innerHTML = data.items.map((it) => `
      <tr>
        <td>${it.nombre}</td>
        <td>${it.etiqueta}</td>
        <td>${money(it.precio_anterior)}</td>
        <td class="ganancia-positiva">${money(it.precio_nuevo)}</td>
      </tr>
    `).join('');
    msg.textContent = `${data.cantidad_productos} producto(s) van a cambiar de precio.`
      + (data.omitidos ? ` (${data.omitidos} se omitieron por no tener costo cargado.)` : '');
    msg.className = 'mensaje ok';
    $('#precios-resultado-wrap').classList.remove('oculto');
  });
});

$('#btn-aplicar-precios').addEventListener('click', async (e) => {
  if (!preciosUltimaConsulta) return;
  const ok = await confirmarAccion(
    'Los precios de la vista previa se van a actualizar ahora mismo. Esta acción no se puede deshacer automáticamente.',
    { titulo: 'Aplicar cambios de precio', textoConfirmar: 'Sí, aplicar cambios' }
  );
  if (!ok) return;

  const msg = $('#precios-mensaje');
  mostrarCargaGrande('Actualizando precios…');

  const res = await fetch(`${API}/productos/actualizar-precios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...preciosUltimaConsulta, confirmar: true }),
  });
  const data = await res.json();
  if (!res.ok) {
    cerrarCargaGrande();
    msg.textContent = data.error || 'No se pudieron aplicar los cambios.';
    msg.className = 'mensaje error';
    return;
  }
  $('#precios-resultado-wrap').classList.add('oculto');
  preciosUltimaConsulta = null;
  await iniciarVistaPrecios();
  mostrarExitoCargaGrande(`Se actualizaron ${data.cantidad_productos} producto(s) correctamente.`);
});

/* ---------- ETIQUETAS DE PRECIO ---------- */
let etiquetasProductosCache = [];
let etiquetasAmbito = 'todos';
let etiquetasSeleccionados = new Set();

async function iniciarVistaEtiquetas() {
  await Promise.all([obtenerCategorias(), obtenerProveedores()]);
  const res = await fetch(`${API}/productos?activo=true`);
  etiquetasProductosCache = await res.json();

  $('#etiquetas-categoria').innerHTML = categoriasCache.filter((c) => c.activa)
    .map((c) => `<option value="${c.id}">${c.nombre}</option>`).join('');

  const proveedoresActivos = proveedoresCache.filter((p) => p.activo);
  $('#etiquetas-proveedor').innerHTML = proveedoresActivos.length
    ? proveedoresActivos.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('')
    : '<option disabled>No hay proveedores cargados</option>';

  const marcas = [...new Set(etiquetasProductosCache.map((p) => p.marca).filter(Boolean))].sort();
  $('#etiquetas-marca').innerHTML = marcas.length
    ? marcas.map((m) => `<option value="${m}">${m}</option>`).join('')
    : '<option disabled>No hay marcas cargadas</option>';

  etiquetasSeleccionados = new Set();
  renderListaEtiquetasSeleccion();
  actualizarLinkEtiquetas();
  $('#etiquetas-mensaje').textContent = '';
}

$$('#etiquetas-ambito .toggle-opcion').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#etiquetas-ambito .toggle-opcion').forEach((b) => b.classList.remove('activo'));
    btn.classList.add('activo');
    etiquetasAmbito = btn.dataset.ambito;
    $('#etiquetas-selector-categoria').classList.toggle('oculto', etiquetasAmbito !== 'categoria');
    $('#etiquetas-selector-proveedor').classList.toggle('oculto', etiquetasAmbito !== 'proveedor');
    $('#etiquetas-selector-marca').classList.toggle('oculto', etiquetasAmbito !== 'marca');
    $('#etiquetas-selector-seleccion').classList.toggle('oculto', etiquetasAmbito !== 'seleccion');
    actualizarLinkEtiquetas();
  });
});

function renderListaEtiquetasSeleccion(filtro = '') {
  const texto = filtro.trim().toLowerCase();
  const lista = etiquetasProductosCache.filter((p) => p.nombre.toLowerCase().includes(texto));
  const cont = $('#etiquetas-lista-productos');
  cont.innerHTML = lista.length
    ? lista.map((p) => `
      <label class="item-seleccionable ${etiquetasSeleccionados.has(p.id) ? 'seleccionado' : ''}">
        <input type="checkbox" class="etiquetas-chk-producto" value="${p.id}" ${etiquetasSeleccionados.has(p.id) ? 'checked' : ''} />
        <span class="item-seleccionable-check"></span>
        <span class="item-seleccionable-info">
          <span class="item-seleccionable-nombre">${p.nombre}</span>
          <span class="item-seleccionable-categoria">${p.categoria_nombre}</span>
        </span>
      </label>
    `).join('')
    : '<p class="ayuda">Sin resultados.</p>';

  $$('.etiquetas-chk-producto', cont).forEach((chk) => {
    chk.addEventListener('change', () => {
      const id = Number(chk.value);
      if (chk.checked) etiquetasSeleccionados.add(id); else etiquetasSeleccionados.delete(id);
      chk.closest('.item-seleccionable').classList.toggle('seleccionado', chk.checked);
      actualizarContadorEtiquetasSeleccion();
      actualizarLinkEtiquetas();
    });
  });
  actualizarContadorEtiquetasSeleccion();
}
function actualizarContadorEtiquetasSeleccion() {
  $('#etiquetas-contador-seleccion').textContent = etiquetasSeleccionados.size;
}
$('#etiquetas-buscar').addEventListener('input', (e) => renderListaEtiquetasSeleccion(e.target.value));
$('#etiquetas-vaciar-seleccion').addEventListener('click', () => {
  etiquetasSeleccionados.clear();
  renderListaEtiquetasSeleccion($('#etiquetas-buscar').value);
  actualizarLinkEtiquetas();
});
$('#etiquetas-categoria').addEventListener('change', actualizarLinkEtiquetas);
$('#etiquetas-proveedor').addEventListener('change', actualizarLinkEtiquetas);
$('#etiquetas-marca').addEventListener('change', actualizarLinkEtiquetas);

function actualizarLinkEtiquetas() {
  const params = new URLSearchParams({ ambito: etiquetasAmbito });
  if (etiquetasAmbito === 'categoria') params.set('categoria_id', $('#etiquetas-categoria').value || '');
  if (etiquetasAmbito === 'proveedor') params.set('proveedor_id', $('#etiquetas-proveedor').value || '');
  if (etiquetasAmbito === 'marca') params.set('marca', $('#etiquetas-marca').value || '');
  if (etiquetasAmbito === 'seleccion') params.set('ids', [...etiquetasSeleccionados].join(','));
  $('#btn-descargar-etiquetas').href = `${API}/etiquetas/pdf?${params.toString()}`;
}

$('#btn-descargar-etiquetas').addEventListener('click', (e) => {
  const msg = $('#etiquetas-mensaje');
  if (etiquetasAmbito === 'seleccion' && !etiquetasSeleccionados.size) {
    e.preventDefault();
    msg.textContent = 'Tildá al menos un producto de la lista.';
    msg.className = 'mensaje error';
    return;
  }
  msg.textContent = '';
  actualizarLinkEtiquetas();
});

/* ---------- PROVEEDORES ---------- */
async function cargarProveedores() {
  await obtenerProveedores();
  const tbody = $('#tabla-proveedores');
  if (!proveedoresCache.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="vacio">No hay proveedores.</td></tr>';
    return;
  }
  tbody.innerHTML = proveedoresCache.map((p) => `
    <tr>
      <td>${p.nombre}</td>
      <td>${p.contacto || '—'}</td>
      <td>${p.telefono || '—'}</td>
      <td>${p.activo ? 'Activo' : 'Inactivo'}</td>
      <td>
        <button class="btn-fila" data-accion="editar" data-id="${p.id}">Editar</button>
        <button class="btn-fila ${p.activo ? 'peligro' : ''}" data-accion="toggle" data-id="${p.id}">${p.activo ? 'Desactivar' : 'Activar'}</button>
      </td>
    </tr>
  `).join('');

  $$('[data-accion="editar"]', tbody).forEach((btn) => {
    btn.addEventListener('click', () => abrirModalProveedor(Number(btn.dataset.id)));
  });
  $$('[data-accion="toggle"]', tbody).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const p = proveedoresCache.find((x) => x.id === Number(btn.dataset.id));
      await fetch(`${API}/proveedores/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !p.activo }),
      });
      cargarProveedores();
    });
  });
}

const modalProveedor = $('#modal-proveedor');
$('#btn-nuevo-proveedor').addEventListener('click', () => abrirModalProveedor(null));
$('#cerrar-modal-proveedor').addEventListener('click', () => modalProveedor.classList.add('oculto'));

function abrirModalProveedor(id) {
  proveedorEditandoId = id;
  $('#pv-mensaje').textContent = '';
  const p = id ? proveedoresCache.find((x) => x.id === id) : null;

  $('#modal-proveedor-titulo').textContent = p ? 'Editar proveedor' : 'Nuevo proveedor';
  $('#pv-nombre').value = p ? p.nombre : '';
  $('#pv-contacto').value = p ? (p.contacto || '') : '';
  $('#pv-telefono').value = p ? (p.telefono || '') : '';
  $('#pv-email').value = p ? (p.email || '') : '';
  $('#pv-notas').value = p ? (p.notas || '') : '';
  $('#pv-activo').checked = p ? p.activo : true;

  modalProveedor.classList.remove('oculto');
}

$('#btn-guardar-proveedor').addEventListener('click', async (e) => {
  const msg = $('#pv-mensaje');
  const body = {
    nombre: $('#pv-nombre').value.trim(),
    contacto: $('#pv-contacto').value.trim(),
    telefono: $('#pv-telefono').value.trim(),
    email: $('#pv-email').value.trim(),
    notas: $('#pv-notas').value.trim(),
    activo: $('#pv-activo').checked,
  };

  const url = proveedorEditandoId ? `${API}/proveedores/${proveedorEditandoId}` : `${API}/proveedores`;
  const method = proveedorEditandoId ? 'PUT' : 'POST';

  await conCarga(e.currentTarget, 'Guardando…', async () => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || 'No se pudo guardar el proveedor.';
      msg.className = 'mensaje error';
      return;
    }
    msg.textContent = 'Proveedor guardado.';
    msg.className = 'mensaje ok';
    setTimeout(() => modalProveedor.classList.add('oculto'), 500);
    cargarProveedores();
  });
});

/* ---------- CATEGORÍAS ---------- */
async function cargarCategoriasVista() {
  await obtenerCategorias();
  const tbody = $('#tabla-categorias');
  if (!categoriasCache.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="vacio">No hay categorías.</td></tr>';
    return;
  }
  tbody.innerHTML = categoriasCache.map((c) => `
    <tr>
      <td>${c.nombre}</td>
      <td>${c.activa ? 'Activa' : 'Inactiva'}</td>
      <td>
        <button class="btn-fila" data-accion="editar" data-id="${c.id}">Editar</button>
        <button class="btn-fila ${c.activa ? 'peligro' : ''}" data-accion="toggle" data-id="${c.id}">${c.activa ? 'Desactivar' : 'Activar'}</button>
      </td>
    </tr>
  `).join('');

  $$('[data-accion="editar"]', tbody).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const c = categoriasCache.find((x) => x.id === Number(btn.dataset.id));
      const nuevoNombre = prompt('Nuevo nombre de la categoría:', c.nombre);
      if (!nuevoNombre || !nuevoNombre.trim()) return;
      await fetch(`${API}/categorias/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoNombre.trim(), activa: c.activa }),
      });
      cargarCategoriasVista();
    });
  });
  $$('[data-accion="toggle"]', tbody).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const c = categoriasCache.find((x) => x.id === Number(btn.dataset.id));
      await fetch(`${API}/categorias/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: c.nombre, activa: !c.activa }),
      });
      cargarCategoriasVista();
    });
  });
}
// La navegación llama a cargarCategorias(); la redirigimos a la versión de vista.
function cargarCategorias() { return cargarCategoriasVista(); }

$('#btn-nueva-categoria').addEventListener('click', async (e) => {
  const input = $('#nueva-categoria-nombre');
  const nombre = input.value.trim();
  if (!nombre) return;
  await conCarga(e.currentTarget, 'Agregando…', async () => {
    const res = await fetch(`${API}/categorias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    });
    if (res.ok) {
      input.value = '';
      cargarCategoriasVista();
    }
  });
});

/* ---------- ESTADÍSTICAS ---------- */
function primerDiaDelMes(mesInput) {
  const [y, m] = mesInput.split('-');
  return `${y}-${m}-01`;
}
function ultimoDiaDelMes(mesInput) {
  const [y, m] = mesInput.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

function iniciarVistaEstadisticas() {
  if (!$('#est-desde').value) $('#est-desde').value = hoyISO();
  if (!$('#est-hasta').value) $('#est-hasta').value = hoyISO();
  if (!$('#est-mes').value) $('#est-mes').value = hoyISO().slice(0, 7);
  verEstadisticas();
}

$$('#estadisticas-modo-rango .toggle-opcion').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#estadisticas-modo-rango .toggle-opcion').forEach((b) => b.classList.remove('activo'));
    btn.classList.add('activo');
    estadisticasModo = btn.dataset.modo;
    $('#estadisticas-filtro-rango').classList.toggle('oculto', estadisticasModo !== 'rango');
    $('#estadisticas-filtro-mes').classList.toggle('oculto', estadisticasModo !== 'mes');
  });
});

function rangoEstadisticasActual() {
  if (estadisticasModo === 'mes') {
    const mes = $('#est-mes').value || hoyISO().slice(0, 7);
    return { desde: primerDiaDelMes(mes), hasta: ultimoDiaDelMes(mes) };
  }
  return {
    desde: $('#est-desde').value || hoyISO(),
    hasta: $('#est-hasta').value || hoyISO(),
  };
}

function actualizarLinkPDF() {
  const { desde, hasta } = rangoEstadisticasActual();
  $('#btn-descargar-pdf').href = `${API}/estadisticas/reporte.pdf?desde=${desde}&hasta=${hasta}`;
}

$('#btn-ver-estadisticas').addEventListener('click', verEstadisticas);

async function verEstadisticas() {
  const { desde, hasta } = rangoEstadisticasActual();
  actualizarLinkPDF();

  const res = await fetch(`${API}/estadisticas/resumen?desde=${desde}&hasta=${hasta}`);
  const data = await res.json();

  $('#est-stat-total').textContent = money(data.total);
  $('#est-stat-ganancia').textContent = money(data.ganancia_total);
  $('#est-stat-cantidad').textContent = data.cantidad_ventas;
  $('#est-stat-promedio').textContent = money(data.ticket_promedio);

  renderGraficoBarras(data.por_dia);

  const tFormaPago = $('#est-tabla-forma-pago');
  tFormaPago.innerHTML = data.por_forma_pago.length
    ? data.por_forma_pago.map((f) => `<tr><td>${capitalizar(f.forma_pago)}</td><td>${f.cantidad}</td><td>${money(f.total)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="vacio">Sin ventas en este período.</td></tr>';

  const tCategoria = $('#est-tabla-categoria');
  tCategoria.innerHTML = data.por_categoria.length
    ? data.por_categoria.map((c) => `<tr><td>${c.categoria}</td><td>${c.cantidad}</td><td>${money(c.total)}</td><td class="ganancia-positiva">${money(c.ganancia)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="vacio">Sin ventas en este período.</td></tr>';

  const tProductos = $('#est-tabla-productos');
  tProductos.innerHTML = data.top_productos.length
    ? data.top_productos.map((p) => `<tr><td>${p.nombre_producto}</td><td>${p.cantidad_ventas}</td><td>${money(p.total)}</td><td class="ganancia-positiva">${money(p.ganancia)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="vacio">Sin ventas en este período.</td></tr>';
}

function renderGraficoBarras(porDia) {
  const cont = $('#est-grafico-barras');
  if (!porDia.length) {
    cont.innerHTML = '<p class="grafico-vacio">Sin ventas en este período.</p>';
    return;
  }
  const max = Math.max(...porDia.map((d) => d.total), 1);
  cont.innerHTML = porDia.map((d) => {
    const alturaPorcentaje = Math.max((d.total / max) * 100, 2);
    const [, m, dd] = d.fecha.split('-');
    return `
      <div class="grafico-barra-col" title="${d.fecha}: ${money(d.total)}">
        <span class="grafico-barra-valor">${d.total > 0 ? money(d.total) : ''}</span>
        <div class="grafico-barra" style="height:${alturaPorcentaje}%"></div>
        <span class="grafico-barra-fecha">${dd}/${m}</span>
      </div>
    `;
  }).join('');
}

/* ---------- AJUSTES ---------- */
async function cargarAjustes() {
  negocioConfigCache = null;
  const config = await obtenerConfiguracion();
  $('#aj-nombre').value = config.nombre || '';
  $('#aj-direccion').value = config.direccion || '';
  $('#aj-telefono').value = config.telefono || '';
  $('#aj-mensaje-pie').value = config.mensaje_pie || '';
}

$('#btn-guardar-ajustes').addEventListener('click', async (e) => {
  const msg = $('#aj-mensaje');
  const body = {
    nombre: $('#aj-nombre').value.trim(),
    direccion: $('#aj-direccion').value.trim(),
    telefono: $('#aj-telefono').value.trim(),
    mensaje_pie: $('#aj-mensaje-pie').value.trim(),
  };
  await conCarga(e.currentTarget, 'Guardando…', async () => {
  const res = await fetch(`${API}/configuracion`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error || 'No se pudieron guardar los ajustes.';
    msg.className = 'mensaje error';
    return;
  }
  negocioConfigCache = data;
  msg.textContent = 'Ajustes guardados.';
  msg.className = 'mensaje ok';
  });
});

/* ---------- INICIO ---------- */
verificarSesion();
