import { supabase } from '@/lib/supabase';

export type CampaignStatus = 'draft' | 'open' | 'closed' | 'archived';

export type CampaignRow = {
  id: string;
  name: string;
  supplier_id: string;
  start_date: string;
  end_date: string;
  status: CampaignStatus;
  created_at: string;
  supplier: { name: string } | null;
  campaign_participants: Array<{ count: number }>;
};

export const listCampaigns = async () => {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, name, supplier_id, start_date, end_date, status, created_at, supplier:suppliers(name), campaign_participants(count)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CampaignRow[];
};

export const createCampaign = async (payload: {
  name: string;
  supplier_id: string;
  start_date: string;
  end_date: string;
  pharmacy_ids: string[];
}) => {
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name: payload.name,
      supplier_id: payload.supplier_id,
      start_date: payload.start_date,
      end_date: payload.end_date,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  if (payload.pharmacy_ids.length) {
    const { error: participantsError } = await supabase.from('campaign_participants').insert(
      payload.pharmacy_ids.map((pharmacyId) => ({ campaign_id: data.id, pharmacy_id: pharmacyId })),
    );
    if (participantsError) throw new Error(participantsError.message);
  }
};

export const updateCampaignStatus = async (campaignId: string, status: CampaignStatus) => {
  const { error } = await supabase.from('campaigns').update({ status }).eq('id', campaignId);
  if (error) throw new Error(error.message);
};
