import { supabase } from '@/lib/supabase';
import {
  CampaignCondition,
  CampaignPhaseKey,
  getCampaignProductConfiguration,
  listBusinessUnitsForLaboratory,
  listCampaignBusinessUnits,
  listCampaignConditions,
  listCampaignGroupBrands,
  listGroupBrandsForLaboratory,
  listManagedProductsForLaboratory,
} from '@/services/campaigns';
import { listCampaignsForPharmacyPortal, resolveCurrentUserPharmacyId } from '@/services/pharmacyCampaigns';

export type CampaignDynamicProductRow = {
  product_id: string;
  designation: string;
  unit_price_ht: number;
  vat_rate: number;
  quantity: number;
  campaign_business_unit_id: string | null;
  campaign_group_brand_id: string | null;
};

export type CampaignDynamicGroup = {
  id: string;
  name: string;
  products: CampaignDynamicProductRow[];
};

export type CampaignDynamicBu = {
  id: string;
  name: string;
  groups: CampaignDynamicGroup[];
};

export type CampaignCorrectionItem = {
  id: string;
  scope_type: 'campaign' | 'business_unit' | 'group_brand' | 'product';
  campaign_business_unit_id: string | null;
  campaign_group_brand_id: string | null;
  product_id: string | null;
  message: string;
  resolved: boolean;
  resolved_at: string | null;
};

export type CampaignDynamicFormPayload = {
  campaign_id: string;
  campaign_name: string;
  phase_key: CampaignPhaseKey;
  pharmacy_id: string;
  arrangement_mode: 'inherit_laboratory' | 'custom';
  business_units: CampaignDynamicBu[];
  root_products: CampaignDynamicProductRow[];
  conditions: CampaignCondition[];
  total_conditions_count: number;
  other_phase_conditions_count: number;
  submission_status: 'draft' | 'submitted' | 'needs_correction' | 'accepted' | null;
  submission_updated_at: string | null;
  prefilled_from_phase: CampaignPhaseKey | null;
  prefilled_from_status: 'draft' | 'submitted' | 'needs_correction' | 'accepted' | null;
  prefilled_from_updated_at: string | null;
  purchase_order_prerequisite_blocked: boolean;
  purchase_order_prerequisite_message: string | null;
  purchase_order_prerequisite_status: 'not_planned' | 'not_submitted' | 'submitted';
  admin_correction_note: string | null;
  admin_correction_items: CampaignCorrectionItem[];
};

export type CampaignSubmissionSummary = {
  submission_id: string;
  pharmacy_id: string;
  pharmacy_name: string;
  status: 'draft' | 'submitted' | 'needs_correction' | 'accepted';
  total_quantity: number;
  total_amount_ht: number;
  submitted_at: string | null;
  updated_at: string;
};

export type CampaignPharmacyPhaseStatus = Partial<Record<CampaignPhaseKey, 'draft' | 'submitted' | 'needs_correction' | 'accepted'>>;

export type CampaignSubmissionDetail = {
  submission_id: string;
  pharmacy_id: string;
  pharmacy_name: string;
  status: 'draft' | 'submitted' | 'needs_correction' | 'accepted';
  total_quantity: number;
  total_amount_ht: number;
  submitted_at: string | null;
  updated_at: string;
  admin_correction_note: string | null;
  reviewed_at: string | null;
  admin_correction_items: CampaignCorrectionItem[];
  lines: Array<{
    product_id: string;
    product_name: string;
    campaign_business_unit_id: string | null;
    campaign_group_brand_id: string | null;
    quantity: number;
    unit_price_ht: number;
    line_total_ht: number;
  }>;
};

