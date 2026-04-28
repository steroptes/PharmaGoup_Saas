export type Role = 'admin' | 'pharmacy_user';

export type DeliveryNoteStatus =
  | 'draft'
  | 'extracted'
  | 'corrected'
  | 'submitted'
  | 'validated'
  | 'rejected';

export type CampaignStatus = 'draft' | 'open' | 'closed' | 'archived';

export interface DeliveryNoteLineInput {
  id?: string;
  product_id?: string | null;
  product_code: string;
  designation: string;
  quantity: number;
  p_phar: number;
  p_pub?: number | null;
  subtotal: number;
  line_confidence?: number | null;
}

export interface ExtractedDeliveryNote {
  supplierName?: string;
  blNumber?: string;
  blDate?: string;
  pharmacyName?: string;
  totalHT?: number;
  totalTVA?: number;
  totalTTC?: number;
  confidence?: number;
  lines: DeliveryNoteLineInput[];
}
