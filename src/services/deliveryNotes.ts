import { supabase } from '@/lib/supabase';
import type { DeliveryNoteLineInput, ExtractedDeliveryNote } from '@/types/domain';

export interface SupplierOption {
  id: string;
  name: string;
}

export interface CampaignOption {
  id: string;
  name: string;
  supplier_id: string;
}

export interface DeliveryNoteSubmissionInput {
  uploadedBy: string;
  pharmacyId: string;
  supplierId: string;
  campaignId: string;
  file: File;
  note: ExtractedDeliveryNote;
  lines: DeliveryNoteLineInput[];
}

const sanitizeFilename = (filename: string) => filename.replace(/[^a-zA-Z0-9._-]/g, '_');

export const fetchSuppliers = async (): Promise<SupplierOption[]> => {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name')
    .order('name', { ascending: true });

  if (!error) return data ?? [];

  const normalized = error.message.toLowerCase();
  const isMissingSuppliersTable = normalized.includes('could not find the table') && normalized.includes('suppliers');
  if (!isMissingSuppliersTable) throw new Error(error.message);

  const { data: laboratoryRows, error: laboratoryError } = await supabase
    .from('laboratories')
    .select('id, designation')
    .order('designation', { ascending: true });

  if (laboratoryError) throw new Error(laboratoryError.message);

  return (laboratoryRows ?? []).map(({ id, designation }) => ({ id, name: designation }));
};

export const fetchCampaignsForPharmacy = async (
  pharmacyId: string,
  supplierId?: string,
): Promise<CampaignOption[]> => {
  const { data: participantRows, error: participantError } = await supabase
    .from('campaign_participants')
    .select('campaign_id')
    .eq('pharmacy_id', pharmacyId);

  if (participantError) throw new Error(participantError.message);

  const campaignIds = participantRows?.map((row) => row.campaign_id) ?? [];

  if (!campaignIds.length) return [];

  let query = supabase
    .from('campaigns')
    .select('id, name, supplier_id, status')
    .eq('status', 'open')
    .in('id', campaignIds)
    .order('name', { ascending: true });

  if (supplierId) {
    query = query.eq('supplier_id', supplierId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data ?? []).map(({ id, name, supplier_id }) => ({ id, name, supplier_id }));
};

export const submitDeliveryNote = async ({
  uploadedBy,
  pharmacyId,
  supplierId,
  campaignId,
  file,
  note,
  lines,
}: DeliveryNoteSubmissionInput): Promise<string> => {
  const storagePath = `${uploadedBy}/${Date.now()}-${sanitizeFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from('delivery-notes')
    .upload(storagePath, file, { upsert: false });

  if (uploadError) {
    throw new Error(`Upload fichier BL impossible: ${uploadError.message}`);
  }

  const notePayload = {
    campaign_id: campaignId,
    pharmacy_id: pharmacyId,
    supplier_id: supplierId,
    uploaded_by: uploadedBy,
    bl_number: note.blNumber ?? null,
    bl_date: note.blDate ?? null,
    total_ht: note.totalHT ?? null,
    total_tva: note.totalTVA ?? null,
    total_ttc: note.totalTTC ?? null,
    file_url: storagePath,
    status: 'submitted',
    ocr_confidence: note.confidence ?? null,
  };

  const { data: insertedNote, error: noteError } = await supabase
    .from('delivery_notes')
    .insert(notePayload)
    .select('id')
    .single();

  if (noteError || !insertedNote) {
    throw new Error(noteError?.message ?? "Impossible d'enregistrer l'entête du BL");
  }

  if (lines.length > 0) {
    const linePayload = lines.map((line) => ({
      delivery_note_id: insertedNote.id,
      product_id: line.product_id ?? null,
      product_code: line.product_code,
      designation: line.designation,
      quantity: line.quantity,
      p_phar: line.p_phar,
      p_pub: line.p_pub ?? null,
      subtotal: line.subtotal,
      line_confidence: line.line_confidence ?? null,
    }));

    const { error: lineError } = await supabase.from('delivery_note_lines').insert(linePayload);
    if (lineError) {
      throw new Error(lineError.message);
    }
  }

  return insertedNote.id;
};