const CORRECTION_MARKER = '__PG_CORRECTION_V1__';
const makeCorrectionId = () => `corr_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

const parseCorrectionPayload = (raw: string | null | undefined) => {
  const note = (raw ?? '').trim();
  if (!note) return { note: null, items: [] as CampaignCorrectionItem[] };
  if (!note.startsWith(CORRECTION_MARKER)) return { note, items: [] as CampaignCorrectionItem[] };
  try {
    const payload = JSON.parse(note.slice(CORRECTION_MARKER.length)) as { note?: string | null; items?: CampaignCorrectionItem[] };
    const items = Array.isArray(payload.items)
      ? payload.items.filter((item) => !!item?.message?.trim()).map((item) => ({
        id: item.id ?? makeCorrectionId(),
        scope_type: item.scope_type ?? 'campaign',
        campaign_business_unit_id: item.campaign_business_unit_id ?? null,
        campaign_group_brand_id: item.campaign_group_brand_id ?? null,
        product_id: item.product_id ?? null,
        message: item.message.trim(),
        resolved: Boolean(item.resolved),
        resolved_at: item.resolved_at ?? null,
      }))
      : [];
    const parsedNote = payload.note?.trim() ?? null;
    return { note: parsedNote, items };
  } catch {
    return { note, items: [] as CampaignCorrectionItem[] };
  }
};

const encodeCorrectionPayload = (note: string | null | undefined, items: CampaignCorrectionItem[]) => {
  const cleanNote = note?.trim() ?? null;
  const cleanItems = items
    .filter((item) => !!item?.message?.trim())
    .map((item) => ({
      id: item.id ?? makeCorrectionId(),
      scope_type: item.scope_type,
      campaign_business_unit_id: item.campaign_business_unit_id ?? null,
      campaign_group_brand_id: item.campaign_group_brand_id ?? null,
      product_id: item.product_id ?? null,
      message: item.message.trim(),
      resolved: Boolean(item.resolved),
      resolved_at: item.resolved ? (item.resolved_at ?? new Date().toISOString()) : null,
    }));

  if (!cleanItems.length) return cleanNote;
  return `${CORRECTION_MARKER}${JSON.stringify({ note: cleanNote, items: cleanItems })}`;
};

const resolvePharmacyNames = async (pharmacyIds: string[]): Promise<Map<string, string>> => {
  const ids = Array.from(new Set(pharmacyIds.filter(Boolean)));
  if (!ids.length) return new Map<string, string>();

  const names = new Map<string, string>();

  const rpc = await supabase.rpc('admin_list_users');
  if (!rpc.error && Array.isArray(rpc.data)) {
    for (const row of rpc.data) {
      if (row?.role !== 'pharmacy_user') continue;
      const id = row?.pharmacy_id as string | undefined;
      const name = row?.pharmacy_name as string | undefined;
      if (!id || !name) continue;
      if (!ids.includes(id)) continue;
      names.set(id, name);
    }
  }

  const unresolvedFromRpc = ids.filter((id) => !names.has(id));
  if (unresolvedFromRpc.length) {
    const { data: pharmacies } = await supabase
      .from('pharmacies')
      .select('id, name')
      .in('id', unresolvedFromRpc);
    for (const row of pharmacies ?? []) {
      const id = row.id as string;
      const name = row.name as string | null;
      if (name?.trim()) names.set(id, name.trim());
    }
  }

  const unresolved = ids.filter((id) => !names.has(id));
  if (unresolved.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('pharmacy_id, full_name')
      .in('pharmacy_id', unresolved)
      .eq('role', 'pharmacy_user');
    for (const row of profiles ?? []) {
      const id = row.pharmacy_id as string | null;
      const name = row.full_name as string | null;
      if (id && name?.trim() && !names.has(id)) names.set(id, name.trim());
    }
  }

  for (const id of ids) {
    if (!names.has(id)) names.set(id, 'Pharmacie non renseignee');
  }
  return names;
};

const ensurePhaseEnabled = async (campaignId: string, phaseKey: CampaignPhaseKey) => {
  const { data, error } = await supabase
    .from('campaign_phases')
    .select('is_enabled, has_period_limit, start_date, end_date')
    .eq('campaign_id', campaignId)
    .eq('phase_key', phaseKey)
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  const isOpenByWindow = (row: { has_period_limit?: boolean | null; start_date?: string | null; end_date?: string | null } | null | undefined) => {
    if (!row) return false;
    if (!row.has_period_limit) return true;
    if (!row.start_date || !row.end_date) return false;
    return today >= row.start_date && today <= row.end_date;
  };

  const enabledAndOpenByDirectRead = !error && !!data?.is_enabled && isOpenByWindow(data as any);
  if (enabledAndOpenByDirectRead) return;

  const fallbackRows = await listCampaignsForPharmacyPortal();
  const campaign = fallbackRows.find((row) => row.campaign_id === campaignId);
  const phaseWindow = campaign?.phase_windows?.[phaseKey] ?? null;
  const openByFallbackWindow = !phaseWindow
    ? true
    : !phaseWindow.has_period_limit
      ? true
      : !!phaseWindow.start_date && !!phaseWindow.end_date && today >= phaseWindow.start_date && today <= phaseWindow.end_date;
  if (campaign?.enabled_phases?.includes(phaseKey) && openByFallbackWindow) return;

  if (error) throw new Error(error.message);
  throw new Error('Cette phase n\'est pas active actuellement (activation ou dates de phase).');
};

const ensureAcceptedParticipant = async (campaignId: string, pharmacyId: string) => {
  const { data, error } = await supabase
    .from('campaign_participants')
    .select('participation_status')
    .eq('campaign_id', campaignId)
    .eq('pharmacy_id', pharmacyId)
    .maybeSingle();

  if (!error && data?.participation_status === 'accepted') return;

  const [rpcScoped, explicitScoped] = await Promise.allSettled([
    listCampaignsForPharmacyPortal(),
    listCampaignsForPharmacyPortal(pharmacyId),
  ]);
  const rows: Array<{ campaign_id: string; participation_status: 'pending' | 'accepted' | 'declined' }> = [];
  if (rpcScoped.status === 'fulfilled') rows.push(...rpcScoped.value.map((row) => ({ campaign_id: row.campaign_id, participation_status: row.participation_status })));
  if (explicitScoped.status === 'fulfilled') rows.push(...explicitScoped.value.map((row) => ({ campaign_id: row.campaign_id, participation_status: row.participation_status })));
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.campaign_id, row])).values());
  const campaign = uniqueRows.find((row) => row.campaign_id === campaignId);
  if (campaign?.participation_status === 'accepted') return;

  if (error) throw new Error(error.message);
  throw new Error('La participation doit etre acceptee pour acceder a ce formulaire.');
};

const loadSubmissionQuantities = async (campaignId: string, phaseKey: CampaignPhaseKey, pharmacyId: string) => {
  const { data: submission, error: submissionError } = await supabase
    .from('campaign_phase_submissions')
    .select('id, status, updated_at, admin_correction_note')
    .eq('campaign_id', campaignId)
    .eq('phase_key', phaseKey)
    .eq('pharmacy_id', pharmacyId)
    .maybeSingle();

  if (submissionError) throw new Error(submissionError.message);
  if (!submission) {
    return {
      quantities: new Map<string, number>(),
      status: null,
      updatedAt: null,
      adminCorrectionNote: null,
      adminCorrectionItems: [] as CampaignCorrectionItem[],
    } as const;
  }

  const { data: lines, error: linesError } = await supabase
    .from('campaign_phase_submission_lines')
    .select('product_id, quantity')
    .eq('submission_id', submission.id);

  if (linesError) throw new Error(linesError.message);

  const quantities = new Map<string, number>();
  for (const line of lines ?? []) {
    quantities.set(line.product_id as string, Number(line.quantity ?? 0));
  }

  const parsedCorrection = parseCorrectionPayload(submission.admin_correction_note as string | null);
  return {
    quantities,
    status: submission.status as 'draft' | 'submitted' | 'needs_correction' | 'accepted',
    updatedAt: (submission.updated_at as string | null) ?? null,
    adminCorrectionNote: parsedCorrection.note,
    adminCorrectionItems: parsedCorrection.items,
  } as const;
};

const isPermissionLikeError = (message: string) => {
  const normalized = message.toLowerCase();
  return normalized.includes('permission denied')
    || normalized.includes('row-level security')
    || normalized.includes('not accessible');
};

const getAccessibleOpenCampaignForPharmacy = async (campaignId: string, pharmacyId: string) => {
  const [rpcScoped, explicitScoped] = await Promise.allSettled([
    listCampaignsForPharmacyPortal(),
    listCampaignsForPharmacyPortal(pharmacyId),
  ]);

  const rows: Array<{
    campaign_id: string;
    campaign_name: string;
    campaign_status: 'draft' | 'open' | 'closed' | 'archived';
    supplier_id: string | null;
  }> = [];
  if (rpcScoped.status === 'fulfilled') rows.push(...rpcScoped.value);
  if (explicitScoped.status === 'fulfilled') rows.push(...explicitScoped.value);

  const uniqueRows = Array.from(new Map(rows.map((row) => [row.campaign_id, row])).values());
  const match = uniqueRows.find((row) => row.campaign_id === campaignId);
  if (!match) throw new Error('Campagne introuvable ou non accessible.');
  return {
    id: match.campaign_id,
    name: match.campaign_name,
    status: match.campaign_status,
    supplier_id: match.supplier_id,
  };
};

type PharmacyCampaignProductConfiguration = {
  productIds: string[];
  arrangementMode: 'inherit_laboratory' | 'custom';
  arrangements: Array<{
    product_id: string;
    campaign_business_unit_id: string | null;
    campaign_group_brand_id: string | null;
  }>;
  arrangementNamesByProductId: Map<string, { buName: string | null; groupName: string | null }>;
};

const listCampaignConditionsForPharmacy = async (campaignId: string, pharmacyId: string): Promise<CampaignCondition[]> => {
  const scopedRpc = await supabase.rpc('get_campaign_conditions_for_pharmacy', {
    p_campaign_id: campaignId,
    p_pharmacy_id: pharmacyId,
  });

  if (!scopedRpc.error && Array.isArray(scopedRpc.data)) return scopedRpc.data as CampaignCondition[];

  const fallbackRpc = await supabase.rpc('get_my_campaign_conditions', { p_campaign_id: campaignId });
  if (!fallbackRpc.error && Array.isArray(fallbackRpc.data)) return fallbackRpc.data as CampaignCondition[];

  const scopedError = scopedRpc.error?.message ?? '';
  const fallbackError = fallbackRpc.error?.message ?? '';
  throw new Error(`Chargement des conditions impossible. scoped=${scopedError || 'none'} fallback=${fallbackError || 'none'}`);
};

const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.0001;
const includesAny = (kind: string, values: string[]) => values.some((value) => kind.includes(value));

const evaluateSubmissionConditions = (
  conditions: CampaignCondition[],
  phaseKey: CampaignPhaseKey,
  effectiveProductIds: string[],
  linesPayload: Array<{
    product_id: string;
    campaign_business_unit_id: string | null;
    campaign_group_brand_id: string | null;
    quantity: number;
    line_total_ht: number;
  }>,
) => {
  const activeConditions = conditions.filter((condition) => condition.phase === phaseKey || condition.phase === 'both');

  const totals = {
    campaignQty: 0,
    campaignAmount: 0,
    byBuQty: new Map<string, number>(),
    byBuAmount: new Map<string, number>(),
    byGroupQty: new Map<string, number>(),
    byGroupAmount: new Map<string, number>(),
    byProductQty: new Map<string, number>(),
    byProductAmount: new Map<string, number>(),
  };

  for (const productId of effectiveProductIds) {
    totals.byProductQty.set(productId, 0);
    totals.byProductAmount.set(productId, 0);
  }

  for (const row of linesPayload) {
    totals.campaignQty += row.quantity;
    totals.campaignAmount += row.line_total_ht;
    totals.byProductQty.set(row.product_id, (totals.byProductQty.get(row.product_id) ?? 0) + row.quantity);
    totals.byProductAmount.set(row.product_id, (totals.byProductAmount.get(row.product_id) ?? 0) + row.line_total_ht);

    if (row.campaign_business_unit_id) {
      totals.byBuQty.set(row.campaign_business_unit_id, (totals.byBuQty.get(row.campaign_business_unit_id) ?? 0) + row.quantity);
      totals.byBuAmount.set(row.campaign_business_unit_id, (totals.byBuAmount.get(row.campaign_business_unit_id) ?? 0) + row.line_total_ht);
    }
    if (row.campaign_group_brand_id) {
      totals.byGroupQty.set(row.campaign_group_brand_id, (totals.byGroupQty.get(row.campaign_group_brand_id) ?? 0) + row.quantity);
      totals.byGroupAmount.set(row.campaign_group_brand_id, (totals.byGroupAmount.get(row.campaign_group_brand_id) ?? 0) + row.line_total_ht);
    }
  }

  const resolveScope = (condition: CampaignCondition, scope: 'campaign' | 'business_unit' | 'group_brand' | 'product') => {
    if (scope === 'campaign') return { qty: totals.campaignQty, amount: totals.campaignAmount };
    if (scope === 'business_unit') {
      const key = condition.campaign_business_unit_id ?? '';
      return { qty: totals.byBuQty.get(key) ?? 0, amount: totals.byBuAmount.get(key) ?? 0 };
    }
    if (scope === 'group_brand') {
      const key = condition.campaign_group_brand_id ?? '';
      return { qty: totals.byGroupQty.get(key) ?? 0, amount: totals.byGroupAmount.get(key) ?? 0 };
    }
    const key = condition.product_id ?? '';
    return { qty: totals.byProductQty.get(key) ?? 0, amount: totals.byProductAmount.get(key) ?? 0 };
  };

  const failures: string[] = [];
  for (const condition of activeConditions) {
    const kind = condition.condition_kind.toLowerCase();
    const target = Number(condition.target_value ?? 0);
    const scoped = resolveScope(condition, condition.scope_type);
    const metric = includesAny(kind, ['qty', 'quantity']) ? scoped.qty : scoped.amount;
    let current = metric;

    if (kind.includes('pct_total')) {
      const referenceScope = resolveScope(condition, (condition.reference_scope_type ?? 'campaign'));
      const denominator = includesAny(kind, ['qty', 'quantity']) ? referenceScope.qty : referenceScope.amount;
      current = denominator > 0 ? (metric / denominator) * 100 : 0;
    }

    let ok = true;
    if (kind.includes('_min_')) ok = current >= target;
    if (kind.includes('_max_')) ok = current <= target;
    if (kind.includes('modulo')) ok = target > 0 && approxEqual(current % target, 0);

    if (!ok) failures.push(`${condition.label || condition.condition_kind} (${current.toFixed(3)} vs ${condition.operator} ${target})`);
  }

  return { failures, activeConditionsCount: activeConditions.length };
};

const getCampaignProductConfigurationForPharmacy = async (campaignId: string): Promise<PharmacyCampaignProductConfiguration> => {
  const rpc = await supabase.rpc('get_my_campaign_product_configuration', { p_campaign_id: campaignId });
  if (!rpc.error && Array.isArray(rpc.data)) {
    const rows = rpc.data as Array<{
      product_id: string;
      arrangement_mode: 'inherit_laboratory' | 'custom' | null;
      campaign_business_unit_id: string | null;
      campaign_group_brand_id: string | null;
      campaign_business_unit_name?: string | null;
      campaign_group_brand_name?: string | null;
    }>;
    if (rows.length > 0) {
      const modeFromRpc = rows[0]?.arrangement_mode ?? 'inherit_laboratory';
      return {
        productIds: rows.map((row) => row.product_id),
        arrangementMode: modeFromRpc,
        arrangementNamesByProductId: new Map(rows.map((row) => [row.product_id, {
          buName: row.campaign_business_unit_name ?? null,
          groupName: row.campaign_group_brand_name ?? null,
        }])),
        arrangements: rows
          .filter((row) => row.campaign_business_unit_id || row.campaign_group_brand_id)
          .map((row) => ({
            product_id: row.product_id,
            campaign_business_unit_id: row.campaign_business_unit_id ?? null,
            campaign_group_brand_id: row.campaign_group_brand_id ?? null,
          })),
      };
    }
  }

  try {
    const direct = await getCampaignProductConfiguration(campaignId);
    return {
      ...direct,
      arrangementNamesByProductId: new Map<string, { buName: string | null; groupName: string | null }>(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isPermissionLikeError(message)) throw error;

    const { data: productsData, error: productsError } = await supabase
      .from('campaign_products')
      .select('product_id')
      .eq('campaign_id', campaignId);
    if (productsError) throw new Error(productsError.message);

    const [settingsResult, arrangementsResult] = await Promise.allSettled([
      supabase
        .from('campaign_product_settings')
        .select('arrangement_mode')
        .eq('campaign_id', campaignId)
        .maybeSingle(),
      supabase
        .from('campaign_product_arrangements')
        .select('product_id, campaign_business_unit_id, campaign_group_brand_id')
        .eq('campaign_id', campaignId),
    ]);

    let arrangementMode: 'inherit_laboratory' | 'custom' = 'inherit_laboratory';
    if (settingsResult.status === 'fulfilled' && !settingsResult.value.error) {
      arrangementMode = ((settingsResult.value.data as any)?.arrangement_mode ?? 'inherit_laboratory') as 'inherit_laboratory' | 'custom';
    }

    let arrangements: Array<{ product_id: string; campaign_business_unit_id: string | null; campaign_group_brand_id: string | null }> = [];
    if (arrangementsResult.status === 'fulfilled' && !arrangementsResult.value.error) {
      arrangements = ((arrangementsResult.value.data ?? []) as any[]).map((row) => ({
        product_id: row.product_id as string,
        campaign_business_unit_id: (row.campaign_business_unit_id as string | null) ?? null,
        campaign_group_brand_id: (row.campaign_group_brand_id as string | null) ?? null,
      }));
    }

    return {
      productIds: (productsData ?? []).map((row) => row.product_id as string),
      arrangementMode,
      arrangementNamesByProductId: new Map<string, { buName: string | null; groupName: string | null }>(),
      arrangements,
    };
  }
};

export const loadCampaignDynamicForm = async (
  campaignId: string,
  phaseKey: CampaignPhaseKey,
  pharmacyIdInput?: string | null,
): Promise<CampaignDynamicFormPayload> => {
  const pharmacyId = pharmacyIdInput ?? await resolveCurrentUserPharmacyId();
  if (!pharmacyId) throw new Error('Pharmacie introuvable pour l\'utilisateur courant.');

  const campaign = await getAccessibleOpenCampaignForPharmacy(campaignId, pharmacyId);
  if (!campaign.supplier_id) throw new Error('La campagne n\'a pas de laboratoire associe.');
  if (campaign.status !== 'open') throw new Error('La campagne doit etre ouverte.');

  const [config, products, businessUnitsResult, groupBrandsResult, conditionsResult, labBusinessUnitsResult, labGroupBrandsResult] = await Promise.allSettled([
    getCampaignProductConfigurationForPharmacy(campaignId),
    listManagedProductsForLaboratory(campaign.supplier_id),
    listCampaignBusinessUnits(campaignId),
    listCampaignGroupBrands(campaignId),
    listCampaignConditionsForPharmacy(campaignId, pharmacyId),
    listBusinessUnitsForLaboratory(campaign.supplier_id),
    listGroupBrandsForLaboratory(campaign.supplier_id),
  ]);

  if (config.status === 'rejected') throw config.reason;
  if (products.status === 'rejected') throw products.reason;
  const resolvedBusinessUnits = businessUnitsResult.status === 'fulfilled' ? businessUnitsResult.value : [];
  const resolvedGroupBrands = groupBrandsResult.status === 'fulfilled' ? groupBrandsResult.value : [];
  if (conditionsResult.status === 'rejected') throw conditionsResult.reason;
  const resolvedConditions = conditionsResult.value;
  const resolvedLabBusinessUnits = labBusinessUnitsResult.status === 'fulfilled' ? labBusinessUnitsResult.value : [];
  const resolvedLabGroupBrands = labGroupBrandsResult.status === 'fulfilled' ? labGroupBrandsResult.value : [];

  await ensurePhaseEnabled(campaignId, phaseKey);
  await ensureAcceptedParticipant(campaignId, pharmacyId);

  const { quantities, status, updatedAt, adminCorrectionNote, adminCorrectionItems } = await loadSubmissionQuantities(campaignId, phaseKey, pharmacyId);
  let initialQuantities = quantities;
  let prefilledFromPhase: CampaignPhaseKey | null = null;
  let prefilledFromStatus: 'draft' | 'submitted' | 'needs_correction' | 'accepted' | null = null;
  let prefilledFromUpdatedAt: string | null = null;
  let purchaseOrderPrerequisiteBlocked = false;
  let purchaseOrderPrerequisiteMessage: string | null = null;
  let purchaseOrderPrerequisiteStatus: 'not_planned' | 'not_submitted' | 'submitted' = 'not_planned';

  // Purchase order can inherit latest purchase intentions lines when no PO draft exists yet.
  if (phaseKey === 'purchase_orders') {
    const { data: intentionsPhase } = await supabase
      .from('campaign_phases')
      .select('is_enabled')
      .eq('campaign_id', campaignId)
      .eq('phase_key', 'purchase_intentions')
      .maybeSingle();

    if (intentionsPhase?.is_enabled) {
      const intentionsSubmission = await loadSubmissionQuantities(campaignId, 'purchase_intentions', pharmacyId);
      purchaseOrderPrerequisiteStatus = (!intentionsSubmission.status || intentionsSubmission.status === 'draft') ? 'not_submitted' : 'submitted';
      if (!intentionsSubmission.status || intentionsSubmission.status === 'draft') {
        purchaseOrderPrerequisiteBlocked = true;
        purchaseOrderPrerequisiteMessage = 'Soumission BC bloquee: vous devez d\'abord soumettre vos intentions d\'achat.';
      }
    }
  }

  if (phaseKey === 'purchase_orders' && status === null) {
    const { data: intentionsPhase } = await supabase
      .from('campaign_phases')
      .select('is_enabled')
      .eq('campaign_id', campaignId)
      .eq('phase_key', 'purchase_intentions')
      .maybeSingle();

    if (intentionsPhase?.is_enabled) {
      const intentionsSubmission = await loadSubmissionQuantities(campaignId, 'purchase_intentions', pharmacyId);
      if (intentionsSubmission.quantities.size > 0) {
        initialQuantities = intentionsSubmission.quantities;
        prefilledFromPhase = 'purchase_intentions';
        prefilledFromStatus = intentionsSubmission.status;
        prefilledFromUpdatedAt = intentionsSubmission.updatedAt;
      }
    }
  }
  const resolvedConfig = config.value;
  const productRows = products.value;
  const effectiveProductIds = resolvedConfig.productIds.length
    ? resolvedConfig.productIds
    : productRows.map((product) => product.id);
  const selectedProducts = new Set(effectiveProductIds);
  const arrangementsByProduct = new Map(resolvedConfig.arrangements.map((row) => [row.product_id, row]));
  const arrangementNamesByProduct = resolvedConfig.arrangementNamesByProductId ?? new Map<string, { buName: string | null; groupName: string | null }>();
  const productsById = new Map(productRows.map((product) => [product.id, product]));
  const campaignBuByName = new Map(resolvedBusinessUnits.map((bu) => [bu.name.trim().toLowerCase(), bu.id]));
  const campaignGroupByKey = new Map(
    resolvedGroupBrands.map((group) => [`${group.campaign_business_unit_id ?? 'root'}::${group.name.trim().toLowerCase()}`, group.id]),
  );
  const labBuById = new Map(resolvedLabBusinessUnits.map((bu) => [bu.id, bu]));
  const labGroupById = new Map(resolvedLabGroupBrands.map((group) => [group.id, group]));

  const rootProducts: CampaignDynamicProductRow[] = [];
  const buMap = new Map<string, CampaignDynamicBu>();
  const groupMap = new Map<string, CampaignDynamicGroup>();

  for (const productId of effectiveProductIds) {
    const product = productsById.get(productId);
    if (!product || !selectedProducts.has(product.id)) continue;
    const arrangement = arrangementsByProduct.get(product.id);
    let resolvedBuId = arrangement?.campaign_business_unit_id ?? null;
    let resolvedGroupId = arrangement?.campaign_group_brand_id ?? null;

    // Robust fallback for inherit mode: rebuild by laboratory hierarchy when explicit arrangement rows are missing.
    if (!arrangement && resolvedConfig.arrangementMode === 'inherit_laboratory') {
      const productBuId = (product as any).business_unit_id as string | null;
      const productGroupId = (product as any).group_brand_id as string | null;
      const labBu = productBuId ? labBuById.get(productBuId) : null;
      const labGroup = productGroupId ? labGroupById.get(productGroupId) : null;

      if (labBu?.name) {
        resolvedBuId = campaignBuByName.get(labBu.name.trim().toLowerCase()) ?? `lab-bu:${labBu.id}`;
      }
      if (labGroup?.name) {
        const groupKey = `${resolvedBuId ?? 'root'}::${labGroup.name.trim().toLowerCase()}`;
        resolvedGroupId = campaignGroupByKey.get(groupKey) ?? `lab-group:${labGroup.id}`;
      }
    }

    const row: CampaignDynamicProductRow = {
      product_id: product.id,
      designation: product.designation,
      unit_price_ht: Number((product as any).purchase_unit_price_ht ?? 0),
      vat_rate: Number((product as any).vat_rate ?? 0),
      quantity: initialQuantities.get(product.id) ?? 0,
      campaign_business_unit_id: resolvedBuId,
      campaign_group_brand_id: resolvedGroupId,
    };

    if (!row.campaign_business_unit_id) {
      rootProducts.push(row);
      continue;
    }

    const nameFromArrangement = arrangementNamesByProduct.get(product.id);
    const buName = nameFromArrangement?.buName
      ?? (row.campaign_business_unit_id.startsWith('lab-bu:')
      ? (labBuById.get(row.campaign_business_unit_id.replace('lab-bu:', ''))?.name ?? 'BU')
      : (resolvedBusinessUnits.find((bu) => bu.id === row.campaign_business_unit_id)?.name ?? 'BU'));
    const bu = buMap.get(row.campaign_business_unit_id) ?? ({
      id: row.campaign_business_unit_id,
      name: buName,
      groups: [],
    } as CampaignDynamicBu);

    if (!buMap.has(row.campaign_business_unit_id)) buMap.set(row.campaign_business_unit_id, bu);

    const groupId = row.campaign_group_brand_id ?? `__ungrouped__${bu.id}`;
    const groupName = nameFromArrangement?.groupName
      ?? (row.campaign_group_brand_id
      ? (row.campaign_group_brand_id.startsWith('lab-group:')
        ? (labGroupById.get(row.campaign_group_brand_id.replace('lab-group:', ''))?.name ?? 'GROUP')
        : (resolvedGroupBrands.find((group) => group.id === row.campaign_group_brand_id)?.name ?? 'GROUP'))
      : 'Sans GROUP');

    const group = groupMap.get(groupId) ?? ({ id: groupId, name: groupName, products: [] } as CampaignDynamicGroup);
    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, group);
      bu.groups.push(group);
    }
    group.products.push(row);
  }

  const filteredConditions = resolvedConditions.filter((condition) => condition.phase === phaseKey || condition.phase === 'both');
  const otherPhaseConditionsCount = Math.max(0, resolvedConditions.length - filteredConditions.length);

  return {
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    phase_key: phaseKey,
    pharmacy_id: pharmacyId,
    arrangement_mode: resolvedConfig.arrangementMode,
    business_units: Array.from(buMap.values()),
    root_products: rootProducts,
    conditions: filteredConditions,
    total_conditions_count: resolvedConditions.length,
    other_phase_conditions_count: otherPhaseConditionsCount,
    submission_status: status,
    submission_updated_at: updatedAt,
    prefilled_from_phase: prefilledFromPhase,
    prefilled_from_status: prefilledFromStatus,
    prefilled_from_updated_at: prefilledFromUpdatedAt,
    purchase_order_prerequisite_blocked: purchaseOrderPrerequisiteBlocked,
    purchase_order_prerequisite_message: purchaseOrderPrerequisiteMessage,
    purchase_order_prerequisite_status: purchaseOrderPrerequisiteStatus,
    admin_correction_note: adminCorrectionNote,
    admin_correction_items: adminCorrectionItems,
  };
};

export const saveCampaignDynamicForm = async (payload: {
  campaignId: string;
  phaseKey: CampaignPhaseKey;
  pharmacyId?: string | null;
  quantitiesByProductId: Record<string, number>;
  submit: boolean;
}) => {
  const pharmacyId = payload.pharmacyId ?? await resolveCurrentUserPharmacyId();
  if (!pharmacyId) throw new Error('Pharmacie introuvable pour l\'utilisateur courant.');

  await ensurePhaseEnabled(payload.campaignId, payload.phaseKey);
  await ensureAcceptedParticipant(payload.campaignId, pharmacyId);
  const { data: existingSubmission, error: existingSubmissionError } = await supabase
    .from('campaign_phase_submissions')
    .select('status, admin_correction_note')
    .eq('campaign_id', payload.campaignId)
    .eq('phase_key', payload.phaseKey)
    .eq('pharmacy_id', pharmacyId)
    .maybeSingle();
  if (existingSubmissionError) throw new Error(existingSubmissionError.message);
  if (existingSubmission?.status === 'accepted') {
    throw new Error('Cette soumission est deja acceptee par les admins et ne peut plus etre modifiee.');
  }

  const config = await getCampaignProductConfigurationForPharmacy(payload.campaignId);
  const campaign = await getAccessibleOpenCampaignForPharmacy(payload.campaignId, pharmacyId);
  if (!campaign.supplier_id) throw new Error('Campagne sans laboratoire associe.');
  const products = await listManagedProductsForLaboratory(campaign.supplier_id);
  const productMap = new Map(products.map((item: any) => [item.id, item]));
  const arrangementMap = new Map(config.arrangements.map((row) => [row.product_id, row]));
  const effectiveProductIds = config.productIds.length ? config.productIds : products.map((item) => item.id);

  const positives = effectiveProductIds
    .map((productId) => ({ productId, quantity: Math.max(0, Number(payload.quantitiesByProductId[productId] ?? 0)) }))
    .filter((item) => item.quantity > 0);

  let totalQty = 0;
  let totalAmount = 0;
  const linesPayload = positives.map((item) => {
    const product = productMap.get(item.productId);
    const unitPrice = Number((product as any)?.purchase_unit_price_ht ?? 0);
    const total = Number((unitPrice * item.quantity).toFixed(3));
    totalQty += item.quantity;
    totalAmount += total;
    const arrangement = arrangementMap.get(item.productId);
    return {
      product_id: item.productId,
      product_name: (product as any)?.designation ?? 'Produit',
      campaign_business_unit_id: arrangement?.campaign_business_unit_id ?? null,
      campaign_group_brand_id: arrangement?.campaign_group_brand_id ?? null,
      quantity: item.quantity,
      unit_price_ht: unitPrice,
      line_total_ht: total,
    };
  });

  if (payload.submit) {
    if (payload.phaseKey === 'purchase_orders') {
      const { data: intentionsPhase } = await supabase
        .from('campaign_phases')
        .select('is_enabled')
        .eq('campaign_id', payload.campaignId)
        .eq('phase_key', 'purchase_intentions')
        .maybeSingle();
      if (intentionsPhase?.is_enabled) {
        const intentionsSubmission = await loadSubmissionQuantities(payload.campaignId, 'purchase_intentions', pharmacyId);
        if (!intentionsSubmission.status || intentionsSubmission.status === 'draft') {
          throw new Error('Soumission BC bloquee: les intentions d\'achat doivent etre soumises avant le bon de commande.');
        }
      }
    }

    const conditions = await listCampaignConditionsForPharmacy(payload.campaignId, pharmacyId);
    const { failures } = evaluateSubmissionConditions(conditions, payload.phaseKey, effectiveProductIds, linesPayload);
    if (failures.length) {
      throw new Error(`Soumission bloquee: conditions non respectees (${failures.slice(0, 3).join(' | ')})`);
    }
    if (totalQty <= 0) {
      throw new Error('Soumission bloquee: ajoutez au moins une quantite strictement positive.');
    }
  }

  const submissionPayload = {
    campaign_id: payload.campaignId,
    phase_key: payload.phaseKey,
    pharmacy_id: pharmacyId,
    status: payload.submit ? 'submitted' : (existingSubmission?.status === 'needs_correction' ? 'needs_correction' : 'draft'),
    submitted_at: payload.submit ? new Date().toISOString() : null,
    admin_correction_note: existingSubmission?.status === 'needs_correction' ? existingSubmission.admin_correction_note ?? null : null,
    total_quantity: totalQty,
    total_amount_ht: Number(totalAmount.toFixed(3)),
  };

  if (existingSubmission) {
    const { error: updateSubmissionError } = await supabase
      .from('campaign_phase_submissions')
      .update(submissionPayload)
      .eq('campaign_id', payload.campaignId)
      .eq('phase_key', payload.phaseKey)
      .eq('pharmacy_id', pharmacyId);
    if (updateSubmissionError) throw new Error(updateSubmissionError.message);
  } else {
    const { error: insertSubmissionError } = await supabase
      .from('campaign_phase_submissions')
      .insert(submissionPayload);
    if (insertSubmissionError) throw new Error(insertSubmissionError.message);
  }

  const { data: submissionRow, error: submissionLookupError } = await supabase
    .from('campaign_phase_submissions')
    .select('id')
    .eq('campaign_id', payload.campaignId)
    .eq('phase_key', payload.phaseKey)
    .eq('pharmacy_id', pharmacyId)
    .maybeSingle();
  if (submissionLookupError) throw new Error(submissionLookupError.message);

  const submissionId = (submissionRow?.id as string | undefined) ?? null;
  if (!submissionId) {
    throw new Error('Impossible de retrouver la soumission apres enregistrement (id manquant).');
  }
  const { error: deleteLinesError } = await supabase
    .from('campaign_phase_submission_lines')
    .delete()
    .eq('submission_id', submissionId);

  if (deleteLinesError) throw new Error(deleteLinesError.message);

  if (linesPayload.length) {
    const { error: insertLinesError } = await supabase
      .from('campaign_phase_submission_lines')
      .insert(linesPayload.map((line) => ({ ...line, submission_id: submissionId })));
    if (insertLinesError) throw new Error(insertLinesError.message);
  }
};

export const listCampaignPhaseSubmissionSummaries = async (campaignId: string, phaseKey: CampaignPhaseKey): Promise<CampaignSubmissionSummary[]> => {
  const { data, error } = await supabase
    .from('campaign_phase_submissions')
    .select('id, pharmacy_id, status, total_quantity, total_amount_ht, submitted_at, updated_at, admin_correction_note')
    .eq('campaign_id', campaignId)
    .eq('phase_key', phaseKey)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  const pharmacyIds = Array.from(new Set((data ?? []).map((row) => row.pharmacy_id as string)));
  const names = await resolvePharmacyNames(pharmacyIds);

  return (data ?? []).map((row) => ({
    submission_id: row.id as string,
    pharmacy_id: row.pharmacy_id as string,
    pharmacy_name: names.get(row.pharmacy_id as string) ?? 'Pharmacie non renseignee',
    status: row.status as 'draft' | 'submitted' | 'needs_correction' | 'accepted',
    total_quantity: Number(row.total_quantity ?? 0),
    total_amount_ht: Number(row.total_amount_ht ?? 0),
    submitted_at: (row.submitted_at as string | null) ?? null,
    updated_at: row.updated_at as string,
  }));
};

export const getCampaignPhaseSubmissionDetail = async (submissionId: string): Promise<CampaignSubmissionDetail> => {
  const { data: submission, error: submissionError } = await supabase
    .from('campaign_phase_submissions')
    .select('id, pharmacy_id, status, total_quantity, total_amount_ht, submitted_at, updated_at, admin_correction_note, reviewed_at')
    .eq('id', submissionId)
    .single();

  if (submissionError) throw new Error(submissionError.message);

  const names = await resolvePharmacyNames([submission.pharmacy_id as string]);

  const { data: lines, error: linesError } = await supabase
    .from('campaign_phase_submission_lines')
    .select('product_id, product_name, campaign_business_unit_id, campaign_group_brand_id, quantity, unit_price_ht, line_total_ht')
    .eq('submission_id', submissionId)
    .order('product_name', { ascending: true });

  if (linesError) throw new Error(linesError.message);
  const parsedCorrection = parseCorrectionPayload(submission.admin_correction_note as string | null);

  return {
    submission_id: submission.id as string,
    pharmacy_id: submission.pharmacy_id as string,
    pharmacy_name: names.get(submission.pharmacy_id as string) ?? 'Pharmacie non renseignee',
    status: submission.status as 'draft' | 'submitted' | 'needs_correction' | 'accepted',
    total_quantity: Number(submission.total_quantity ?? 0),
    total_amount_ht: Number(submission.total_amount_ht ?? 0),
    submitted_at: (submission.submitted_at as string | null) ?? null,
    updated_at: submission.updated_at as string,
    admin_correction_note: parsedCorrection.note,
    reviewed_at: (submission.reviewed_at as string | null) ?? null,
    admin_correction_items: parsedCorrection.items,
    lines: (lines ?? []).map((line) => ({
      product_id: line.product_id as string,
      product_name: line.product_name as string,
      campaign_business_unit_id: (line.campaign_business_unit_id as string | null) ?? null,
      campaign_group_brand_id: (line.campaign_group_brand_id as string | null) ?? null,
      quantity: Number(line.quantity ?? 0),
      unit_price_ht: Number(line.unit_price_ht ?? 0),
      line_total_ht: Number(line.line_total_ht ?? 0),
    })),
  };
};

export const reviewCampaignPhaseSubmission = async (payload: {
  submissionId: string;
  action: 'accept' | 'request_correction';
  note?: string | null;
  correctionItems?: CampaignCorrectionItem[];
}) => {
  const note = payload.note?.trim() ?? null;
  const correctionItems = payload.correctionItems ?? [];
  const updates = payload.action === 'accept'
    ? { status: 'accepted', admin_correction_note: note, reviewed_at: new Date().toISOString() }
    : { status: 'needs_correction', admin_correction_note: encodeCorrectionPayload(note, correctionItems), reviewed_at: new Date().toISOString() };

  const { error } = await supabase
    .from('campaign_phase_submissions')
    .update(updates)
    .eq('id', payload.submissionId);

  if (error) throw new Error(error.message);
};

export const listCampaignSubmissionStatusesByPharmacy = async (campaignId: string): Promise<Record<string, CampaignPharmacyPhaseStatus>> => {
  const { data, error } = await supabase
    .from('campaign_phase_submissions')
    .select('pharmacy_id, phase_key, status, updated_at')
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  const out: Record<string, CampaignPharmacyPhaseStatus> = {};
  for (const row of data ?? []) {
    const pharmacyId = row.pharmacy_id as string;
    const phaseKey = row.phase_key as CampaignPhaseKey;
    const status = row.status as 'draft' | 'submitted' | 'needs_correction' | 'accepted';
    if (!out[pharmacyId]) out[pharmacyId] = {};
    if (!out[pharmacyId][phaseKey]) out[pharmacyId][phaseKey] = status;
  }
  return out;
};

export const saveCampaignPhaseCorrectionTracking = async (payload: {
  submissionId: string;
  note?: string | null;
  correctionItems: CampaignCorrectionItem[];
}) => {
  const { error } = await supabase
    .from('campaign_phase_submissions')
    .update({
      admin_correction_note: encodeCorrectionPayload(payload.note ?? null, payload.correctionItems),
    })
    .eq('id', payload.submissionId);

  if (error) throw new Error(error.message);
};


