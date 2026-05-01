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
  supplier_name: string | null;
  participants_count: number;
};

export const listCampaigns = async () => {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, name, supplier_id, start_date, end_date, status, created_at, suppliers(name)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const campaigns = (data ?? []) as Array<{
    id: string;
    name: string;
    supplier_id: string;
    start_date: string;
    end_date: string;
    status: CampaignStatus;
    created_at: string;
    suppliers: Array<{ name: string }> | null;
  }>;

  const campaignIds = campaigns.map((campaign) => campaign.id);
  let participantsCountByCampaign = new Map<string, number>();

  if (campaignIds.length) {
    const { data: participantsRows, error: participantsError } = await supabase
      .from('campaign_participants')
      .select('campaign_id')
      .in('campaign_id', campaignIds);

    if (participantsError) throw new Error(participantsError.message);

    participantsCountByCampaign = (participantsRows ?? []).reduce((acc, row) => {
      acc.set(row.campaign_id, (acc.get(row.campaign_id) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  }

  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    supplier_id: campaign.supplier_id,
    start_date: campaign.start_date,
    end_date: campaign.end_date,
    status: campaign.status,
    created_at: campaign.created_at,
    supplier_name: campaign.suppliers?.[0]?.name ?? null,
    participants_count: participantsCountByCampaign.get(campaign.id) ?? 0,
  })) as CampaignRow[];
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
