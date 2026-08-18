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

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

function money(n) {
  const num = Number(n) || 0;
  return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

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
  tab.addEventListener('click', () => activarVista(tab.dataset.vista));
});

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

$('#btn-guardar-usuario').addEventListener('click', async () => {
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
  $('#btn-imprimir-ultima-venta').classList.add('oculto');
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

  const modalidades = [producto.vende_por_peso, producto.vende_por_bolsa, producto.vende_por_unidad].filter(Boolean).length;
  if (modalidades === 1 && !producto.vende_por_peso) {
    // Bolsa o unidad únicas: alta directa al carrito (flujo rápido tipo supermercado).
    $('#venta-modo').value = producto.vende_por_bolsa ? 'bolsa' : 'unidad';
    actualizarUnidadPesoVisible();
    $('#venta-cantidad').value = '1';
    const item = calcularItemVenta();
    if (item) {
      carrito.push(item);
      renderCarrito();
      msg.textContent = `${producto.nombre} agregado a la venta.`;
      msg.className = 'ayuda mensaje ok';
      $('#venta-cantidad').value = '';
    }
  } else {
    msg.textContent = `${producto.nombre} seleccionado. Indicá cantidad.`;
    msg.className = 'ayuda mensaje ok';
    $('#venta-cantidad').focus();
    return;
  }
  input.focus();
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
  if (p.vende_por_bolsa) opciones.push(`<option value="bolsa">Bolsa de ${p.peso_bolsa_kg}kg (${money(p.precio_bolsa)})</option>`);
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

$('#btn-agregar-item').addEventListener('click', () => {
  const item = calcularItemVenta();
  if (!item) {
    $('#venta-preview').textContent = 'Elegí producto, modalidad y una cantidad mayor a 0.';
    return;
  }
  carrito.push(item);
  $('#venta-cantidad').value = '';
  $('#venta-preview').textContent = '';
  renderCarrito();
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

$('#btn-confirmar-venta').addEventListener('click', async () => {
  const msg = $('#venta-mensaje');
  const items = carrito.map(({ producto_id, modo_venta, cantidad }) => ({ producto_id, modo_venta, cantidad }));
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
  msg.textContent = `Venta #${data.id} registrada — Total ${money(data.total)}, ganancia ${money(data.ganancia_total)}.`;
  msg.className = 'mensaje ok';
  ultimaVentaConfirmada = data;
  $('#btn-imprimir-ultima-venta').classList.remove('oculto');
  carrito = [];
  renderCarrito();
  $('#venta-codigo-barras').focus();
});

$('#btn-imprimir-ultima-venta').addEventListener('click', () => {
  if (ultimaVentaConfirmada) imprimirTicket(ultimaVentaConfirmada);
});

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
  if (p.vende_por_bolsa) partes.push(`${money(p.precio_bolsa)}/bolsa (${p.peso_bolsa_kg}kg)`);
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
      if (!confirm('¿Dar de baja este producto?')) return;
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

async function abrirModalProducto(id) {
  productoEditandoId = id;
  limpiarFormularioProducto();
  await poblarSelectCategoriasModal();

  if (id) {
    const p = productosCache.find((x) => x.id === id) || await (await fetch(`${API}/productos/${id}`)).json();
    $('#modal-producto-titulo').textContent = 'Editar producto';
    $('#np-nombre').value = p.nombre;
    $('#np-categoria').value = p.categoria_id;
    $('#np-codigo-barras').value = p.codigo_barras || '';

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

$('#btn-guardar-producto').addEventListener('click', async () => {
  const vendePeso = $('#np-vende-peso').checked;
  const vendeBolsa = $('#np-vende-bolsa').checked;
  const vendeUnidad = $('#np-vende-unidad').checked;

  const numOrNull = (sel) => ($(sel).value === '' ? null : Number($(sel).value));

  const body = {
    nombre: $('#np-nombre').value.trim(),
    categoria_id: Number($('#np-categoria').value),
    codigo_barras: $('#np-codigo-barras').value.trim() || null,

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

$('#btn-nueva-categoria').addEventListener('click', async () => {
  const input = $('#nueva-categoria-nombre');
  const nombre = input.value.trim();
  if (!nombre) return;
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

$('#btn-guardar-ajustes').addEventListener('click', async () => {
  const msg = $('#aj-mensaje');
  const body = {
    nombre: $('#aj-nombre').value.trim(),
    direccion: $('#aj-direccion').value.trim(),
    telefono: $('#aj-telefono').value.trim(),
    mensaje_pie: $('#aj-mensaje-pie').value.trim(),
  };
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

/* ---------- INICIO ---------- */
verificarSesion();
