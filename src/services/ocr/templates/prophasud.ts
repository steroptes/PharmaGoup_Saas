import type { ExtractedDeliveryNote } from '@/types/domain';

export const parseProphasudTemplate = (text: string): Partial<ExtractedDeliveryNote> => {
  const blNumber = text.match(/BL\s*[:#]?\s*([A-Z0-9-]+)/i)?.[1];
  return { supplierName: /PROPHASUD/i.test(text) ? 'PROPHASUD' : undefined, blNumber };
};
