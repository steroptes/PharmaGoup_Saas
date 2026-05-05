import { supabase } from '@/lib/supabase';

export type PharmacyCampaignParticipationStatus = 'pending' | 'accepted' | 'declined';
export type PharmacyCampaignPhaseKey = 'purchase_intentions' | 'purchase_orders' | 'delivery_notes';

export type PharmacyCampaignSummary = {
  campaign_id: string;
  campaign_name: string;
  campaign_status: 'draft' | 'open' | 'closed' | 'archived';
  supplier_id: string | null;
  supplier_name: string | null;
  start_date: string;
  end_date: string;
  participation_status: PharmacyCampaignParticipationStatus;
  participation_decided_at: string | null;
  enabled_phases: PharmacyCampaignPhaseKey[];
  phase_windows: Partial<Record<PharmacyCampaignPhaseKey, { has_period_limit: boolean; start_date: string | null; end_date: string | null }>>;
  phase_submission_statuses: Partial<Record<PharmacyCampaignPhaseKey, 'draft' | 'submitted' | 'needs_correction' | 'accepted'>>;
};

const buildSupplierMap = async () => {
  const { data: labs, error: labsError } = await supabase.from('laboratories').select('id, designation');
  if (!labsError && labs?.length) {
    return new Map(labs.map((item) => [item.id as string, item.designation as string]));
  }

  const { data: suppliers, error: suppliersError } = await supabase.from('suppliers').select('id, name');
  if (!suppliersError && suppliers?.length) {
    return new Map(suppliers.map((item) => [item.id as string, item.name as string]));
  }

  return new Map<string, string>();
};

export const listCampaignsForPharmacyPortal = async (pharmacyId?: string | null): Promise<PharmacyCampaignSummary[]> => {
  if (!pharmacyId) {
    let rpcRows: any[] | null = null;
    const v2 = await supabase.rpc('list_my_open_campaigns_v2');
    if (!v2.error) {
      rpcRows = (v2.data as any[]) ?? [];
    } else {
      const v1 = await supabase.rpc('list_my_open_campaigns');
      if (v1.error) throw new Error(v1.error.message);
      rpcRows = (v1.data as any[]) ?? [];
    }
    const supplierMap = await buildSupplierMap();
    return (rpcRows ?? []).map((row: any) => ({
      campaign_id: row.campaign_id as string,
      campaign_name: row.campaign_name as string,
      campaign_status: row.campaign_status as 'draft' | 'open' | 'closed' | 'archived',
      supplier_id: (row.supplier_id as string | null) ?? null,
      supplier_name: row.supplier_id ? supplierMap.get(row.supplier_id as string) ?? null : null,
      start_date: row.start_date as string,
      end_date: row.end_date as string,
      participation_status: (row.participation_status as PharmacyCampaignParticipationStatus | null) ?? 'pending',
      participation_decided_at: (row.participation_decided_at as string | null) ?? null,
      enabled_phases: ((row.enabled_phases as PharmacyCampaignPhaseKey[] | null) ?? []),
      phase_windows: (row.phase_windows as PharmacyCampaignSummary['phase_windows'] | null) ?? {},
      phase_submission_statuses: {},
    }));
  }

  const { data: participantRows, error: participantError } = await supabase
    .from('campaign_participants')
    .select('campaign_id, participation_status, participation_decided_at')
    .eq('pharmacy_id', pharmacyId);

  if (participantError) throw new Error(participantError.message);

  const campaignIds = (participantRows ?? []).map((row) => row.campaign_id as string);
  if (!campaignIds.length) return [];

  const [{ data: campaigns, error: campaignsError }, { data: phases, error: phasesError }, { data: submissions, error: submissionsError }, supplierMap] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id, name, status, supplier_id, start_date, end_date')
      .in('id', campaignIds)
      .eq('status', 'open')
      .order('start_date', { ascending: false }),
    supabase
      .from('campaign_phases')
      .select('campaign_id, phase_key, is_enabled')
      .in('campaign_id', campaignIds),
    supabase
      .from('campaign_phase_submissions')
      .select('campaign_id, phase_key, status')
      .in('campaign_id', campaignIds)
      .eq('pharmacy_id', pharmacyId),
    buildSupplierMap(),
  ]);

  if (campaignsError) throw new Error(campaignsError.message);
  const normalizedPhasesError = (phasesError?.message ?? '').toLowerCase();
  const canIgnorePhasesError = normalizedPhasesError.includes('permission denied')
    || normalizedPhasesError.includes('row-level security')
    || normalizedPhasesError.includes('does not exist');
  if (phasesError && !canIgnorePhasesError) throw new Error(phasesError.message);
  if (submissionsError) throw new Error(submissionsError.message);

  const phaseMap = new Map<string, PharmacyCampaignPhaseKey[]>();
  for (const row of (phasesError ? [] : phases) ?? []) {
    if (!row.is_enabled) continue;
    const current = phaseMap.get(row.campaign_id as string) ?? [];
    current.push(row.phase_key as PharmacyCampaignPhaseKey);
    phaseMap.set(row.campaign_id as string, current);
  }

  const participantMap = new Map<string, { status: PharmacyCampaignParticipationStatus; decidedAt: string | null }>();
  for (const row of participantRows ?? []) {
    participantMap.set(row.campaign_id as string, {
      status: (row.participation_status as PharmacyCampaignParticipationStatus | null) ?? 'pending',
      decidedAt: (row.participation_decided_at as string | null) ?? null,
    });
  }

  const submissionMap = new Map<string, PharmacyCampaignSummary['phase_submission_statuses']>();
  for (const row of submissions ?? []) {
    const campaignKey = row.campaign_id as string;
    const phaseStatuses = submissionMap.get(campaignKey) ?? {};
    phaseStatuses[row.phase_key as PharmacyCampaignPhaseKey] = row.status as 'draft' | 'submitted' | 'needs_correction' | 'accepted';
    submissionMap.set(campaignKey, phaseStatuses);
  }

  return (campaigns ?? []).map((campaign) => {
    const participant = participantMap.get(campaign.id as string);
    return {
      campaign_id: campaign.id as string,
      campaign_name: campaign.name as string,
      campaign_status: campaign.status as 'draft' | 'open' | 'closed' | 'archived',
      supplier_id: (campaign.supplier_id as string | null) ?? null,
      supplier_name: campaign.supplier_id ? supplierMap.get(campaign.supplier_id as string) ?? null : null,
      start_date: campaign.start_date as string,
      end_date: campaign.end_date as string,
      participation_status: participant?.status ?? 'pending',
      participation_decided_at: participant?.decidedAt ?? null,
      enabled_phases: phaseMap.get(campaign.id as string) ?? [],
      phase_windows: {},
      phase_submission_statuses: submissionMap.get(campaign.id as string) ?? {},
    };
  });
};

export const decideCampaignParticipation = async (
  campaignId: string,
  pharmacyId: string | null | undefined,
  decision: PharmacyCampaignParticipationStatus,
) => {
  if (!pharmacyId) {
    const { error: rpcError } = await supabase.rpc('set_my_campaign_participation', {
      p_campaign_id: campaignId,
      p_status: decision,
    });
    if (rpcError) throw new Error(rpcError.message);
    return;
  }

  const { error } = await supabase
    .from('campaign_participants')
    .update({ participation_status: decision })
    .eq('campaign_id', campaignId)
    .eq('pharmacy_id', pharmacyId);

  if (error) throw new Error(error.message);
};

export const resolveCurrentUserPharmacyId = async (): Promise<string | null> => {
  const { data, error } = await supabase.rpc('current_user_pharmacy_id');
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
};
