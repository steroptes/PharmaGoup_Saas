import { supabase } from '@/lib/supabase';

export type CampaignStatus = 'draft' | 'open' | 'closed' | 'archived';

export type CampaignRow = {
  id: string;
  name: string;
  supplier_id: string | null;
  start_date: string;
  end_date: string;
  status: CampaignStatus;
  created_at: string;
  supplier_name: string | null;
  participants_count: number;
};

const formatCampaignTableError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes('could not find the table') && normalized.includes('campaign')) {
    return 'La table Supabase des campagnes est absente (migrations non appliquées). Exécutez les migrations puis rechargez la page.';
  }
  return message;
};

const loadOrganizationMap = async () => {
  const { data: laboratoryRows, error: laboratoryError } = await supabase.from('laboratories').select('id, designation');
  if (!laboratoryError && laboratoryRows?.length) return new Map(laboratoryRows.map((row) => [row.id, row.designation]));

  const { data: supplierRows, error: supplierError } = await supabase.from('suppliers').select('id, name');
  if (!supplierError && supplierRows?.length) return new Map(supplierRows.map((row) => [row.id, row.name]));

  return new Map<string, string>();
};

export const listCampaigns = async () => {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, name, supplier_id, start_date, end_date, status, created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(formatCampaignTableError(error.message));

  const campaigns = (data ?? []) as Array<{
    id: string;
    name: string;
    supplier_id: string | null;
    start_date: string;
    end_date: string;
    status: CampaignStatus;
    created_at: string;
  }>;

  const organizationMap = await loadOrganizationMap();

  const campaignIds = campaigns.map((campaign) => campaign.id);
  let participantsCountByCampaign = new Map<string, number>();

  if (campaignIds.length) {
    const { data: participantsRows, error: participantsError } = await supabase
      .from('campaign_participants')
      .select('campaign_id')
      .in('campaign_id', campaignIds);

    if (participantsError) throw new Error(formatCampaignTableError(participantsError.message));

    participantsCountByCampaign = (participantsRows ?? []).reduce((acc, row) => {
      acc.set(row.campaign_id, (acc.get(row.campaign_id) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  }

  return campaigns.map((campaign) => ({
    ...campaign,
    supplier_name: campaign.supplier_id ? organizationMap.get(campaign.supplier_id) ?? null : null,
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

  if (error) throw new Error(formatCampaignTableError(error.message));

  if (payload.pharmacy_ids.length) {
    const { error: participantsError } = await supabase.from('campaign_participants').insert(
      payload.pharmacy_ids.map((pharmacyId) => ({ campaign_id: data.id, pharmacy_id: pharmacyId })),
    );
    if (participantsError) throw new Error(formatCampaignTableError(participantsError.message));
  }
};

export const getCampaignById = async (campaignId: string) => {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, name, supplier_id, start_date, end_date, status, created_at')
    .eq('id', campaignId)
    .single();

  if (error) throw new Error(formatCampaignTableError(error.message));
  return data as Omit<CampaignRow, 'supplier_name' | 'participants_count'>;
};

export const updateCampaignDetails = async (
  campaignId: string,
  payload: { name: string; supplier_id: string; start_date: string; end_date: string },
) => {
  const { error } = await supabase
    .from('campaigns')
    .update({
      name: payload.name,
      supplier_id: payload.supplier_id,
      start_date: payload.start_date,
      end_date: payload.end_date,
    })
    .eq('id', campaignId);

  if (error) throw new Error(formatCampaignTableError(error.message));
};

export const updateCampaignStatus = async (campaignId: string, status: CampaignStatus) => {
  const { error } = await supabase.from('campaigns').update({ status }).eq('id', campaignId);
  if (error) throw new Error(formatCampaignTableError(error.message));
};
