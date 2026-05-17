import { supabase } from '@/lib/supabase';

export type CampaignStatus = 'draft' | 'open' | 'closed' | 'archived';
export type CampaignPhaseKey = 'purchase_intentions' | 'purchase_orders' | 'delivery_notes';
export type OrderPlacementMode = 'participant_choice' | 'admin_only' | 'participant_only';
export type CampaignPhase = {
  phase_key: CampaignPhaseKey;
  is_enabled: boolean;
  has_period_limit: boolean;
  start_date: string | null;
  end_date: string | null;
  allow_higher_than_intentions: boolean;
  order_placement_mode: OrderPlacementMode;
  multi_supplier_enabled: boolean;
};
export type CampaignProductArrangementMode = 'inherit_laboratory' | 'custom';
export type CampaignScopeType = 'campaign' | 'business_unit' | 'group_brand' | 'product';
export type CampaignConditionPhase = 'purchase_intentions' | 'purchase_orders' | 'both';
export type BonificationValueType = 'percent' | 'amount';
export type BonificationNature = 'purchase_voucher' | 'cash' | 'products';
export type BonificationCashMode = 'transfer' | 'check';
export type CampaignManagedProduct = {
  id: string;
  designation: string;
  nature: 'medicament' | 'para';
  purchase_unit_price_ht: number;
  vat_rate: number;
  business_unit_id: string | null;
  group_brand_id: string | null;
};
export type CampaignBusinessUnit = { id: string; name: string };
export type CampaignGroupBrand = { id: string; name: string; campaign_business_unit_id: string | null };
export type CampaignProductArrangementRow = {
  product_id: string;
  campaign_business_unit_id: string | null;
  campaign_group_brand_id: string | null;
};
export type CampaignCondition = {
  id?: string;
  scope_type: CampaignScopeType;
  campaign_business_unit_id: string | null;
  campaign_group_brand_id: string | null;
  product_id: string | null;
  phase: CampaignConditionPhase;
  condition_kind: string;
  reference_scope_type: CampaignScopeType | null;
  label: string;
  operator: string;
  target_value: number;
  unit: string;
};
export type CampaignBonification = {
  id?: string;
  scope_type: CampaignScopeType;
  campaign_business_unit_id: string | null;
  campaign_group_brand_id: string | null;
  product_id: string | null;
  label: string;
  value_type: BonificationValueType;
  value: number;
  nature: BonificationNature;
  cash_mode: BonificationCashMode | null;
  buy_qty_threshold: number | null;
  free_qty: number | null;
  is_repeatable: boolean | null;
};
export type LaboratoryGroupBrand = { id: string; name: string; business_unit_id: string | null };

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
  if (message.includes('CAMPAIGN_PRODUCT_ARRANGEMENT_LOCKED_ON_OPEN')) {
    return "Campagne ouverte: l'arrangement des produits est figé et ne peut plus être modifié.";
  }
  if (message.includes('CAMPAIGN_PHASE_ENABLEMENT_LOCKED_ON_OPEN')) {
    return "Campagne ouverte: l'activation des phases est verrouillée. Seules les périodes et leurs dates restent modifiables.";
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
    .maybeSingle();

  if (error) throw new Error(formatCampaignTableError(error.message));
  if (!data) throw new Error('Campagne introuvable ou non accessible.');
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

export const deleteCampaign = async (campaignId: string) => {
  const { error } = await supabase.rpc('admin_delete_campaign_if_allowed', {
    p_campaign_id: campaignId,
  });

  if (!error) return;

  const message = error.message ?? '';
  if (message.includes('CAMPAIGN_DELETE_NOT_ALLOWED')) {
    throw new Error("Suppression impossible: la campagne n'est pas en brouillon et des participants ont déjà postulé.");
  }
  if (message.includes('CAMPAIGN_NOT_FOUND')) {
    throw new Error('Campagne introuvable.');
  }
  if (message.includes('FORBIDDEN')) {
    throw new Error("Vous n'êtes pas autorisé à supprimer cette campagne.");
  }

  throw new Error(formatCampaignTableError(message));
};

export const listCampaignPhases = async (campaignId: string): Promise<CampaignPhase[]> => {
  const { data, error } = await supabase
    .from('campaign_phases')
    .select('phase_key, is_enabled, has_period_limit, start_date, end_date, allow_higher_than_intentions, order_placement_mode, multi_supplier_enabled')
    .eq('campaign_id', campaignId);

  if (error) {
    const normalized = (error.message ?? '').toLowerCase();
    if (!normalized.includes('multi_supplier_enabled')) {
      throw new Error(formatCampaignTableError(error.message));
    }
    const fallback = await supabase
      .from('campaign_phases')
      .select('phase_key, is_enabled, has_period_limit, start_date, end_date, allow_higher_than_intentions, order_placement_mode')
      .eq('campaign_id', campaignId);
    if (fallback.error) throw new Error(formatCampaignTableError(fallback.error.message));
    return (fallback.data ?? []).map((row: any) => ({
      ...row,
      multi_supplier_enabled: false,
    })) as CampaignPhase[];
  }

  return (data ?? []) as CampaignPhase[];
};

export const upsertCampaignPhases = async (campaignId: string, phases: CampaignPhase[]) => {
  const payload = phases.map((phase) => ({
    campaign_id: campaignId,
    phase_key: phase.phase_key,
    is_enabled: phase.is_enabled,
    has_period_limit: phase.has_period_limit,
    start_date: phase.has_period_limit ? phase.start_date : null,
    end_date: phase.has_period_limit ? phase.end_date : null,
    allow_higher_than_intentions: phase.phase_key === 'purchase_orders' ? phase.allow_higher_than_intentions : false,
    order_placement_mode: phase.phase_key === 'purchase_orders' ? phase.order_placement_mode : 'participant_choice',
    multi_supplier_enabled: phase.phase_key === 'purchase_orders' ? phase.multi_supplier_enabled : false,
  }));

  const { error } = await supabase.from('campaign_phases').upsert(payload, {
    onConflict: 'campaign_id,phase_key',
  });
  if (!error) return;

  const normalized = (error.message ?? '').toLowerCase();
  if (!normalized.includes('multi_supplier_enabled')) throw new Error(formatCampaignTableError(error.message));

  const fallbackPayload = phases.map((phase) => ({
    campaign_id: campaignId,
    phase_key: phase.phase_key,
    is_enabled: phase.is_enabled,
    has_period_limit: phase.has_period_limit,
    start_date: phase.has_period_limit ? phase.start_date : null,
    end_date: phase.has_period_limit ? phase.end_date : null,
    allow_higher_than_intentions: phase.phase_key === 'purchase_orders' ? phase.allow_higher_than_intentions : false,
    order_placement_mode: phase.phase_key === 'purchase_orders' ? phase.order_placement_mode : 'participant_choice',
  }));
  const fallback = await supabase.from('campaign_phases').upsert(fallbackPayload, {
    onConflict: 'campaign_id,phase_key',
  });
  if (fallback.error) throw new Error(formatCampaignTableError(fallback.error.message));
};

export const listCampaignPhaseAuthorizedSuppliers = async (
  campaignId: string,
  phaseKey: CampaignPhaseKey,
): Promise<string[]> => {
  const { data, error } = await supabase
    .from('campaign_phase_authorized_suppliers')
    .select('supplier_id')
    .eq('campaign_id', campaignId)
    .eq('phase_key', phaseKey);
  if (error) throw new Error(formatCampaignTableError(error.message));
  return (data ?? []).map((row) => row.supplier_id as string);
};

export const replaceCampaignPhaseAuthorizedSuppliers = async (
  campaignId: string,
  phaseKey: CampaignPhaseKey,
  supplierIds: string[],
) => {
  const { error: deleteError } = await supabase
    .from('campaign_phase_authorized_suppliers')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('phase_key', phaseKey);
  if (deleteError) throw new Error(formatCampaignTableError(deleteError.message));

  if (!supplierIds.length) return;
  const uniqueSupplierIds = Array.from(new Set(supplierIds.filter(Boolean)));
  const { error: insertError } = await supabase
    .from('campaign_phase_authorized_suppliers')
    .insert(uniqueSupplierIds.map((supplierId) => ({
      campaign_id: campaignId,
      phase_key: phaseKey,
      supplier_id: supplierId,
    })));
  if (insertError) throw new Error(formatCampaignTableError(insertError.message));
};

export const listCampaignParticipantIds = async (campaignId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('campaign_participants')
    .select('pharmacy_id')
    .eq('campaign_id', campaignId);

  if (error) throw new Error(formatCampaignTableError(error.message));
  return (data ?? []).map((row) => row.pharmacy_id as string);
};

export const replaceCampaignParticipants = async (campaignId: string, pharmacyIds: string[]) => {
  const { error: deleteError } = await supabase
    .from('campaign_participants')
    .delete()
    .eq('campaign_id', campaignId);

  if (deleteError) throw new Error(formatCampaignTableError(deleteError.message));

  if (!pharmacyIds.length) return;

  const { error: insertError } = await supabase
    .from('campaign_participants')
    .insert(pharmacyIds.map((pharmacyId) => ({ campaign_id: campaignId, pharmacy_id: pharmacyId })));

  if (insertError) throw new Error(formatCampaignTableError(insertError.message));
};

export const listManagedProductsForLaboratory = async (laboratoryId: string): Promise<CampaignManagedProduct[]> => {
  const { data, error } = await supabase
    .from('managed_products')
    .select('id, designation, nature, purchase_unit_price_ht, vat_rate_id, business_unit_id, group_brand_id')
    .eq('laboratory_id', laboratoryId)
    .eq('is_active', true)
    .order('designation', { ascending: true });

  if (error) throw new Error(formatCampaignTableError(error.message));
  const vatRateIds = Array.from(new Set((data ?? []).map((row: any) => row.vat_rate_id).filter(Boolean)));
  let vatRateMap = new Map<string, number>();
  if (vatRateIds.length) {
    const { data: vatRates, error: vatError } = await supabase
      .from('vat_rates')
      .select('id, rate')
      .in('id', vatRateIds);
    if (vatError) throw new Error(formatCampaignTableError(vatError.message));
    vatRateMap = new Map((vatRates ?? []).map((row: any) => [row.id as string, Number(row.rate ?? 0)]));
  }

  return (data ?? []).map((row: any) => ({
    id: row.id as string,
    designation: row.designation as string,
    nature: row.nature as 'medicament' | 'para',
    purchase_unit_price_ht: Number(row.purchase_unit_price_ht ?? 0),
    vat_rate: vatRateMap.get(row.vat_rate_id as string) ?? 0,
    business_unit_id: (row.business_unit_id as string | null) ?? null,
    group_brand_id: (row.group_brand_id as string | null) ?? null,
  }));
};

export const listBusinessUnitsForLaboratory = async (laboratoryId: string): Promise<CampaignBusinessUnit[]> => {
  const { data, error } = await supabase
    .from('business_units')
    .select('id, name')
    .eq('laboratory_id', laboratoryId)
    .order('name', { ascending: true });
  if (error) throw new Error(formatCampaignTableError(error.message));
  return (data ?? []) as CampaignBusinessUnit[];
};

export const listGroupBrandsForLaboratory = async (laboratoryId: string): Promise<LaboratoryGroupBrand[]> => {
  const { data, error } = await supabase
    .from('group_brands')
    .select('id, name, business_unit_id')
    .eq('laboratory_id', laboratoryId)
    .order('name', { ascending: true });
  if (error) throw new Error(formatCampaignTableError(error.message));
  return (data ?? []) as LaboratoryGroupBrand[];
};

export const getCampaignProductConfiguration = async (campaignId: string) => {
  const [participantsRes, settingsRes, arrangementsRes] = await Promise.all([
    supabase.from('campaign_products').select('product_id').eq('campaign_id', campaignId),
    supabase.from('campaign_product_settings').select('arrangement_mode').eq('campaign_id', campaignId).maybeSingle(),
    supabase.from('campaign_product_arrangements').select('product_id, campaign_business_unit_id, campaign_group_brand_id').eq('campaign_id', campaignId),
  ]);

  if (participantsRes.error) throw new Error(formatCampaignTableError(participantsRes.error.message));
  if (settingsRes.error) throw new Error(formatCampaignTableError(settingsRes.error.message));
  if (arrangementsRes.error) throw new Error(formatCampaignTableError(arrangementsRes.error.message));

  return {
    productIds: (participantsRes.data ?? []).map((row) => row.product_id as string),
    arrangementMode: (settingsRes.data?.arrangement_mode ?? 'inherit_laboratory') as CampaignProductArrangementMode,
    arrangements: (arrangementsRes.data ?? []) as CampaignProductArrangementRow[],
  };
};

export const saveCampaignProductConfiguration = async (
  campaignId: string,
  payload: {
    productIds: string[];
    arrangementMode: CampaignProductArrangementMode;
    arrangements: CampaignProductArrangementRow[];
  },
) => {
  const { error: deleteProductsError } = await supabase.from('campaign_products').delete().eq('campaign_id', campaignId);
  if (deleteProductsError) throw new Error(formatCampaignTableError(deleteProductsError.message));

  if (payload.productIds.length) {
    const { error: insertProductsError } = await supabase
      .from('campaign_products')
      .insert(payload.productIds.map((productId) => ({ campaign_id: campaignId, product_id: productId })));
    if (insertProductsError) throw new Error(formatCampaignTableError(insertProductsError.message));
  }

  const { error: upsertSettingsError } = await supabase.from('campaign_product_settings').upsert({
    campaign_id: campaignId,
    arrangement_mode: payload.arrangementMode,
  }, { onConflict: 'campaign_id' });
  if (upsertSettingsError) throw new Error(formatCampaignTableError(upsertSettingsError.message));

  const { error: deleteArrangementsError } = await supabase
    .from('campaign_product_arrangements')
    .delete()
    .eq('campaign_id', campaignId);
  if (deleteArrangementsError) throw new Error(formatCampaignTableError(deleteArrangementsError.message));

  if (payload.arrangements.length) {
    const { error: insertArrangementsError } = await supabase.from('campaign_product_arrangements').insert(
      payload.arrangements.map((row) => ({
        campaign_id: campaignId,
        product_id: row.product_id,
        campaign_business_unit_id: row.campaign_business_unit_id,
        campaign_group_brand_id: row.campaign_group_brand_id,
      })),
    );
    if (insertArrangementsError) throw new Error(formatCampaignTableError(insertArrangementsError.message));
  }
};

export const resetCampaignArrangementContainers = async (campaignId: string) => {
  const { error: deleteGroupsError } = await supabase
    .from('campaign_group_brands')
    .delete()
    .eq('campaign_id', campaignId);
  if (deleteGroupsError) throw new Error(formatCampaignTableError(deleteGroupsError.message));

  const { error: deleteBusError } = await supabase
    .from('campaign_business_units')
    .delete()
    .eq('campaign_id', campaignId);
  if (deleteBusError) throw new Error(formatCampaignTableError(deleteBusError.message));
};

export const listCampaignBusinessUnits = async (campaignId: string): Promise<CampaignBusinessUnit[]> => {
  const { data, error } = await supabase
    .from('campaign_business_units')
    .select('id, name')
    .eq('campaign_id', campaignId)
    .order('name', { ascending: true });
  if (error) throw new Error(formatCampaignTableError(error.message));
  return (data ?? []) as CampaignBusinessUnit[];
};

export const listCampaignGroupBrands = async (campaignId: string): Promise<CampaignGroupBrand[]> => {
  const { data, error } = await supabase
    .from('campaign_group_brands')
    .select('id, name, campaign_business_unit_id')
    .eq('campaign_id', campaignId)
    .order('name', { ascending: true });
  if (error) throw new Error(formatCampaignTableError(error.message));
  return (data ?? []) as CampaignGroupBrand[];
};

export const createCampaignBusinessUnit = async (campaignId: string, name: string) => {
  const payload = { campaign_id: campaignId, name: name.trim() };
  const { data, error } = await supabase
    .from('campaign_business_units')
    .insert(payload)
    .select('id, name')
    .single();
  if (error) throw new Error(formatCampaignTableError(error.message));
  return data as CampaignBusinessUnit;
};

export const createCampaignGroupBrand = async (
  campaignId: string,
  name: string,
  campaignBusinessUnitId?: string | null,
) => {
  const payload = {
    campaign_id: campaignId,
    name: name.trim(),
    campaign_business_unit_id: campaignBusinessUnitId ?? null,
  };
  const { data, error } = await supabase
    .from('campaign_group_brands')
    .insert(payload)
    .select('id, name, campaign_business_unit_id')
    .single();
  if (error) throw new Error(formatCampaignTableError(error.message));
  return data as CampaignGroupBrand;
};

export const deleteCampaignBusinessUnit = async (businessUnitId: string) => {
  const { error } = await supabase.from('campaign_business_units').delete().eq('id', businessUnitId);
  if (error) throw new Error(formatCampaignTableError(error.message));
};

export const deleteCampaignGroupBrand = async (groupBrandId: string) => {
  const { error } = await supabase.from('campaign_group_brands').delete().eq('id', groupBrandId);
  if (error) throw new Error(formatCampaignTableError(error.message));
};

export const listCampaignConditions = async (campaignId: string): Promise<CampaignCondition[]> => {
  const { data, error } = await supabase
    .from('campaign_conditions')
    .select('id, scope_type, campaign_business_unit_id, campaign_group_brand_id, product_id, phase, condition_kind, reference_scope_type, label, operator, target_value, unit')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(formatCampaignTableError(error.message));
  return (data ?? []) as CampaignCondition[];
};

export const saveCampaignConditions = async (campaignId: string, rows: CampaignCondition[]) => {
  const { error: deleteError } = await supabase.from('campaign_conditions').delete().eq('campaign_id', campaignId);
  if (deleteError) throw new Error(formatCampaignTableError(deleteError.message));
  if (!rows.length) return;
  const { error } = await supabase.from('campaign_conditions').insert(rows.map((row) => ({
    campaign_id: campaignId,
    scope_type: row.scope_type,
    campaign_business_unit_id: row.campaign_business_unit_id,
    campaign_group_brand_id: row.campaign_group_brand_id,
    product_id: row.product_id,
    phase: row.phase,
    condition_kind: row.condition_kind,
    reference_scope_type: row.reference_scope_type,
    label: row.label,
    operator: row.operator,
    target_value: row.target_value,
    unit: row.unit,
  })));
  if (error) throw new Error(formatCampaignTableError(error.message));
};

export const listCampaignBonifications = async (campaignId: string): Promise<CampaignBonification[]> => {
  const { data, error } = await supabase
    .from('campaign_bonifications')
    .select('id, scope_type, campaign_business_unit_id, campaign_group_brand_id, product_id, label, value_type, value, nature, cash_mode, buy_qty_threshold, free_qty, is_repeatable')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });
  if (error) {
    const normalized = error.message.toLowerCase();
    const missingExtendedColumns = (normalized.includes('cash_mode') || normalized.includes('buy_qty_threshold') || normalized.includes('free_qty') || normalized.includes('is_repeatable'))
      && (normalized.includes('column') || normalized.includes('schema cache'));
    if (!missingExtendedColumns) throw new Error(formatCampaignTableError(error.message));
    const { data: legacyData, error: legacyError } = await supabase
      .from('campaign_bonifications')
      .select('id, scope_type, campaign_business_unit_id, campaign_group_brand_id, product_id, label, value_type, value, nature')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });
    if (legacyError) throw new Error(formatCampaignTableError(legacyError.message));
    return (legacyData ?? []).map((row) => ({ ...row, cash_mode: null, buy_qty_threshold: null, free_qty: null, is_repeatable: null })) as CampaignBonification[];
  }
  return (data ?? []) as CampaignBonification[];
};

