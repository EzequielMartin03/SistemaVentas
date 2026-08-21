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

  const cols = 3;
  const rows = 5;
  const gap = 10;
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

    doc.roundedRect(x, y, cardWidth, cardHeight, 6)
      .dash(3, { space: 3 }).lineWidth(1).strokeColor(COLOR_BORDE).stroke();
    doc.undash();

    if (nombreComercio) {
      doc.fontSize(6.5).font('Helvetica').fillColor(COLOR_SUAVE)
        .text(nombreComercio.toUpperCase(), x + 8, y + 8, { width: cardWidth - 16 });
    }

    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLOR_TEXTO)
      .text(tag.nombre, x + 8, y + 18, { width: cardWidth - 16, height: 26, ellipsis: true });

    doc.fontSize(24).font('Helvetica-Bold').fillColor(COLOR_PRIMARIO)
      .text(money(tag.precio), x + 6, y + cardHeight / 2 - 8, { width: cardWidth - 12, align: 'center' });

    doc.fontSize(8.5).font('Helvetica').fillColor(COLOR_SUAVE)
      .text(tag.etiqueta, x + 8, y + cardHeight - 20, { width: cardWidth - 16, align: 'center' });
  });

  return doc;
}

module.exports = { generarEtiquetasPDF };
