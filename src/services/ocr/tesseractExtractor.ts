import { createWorker } from 'tesseract.js';
import type { DeliveryNoteLineInput, ExtractedDeliveryNote } from '@/types/domain';
import { parseAmount } from '@/services/ocr/normalizers/amount';
import { parseProphasudTemplate } from '@/services/ocr/templates/prophasud';
import { parseMedigrosTemplate } from '@/services/ocr/templates/medigros';

const parseDate = (text: string): string | undefined => {
  const match = text.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (!match) return undefined;
  const [d, m, y] = match[1].split('/');
  return `${y}-${m}-${d}`;
};

const toLine = (
  product_code: string,
  designation: string,
  quantityRaw: string,
  pPharRaw: string,
  subtotalRaw?: string,
): DeliveryNoteLineInput | null => {
  const quantity = parseAmount(quantityRaw);
  const pPhar = parseAmount(pPharRaw);
  const parsedSubtotal = parseAmount(subtotalRaw);

  if (!quantity || !pPhar) return null;

  const subtotal = parsedSubtotal ?? Number((quantity * pPhar).toFixed(2));

  return {
    product_code: product_code.trim(),
    designation: designation.trim(),
    quantity,
    p_phar: pPhar,
    subtotal,
  };
};

const parseLinesFromRawText = (text: string): DeliveryNoteLineInput[] => {
  const rows = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const patterns = [
    /^(\d{4,})\s+(.+?)\s+(\d+(?:[,.]\d+)?)\s+(\d+(?:[,.]\d+)?)\s+(\d+(?:[,.]\d+)?)$/,
    /^(\d{4,})\s+(.+?)\s+(\d+(?:[,.]\d+)?)\s*[xX]\s*(\d+(?:[,.]\d+)?)$/,
  ];

  const extracted: DeliveryNoteLineInput[] = [];

  for (const row of rows) {
    const hasEnoughNumbers = (row.match(/\d+(?:[,.]\d+)?/g) ?? []).length >= 2;
    if (!hasEnoughNumbers) continue;

    for (const pattern of patterns) {
      const match = row.match(pattern);
      if (!match) continue;

      const parsed = toLine(match[1], match[2], match[3], match[4], match[5]);
      if (!parsed) continue;

      extracted.push(parsed);
      break;
    }
  }

  return extracted;
};

export const extractDeliveryNoteFromFile = async (file: File): Promise<ExtractedDeliveryNote> => {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error(
      "Le moteur OCR navigateur ne prend pas en charge les PDF bruts. Convertissez la première page en PNG/JPG avant l'import.",
    );
  }

  const worker = await createWorker('fra');
  const {
    data: { text, confidence },
  } = await worker.recognize(file);
  await worker.terminate();

  const prophasud = parseProphasudTemplate(text);
  const medigros = parseMedigrosTemplate(text);

  const totalHT = parseAmount(text.match(/TOTAL\s*HT\s*[:]?\s*([\d\s,.-]+)/i)?.[1]);
  const totalTVA = parseAmount(text.match(/TOTAL\s*TVA\s*[:]?\s*([\d\s,.-]+)/i)?.[1]);
  const totalTTC = parseAmount(text.match(/TOTAL\s*TTC\s*[:]?\s*([\d\s,.-]+)/i)?.[1]);

  return {
    ...prophasud,
    ...medigros,
    blDate: parseDate(text),
    totalHT,
    totalTVA,
    totalTTC,
    confidence,
    lines: parseLinesFromRawText(text),
    rawText: text,
  };
};