export const saveCampaignBonifications = async (campaignId: string, rows: CampaignBonification[]) => {
  const { error: deleteError } = await supabase.from('campaign_bonifications').delete().eq('campaign_id', campaignId);
  if (deleteError) throw new Error(formatCampaignTableError(deleteError.message));
  if (!rows.length) return;
  const payload = rows.map((row) => ({
    campaign_id: campaignId,
    scope_type: row.scope_type,
    campaign_business_unit_id: row.campaign_business_unit_id,
    campaign_group_brand_id: row.campaign_group_brand_id,
    product_id: row.product_id,
    label: row.label,
    value_type: row.value_type,
    value: row.value,
    nature: row.nature,
    cash_mode: row.nature === 'cash' ? row.cash_mode : null,
    buy_qty_threshold: row.nature === 'products' ? row.buy_qty_threshold : null,
    free_qty: row.nature === 'products' ? row.free_qty : null,
    is_repeatable: row.nature === 'products' ? row.is_repeatable : null,
  }));
  const { error } = await supabase.from('campaign_bonifications').insert(payload);
  if (!error) return;
  const normalized = error.message.toLowerCase();
  const missingExtendedColumns = (normalized.includes('cash_mode') || normalized.includes('buy_qty_threshold') || normalized.includes('free_qty') || normalized.includes('is_repeatable'))
    && (normalized.includes('column') || normalized.includes('schema cache'));
  if (!missingExtendedColumns) throw new Error(formatCampaignTableError(error.message));
  const legacyPayload = rows.map((row) => ({
    campaign_id: campaignId,
    scope_type: row.scope_type,
    campaign_business_unit_id: row.campaign_business_unit_id,
    campaign_group_brand_id: row.campaign_group_brand_id,
    product_id: row.product_id,
    label: row.label,
    value_type: row.value_type,
    value: row.value,
    nature: row.nature,
  }));
  const { error: legacyError } = await supabase.from('campaign_bonifications').insert(legacyPayload);
  if (legacyError) throw new Error(formatCampaignTableError(legacyError.message));
};


