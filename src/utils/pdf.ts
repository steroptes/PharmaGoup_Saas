const escapePdfText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\u00A0/g, ' ')
    .replace(/\u202F/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?');

const money = (value: number) =>
  value
    .toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    .replace(/\u00A0/g, ' ')
    .replace(/\u202F/g, ' ');

const approxTextWidth = (text: string, fontSize: number) => text.length * fontSize * 0.52;

export type PurchaseOrderPdfDocument = {
  date: string;
  participant: { name: string; address: string | null; phone: string | null };
  laboratory_name: string;
  supplier_name: string;
  lines: Array<{
    pct_code: string;
    product_name: string;
    quantity: number;
    unit_price_ht: number;
    vat_rate: number;
    line_total_ttc: number;
  }>;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  dispatch_info?: { created_at: string; channel: 'email' | 'sms' | 'whatsapp' } | null;
};

type TableLine = PurchaseOrderPdfDocument['lines'][number];

export const buildPurchaseOrderInvoicePdf = (doc: PurchaseOrderPdfDocument) => {
  const pageWidth = 595;
  const pageHeight = 842;
  const left = 40;
  const right = 555;
  const tableWidth = right - left;
  const topHeaderY = 805;

  const columns = [
    { key: 'code', label: 'Code PCT', w: 72, center: true },
    { key: 'designation', label: 'Designation', w: 222, center: true },
    { key: 'qty', label: 'Qte', w: 48, center: true },
    { key: 'pu', label: 'PU HT', w: 70, center: true },
    { key: 'tva', label: 'TVA', w: 58, center: true },
    { key: 'stttc', label: 'ST TTC', w: 45, center: true },
  ] as const;

  const columnX: number[] = [left];
  columns.forEach((col) => columnX.push(columnX[columnX.length - 1] + col.w));

  const rowH = 18;
  const headerRowH = 18;
  const tableStartY = 680;
  const footerMinY = 120;
  const rowsPerPage = Math.max(1, Math.floor((tableStartY - footerMinY - headerRowH) / rowH));
  const pages: TableLine[][] = [];
  for (let i = 0; i < doc.lines.length; i += rowsPerPage) pages.push(doc.lines.slice(i, i + rowsPerPage));
  if (!pages.length) pages.push([]);

  const pageStreams: string[] = [];

  const drawText = (ops: string[], x: number, y: number, size: number, text: string) => {
    ops.push(`BT /F1 ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET`);
  };
  const drawCenteredText = (ops: string[], xStart: number, colWidth: number, y: number, size: number, text: string) => {
    const x = xStart + (colWidth - approxTextWidth(text, size)) / 2;
    drawText(ops, x, y, size, text);
  };
  const drawLine = (ops: string[], x1: number, y1: number, x2: number, y2: number) => {
    ops.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  };
  const fillRectGray = (ops: string[], x: number, y: number, w: number, h: number, gray: number) => {
    ops.push(`${gray.toFixed(2)} g`);
    ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    ops.push('0 g');
  };

  pages.forEach((pageLines, pageIndex) => {
    const ops: string[] = [];

    drawText(ops, left, topHeaderY, 16, 'BON DE COMMANDE');
    drawText(ops, 430, topHeaderY, 10, `Date: ${doc.date}`);
    drawText(ops, left, topHeaderY - 24, 10, `Participant: ${doc.participant.name}`);
    drawText(ops, left, topHeaderY - 40, 9, `Adresse: ${doc.participant.address ?? '-'}`);
    drawText(ops, left, topHeaderY - 54, 9, `Tel: ${doc.participant.phone ?? '-'}`);
    drawText(ops, left, topHeaderY - 76, 10, `Laboratoire: ${doc.laboratory_name}`);
    drawText(ops, left, topHeaderY - 92, 10, `Fournisseur: ${doc.supplier_name}`);
    drawText(ops, left, topHeaderY - 108, 9, `Nombre de produits commandes: ${doc.lines.length}`);
    if (doc.dispatch_info?.created_at) {
      drawText(
        ops,
        left,
        topHeaderY - 122,
        9,
        `Commande passee le ${new Date(doc.dispatch_info.created_at).toLocaleString('fr-FR')} via ${doc.dispatch_info.channel.toUpperCase()}`,
      );
    }
    drawText(ops, 500, topHeaderY - 108, 9, `Page ${pageIndex + 1}/${pages.length}`);

    const headerTop = tableStartY;
    const headerBottom = headerTop - headerRowH;
    fillRectGray(ops, left, headerBottom, tableWidth, headerRowH, 0.92);
    drawLine(ops, left, headerTop, right, headerTop);
    drawLine(ops, left, headerBottom, right, headerBottom);
    for (let i = 0; i < columnX.length; i += 1) drawLine(ops, columnX[i], headerTop, columnX[i], headerBottom);

    columns.forEach((col, i) => {
      const x = columnX[i];
      if (col.center) drawCenteredText(ops, x, col.w, headerTop - 12, 8.5, col.label);
      else drawText(ops, x + 3, headerTop - 12, 8.5, col.label);
    });

    let y = headerBottom;
    pageLines.forEach((line, rowIndex) => {
      const nextY = y - rowH;
      if (rowIndex % 2 === 0) fillRectGray(ops, left, nextY, tableWidth, rowH, 0.97);
      drawLine(ops, left, y, right, y);
      for (let i = 0; i < columnX.length; i += 1) drawLine(ops, columnX[i], y, columnX[i], nextY);

      drawCenteredText(ops, columnX[0], columns[0].w, y - 12, 8.5, line.pct_code);
      drawCenteredText(ops, columnX[1], columns[1].w, y - 12, 8.5, line.product_name.slice(0, 40));
      drawCenteredText(ops, columnX[2], columns[2].w, y - 12, 8.5, String(line.quantity));
      drawCenteredText(ops, columnX[3], columns[3].w, y - 12, 8.5, money(line.unit_price_ht));
      drawCenteredText(ops, columnX[4], columns[4].w, y - 12, 8.5, `${line.vat_rate.toFixed(0)}%`);
      drawCenteredText(ops, columnX[5], columns[5].w, y - 12, 8.5, money(line.line_total_ttc));
      y = nextY;
    });
    drawLine(ops, left, y, right, y);

    if (pageIndex === pages.length - 1) {
      const totalTop = Math.max(footerMinY + 58, y - 22);
      const totalLeft = 365;
      const totalRight = right;
      const totalRowH = 18;

      fillRectGray(ops, totalLeft, totalTop - totalRowH, totalRight - totalLeft, totalRowH, 0.95);
      drawLine(ops, totalLeft, totalTop, totalRight, totalTop);
      drawLine(ops, totalLeft, totalTop - totalRowH, totalRight, totalTop - totalRowH);
      drawLine(ops, totalLeft, totalTop - 2 * totalRowH, totalRight, totalTop - 2 * totalRowH);
      drawLine(ops, totalLeft, totalTop - 3 * totalRowH, totalRight, totalTop - 3 * totalRowH);
      drawLine(ops, totalLeft, totalTop, totalLeft, totalTop - 3 * totalRowH);
      drawLine(ops, totalLeft + 95, totalTop, totalLeft + 95, totalTop - 3 * totalRowH);
      drawLine(ops, totalRight, totalTop, totalRight, totalTop - 3 * totalRowH);

      drawText(ops, totalLeft + 6, totalTop - 13, 9, 'TOTAL HT');
      drawCenteredText(ops, totalLeft + 95, totalRight - (totalLeft + 95), totalTop - 13, 9, money(doc.total_ht));
      drawText(ops, totalLeft + 6, totalTop - 13 - totalRowH, 9, 'TOTAL TVA');
      drawCenteredText(ops, totalLeft + 95, totalRight - (totalLeft + 95), totalTop - 13 - totalRowH, 9, money(doc.total_tva));
      drawText(ops, totalLeft + 6, totalTop - 13 - 2 * totalRowH, 9, 'TOTAL TTC');
      drawCenteredText(ops, totalLeft + 95, totalRight - (totalLeft + 95), totalTop - 13 - 2 * totalRowH, 9, money(doc.total_ttc));
    }

    pageStreams.push(ops.join('\n'));
  });

  const objects: string[] = [];
  let nextId = 1;
  const newId = () => nextId++;
  const catalogId = newId();
  const pagesId = newId();
  const fontId = newId();
  const pageIds: number[] = [];

  objects[fontId] = `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

  for (const stream of pageStreams) {
    const pageId = newId();
    const contentId = newId();
    pageIds.push(pageId);
    objects[contentId] = `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
    objects[pageId] = `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`;
  }

  objects[pagesId] = `${pagesId} 0 obj\n<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>\nendobj\n`;
  objects[catalogId] = `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < nextId; i += 1) {
    offsets[i] = pdf.length;
    pdf += objects[i];
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let i = 1; i < nextId; i += 1) pdf += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const blobToBase64 = async (blob: Blob) => {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};
