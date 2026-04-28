import type { ExtractedDeliveryNote } from '@/types/domain';

export const parseMedigrosTemplate = (text: string): Partial<ExtractedDeliveryNote> => {
  const blNumber = text.match(/BON\s*LIVRAISON\s*[:#]?\s*([A-Z0-9-]+)/i)?.[1];
  return { supplierName: /MEDIGROS/i.test(text) ? 'MEDIGROS' : undefined, blNumber };
};
