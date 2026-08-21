const PDFDocument = require('pdfkit');

const COLOR_PRIMARIO = '#386b2d';
const COLOR_TEXTO = '#202821';
const COLOR_SUAVE = '#6d7666';
const COLOR_BORDE = '#c7cec0';

function money(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Un producto puede generar más de una etiqueta (una por modalidad de venta
// habilitada: kg, bolsa, unidad), ya que en la góndola pueden convivir
// ambos precios.
function productosATags(productos) {
  const tags = [];
  for (const p of productos) {
    if (p.vende_por_peso) tags.push({ nombre: p.nombre, precio: p.precio_kg, etiqueta: 'por kg' });
    if (p.vende_por_bolsa) tags.push({ nombre: p.nombre, precio: p.precio_bolsa, etiqueta: `bolsa x ${Number(p.peso_bolsa_kg)}kg` });
    if (p.vende_por_unidad) tags.push({ nombre: p.nombre, precio: p.precio_unidad, etiqueta: 'por unidad' });
  }
  return tags;
}

function generarEtiquetasPDF(productos, config) {
  const doc = new PDFDocument({ margin: 24, size: 'A4' });
  const tags = productosATags(productos);
  const nombreComercio = (config && config.nombre) || '';

  if (!tags.length) {
    doc.fontSize(13).fillColor(COLOR_TEXTO).font('Helvetica')
      .text('No hay productos con precio para generar etiquetas.', doc.page.margins.left, doc.page.margins.top);
    return doc;
  }

  // Etiquetas bajas y anchas, pensadas para tiras de estantería (no
  // tarjetas cuadradas): mismas columnas, el doble de filas que antes.
  const cols = 3;
  const rows = 10;
  const gap = 8;
  const marginX = doc.page.margins.left;
  const marginY = doc.page.margins.top;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const usableHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  const cardWidth = (usableWidth - gap * (cols - 1)) / cols;
  const cardHeight = (usableHeight - gap * (rows - 1)) / rows;
  const perPage = cols * rows;

  tags.forEach((tag, i) => {
    const posEnPagina = i % perPage;
    if (i > 0 && posEnPagina === 0) doc.addPage();

    const col = posEnPagina % cols;
    const row = Math.floor(posEnPagina / cols);
    const x = marginX + col * (cardWidth + gap);
    const y = marginY + row * (cardHeight + gap);

    doc.roundedRect(x, y, cardWidth, cardHeight, 4)
      .dash(2.5, { space: 2.5 }).lineWidth(1).strokeColor(COLOR_BORDE).stroke();
    doc.undash();

    if (nombreComercio) {
      doc.fontSize(5).font('Helvetica').fillColor(COLOR_SUAVE)
        .text(nombreComercio.toUpperCase(), x + 6, y + 4, { width: cardWidth - 12 });
    }

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(COLOR_TEXTO)
      .text(tag.nombre, x + 6, y + 12, { width: cardWidth - 12, height: 10, ellipsis: true });

    doc.fontSize(15).font('Helvetica-Bold').fillColor(COLOR_PRIMARIO)
      .text(money(tag.precio), x + 4, y + cardHeight / 2 - 6, { width: cardWidth - 8, align: 'center' });

    doc.fontSize(6).font('Helvetica').fillColor(COLOR_SUAVE)
      .text(tag.etiqueta, x + 6, y + cardHeight - 11, { width: cardWidth - 12, align: 'center' });
  });

  return doc;
}

module.exports = { generarEtiquetasPDF };
