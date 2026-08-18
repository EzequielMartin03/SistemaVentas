const PDFDocument = require('pdfkit');

const COLOR_PRIMARIO = '#386b2d';
const COLOR_ACENTO = '#f4c430';
const COLOR_TEXTO = '#202821';
const COLOR_SUAVE = '#6d7666';
const COLOR_FONDO_KPI = '#eef4ea';
const COLOR_LINEA = '#e4e8de';

function money(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFecha(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function capitalizar(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dibujarTabla(doc, titulo, headers, rows, anchosRelativos) {
  const startX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pesos = anchosRelativos || headers.map(() => 1);
  const totalPeso = pesos.reduce((a, b) => a + b, 0);
  const anchos = pesos.map((p) => (p / totalPeso) * usableWidth);

  if (doc.y > doc.page.height - doc.page.margins.bottom - 130) doc.addPage();

  doc.fillColor(COLOR_TEXTO).fontSize(12).font('Helvetica-Bold').text(titulo, startX, doc.y);
  doc.moveDown(0.4);

  let y = doc.y;
  let x = startX;
  doc.fontSize(8).font('Helvetica-Bold').fillColor(COLOR_SUAVE);
  headers.forEach((h, i) => { doc.text(h.toUpperCase(), x, y, { width: anchos[i] }); x += anchos[i]; });
  y += 14;
  doc.moveTo(startX, y).lineTo(startX + usableWidth, y).strokeColor(COLOR_LINEA).lineWidth(1).stroke();
  y += 6;

  if (!rows.length) {
    doc.fontSize(9).font('Helvetica-Oblique').fillColor(COLOR_SUAVE).text('Sin datos para este período.', startX, y);
    y += 18;
  } else {
    rows.forEach((row) => {
      if (y > doc.page.height - doc.page.margins.bottom - 30) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      x = startX;
      row.forEach((cell, i) => {
        doc.fontSize(9).font('Helvetica').fillColor(COLOR_TEXTO).text(String(cell), x, y, { width: anchos[i] });
        x += anchos[i];
      });
      y += 16;
    });
  }
  doc.y = y + 16;
}

function dibujarGraficoBarras(doc, porDia) {
  if (!porDia.length) return;

  if (doc.y > doc.page.height - doc.page.margins.bottom - 160) doc.addPage();

  doc.fillColor(COLOR_TEXTO).fontSize(12).font('Helvetica-Bold').text('Ventas por día', doc.page.margins.left, doc.y);
  doc.moveDown(0.4);

  const chartX = doc.page.margins.left;
  const chartY = doc.y;
  const chartWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const chartHeight = 100;
  const maxTotal = Math.max(...porDia.map((d) => d.total), 1);
  const slotWidth = chartWidth / porDia.length;
  const barWidth = Math.max(4, Math.min(36, slotWidth - 6));

  doc.moveTo(chartX, chartY + chartHeight).lineTo(chartX + chartWidth, chartY + chartHeight)
    .strokeColor(COLOR_LINEA).lineWidth(1).stroke();

  porDia.forEach((d, i) => {
    const barHeight = maxTotal > 0 ? (d.total / maxTotal) * (chartHeight - 14) : 0;
    const x = chartX + i * slotWidth + (slotWidth - barWidth) / 2;
    const y = chartY + chartHeight - barHeight;
    doc.rect(x, y, barWidth, Math.max(barHeight, 1)).fill(COLOR_ACENTO);
    doc.fillColor(COLOR_SUAVE).fontSize(6).font('Helvetica')
      .text(d.fecha.slice(8, 10) + '/' + d.fecha.slice(5, 7), chartX + i * slotWidth, chartY + chartHeight + 4, {
        width: slotWidth, align: 'center',
      });
  });

  doc.y = chartY + chartHeight + 22;
}

function generarReportePDF(datos, config) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  const negocio = config || { nombre: 'Reporte de ventas' };

  doc.fillColor(COLOR_PRIMARIO).fontSize(20).font('Helvetica-Bold').text(negocio.nombre);
  doc.fillColor(COLOR_SUAVE).fontSize(9).font('Helvetica');
  if (negocio.direccion) doc.text(negocio.direccion);
  if (negocio.telefono) doc.text(`Tel: ${negocio.telefono}`);

  doc.moveDown(0.8);
  doc.fillColor(COLOR_TEXTO).fontSize(14).font('Helvetica-Bold')
    .text(`Reporte de ventas — ${formatFecha(datos.desde)} al ${formatFecha(datos.hasta)}`);
  doc.moveDown(1);

  const kpis = [
    { label: 'Total vendido', valor: money(datos.total) },
    { label: 'Ganancia', valor: money(datos.ganancia_total) },
    { label: 'Ventas realizadas', valor: String(datos.cantidad_ventas) },
    { label: 'Ticket promedio', valor: money(datos.ticket_promedio) },
  ];
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const gap = 10;
  const kpiWidth = (usableWidth - gap * (kpis.length - 1)) / kpis.length;
  const kpiY = doc.y;
  kpis.forEach((k, i) => {
    const x = doc.page.margins.left + i * (kpiWidth + gap);
    doc.roundedRect(x, kpiY, kpiWidth, 56, 6).fill(COLOR_FONDO_KPI);
    doc.fillColor(COLOR_SUAVE).fontSize(8).font('Helvetica').text(k.label, x + 10, kpiY + 10, { width: kpiWidth - 20 });
    doc.fillColor(COLOR_PRIMARIO).fontSize(13).font('Helvetica-Bold').text(k.valor, x + 10, kpiY + 27, { width: kpiWidth - 20 });
  });
  doc.y = kpiY + 56 + 20;

  dibujarGraficoBarras(doc, datos.por_dia);

  dibujarTabla(
    doc, 'Ventas por forma de pago',
    ['Forma de pago', 'Ventas', 'Total'],
    datos.por_forma_pago.map((f) => [capitalizar(f.forma_pago), f.cantidad, money(f.total)]),
    [2, 1, 1.5]
  );

  dibujarTabla(
    doc, 'Ventas por categoría',
    ['Categoría', 'Ítems', 'Total', 'Ganancia'],
    datos.por_categoria.map((c) => [c.categoria, c.cantidad, money(c.total), money(c.ganancia)]),
    [2, 1, 1.5, 1.5]
  );

  dibujarTabla(
    doc, 'Top 10 productos más vendidos',
    ['Producto', 'Ventas', 'Total', 'Ganancia'],
    datos.top_productos.map((p) => [p.nombre_producto, p.cantidad_ventas, money(p.total), money(p.ganancia)]),
    [3, 1, 1.5, 1.5]
  );

  const rangoPaginas = doc.bufferedPageRange();
  const margenInferiorOriginal = doc.page.margins.bottom;
  for (let i = 0; i < rangoPaginas.count; i++) {
    doc.switchToPage(i);
    // Se escribe dentro del margen inferior a propósito: hay que anularlo
    // momentáneamente o pdfkit interpreta que el texto desborda y agrega
    // una página en blanco de más.
    doc.page.margins.bottom = 0;
    doc.fillColor(COLOR_SUAVE).fontSize(7).font('Helvetica').text(
      `Generado el ${new Date().toLocaleString('es-AR')} — Página ${i + 1} de ${rangoPaginas.count}`,
      doc.page.margins.left,
      doc.page.height - margenInferiorOriginal + 10,
      { width: usableWidth, align: 'center' }
    );
    doc.page.margins.bottom = margenInferiorOriginal;
  }

  return doc;
}

module.exports = { generarReportePDF };
