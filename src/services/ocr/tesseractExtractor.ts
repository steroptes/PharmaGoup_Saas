import { createWorker } from 'tesseract.js';
import type { ExtractedDeliveryNote } from '@/types/domain';
import { parseAmount } from '@/services/ocr/normalizers/amount';
import { parseProphasudTemplate } from '@/services/ocr/templates/prophasud';
import { parseMedigrosTemplate } from '@/services/ocr/templates/medigros';

const parseDate = (text: string): string | undefined => {
  const match = text.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (!match) return undefined;
  const [d, m, y] = match[1].split('/');
  return `${y}-${m}-${d}`;
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
    lines: [],
  };
};
