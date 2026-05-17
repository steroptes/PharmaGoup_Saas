import { supabase } from '@/lib/supabase';
import {
  CampaignCondition,
  CampaignPhaseKey,
  OrderPlacementMode,
  getCampaignProductConfiguration,
  listBusinessUnitsForLaboratory,
  listCampaignBusinessUnits,
  listCampaignConditions,
  listCampaignGroupBrands,
  listGroupBrandsForLaboratory,
  listManagedProductsForLaboratory,
} from '@/services/campaigns';
import { listCampaignsForPharmacyPortal, resolveCurrentUserPharmacyId } from '@/services/pharmacyCampaigns';
import { listMyPartnerSupplierIds, listSuppliers } from '@/services/suppliers';

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
  submission_id: string | null;
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
  purchase_order_prerequisite_status: 'not_planned' | 'not_accepted' | 'accepted';
  purchase_order_allow_higher_than_intentions: boolean;
  intentions_accepted_quantities_by_product_id: Record<string, number>;
  purchase_order_partner_suppliers: Array<{ id: string; name: string; nature: 'medicament' | 'para' | 'mixte' }>;
  purchase_order_selected_supplier_ids: string[];
  purchase_order_multi_supplier_enabled: boolean;
  purchase_order_line_supplier_allocations: Record<string, Array<{ supplier_id: string; quantity: number }>>;
  purchase_order_delegate_to_admin: boolean;
  purchase_order_order_placement_mode: OrderPlacementMode;
  purchase_order_authorized_supplier_ids: string[];
  purchase_order_can_admin_place_order: boolean;
  purchase_order_can_participant_place_order: boolean;
  purchase_order_dispatch_history: Array<{
    id: string;
    supplier_id: string;
    supplier_name: string;
    actor_role: 'admin' | 'pharmacy_user';
    channel: 'email' | 'sms' | 'whatsapp';
    status: 'sent' | 'failed';
    created_at: string;
  }>;
  purchase_order_has_been_dispatched: boolean;
  purchase_order_supplier_reviews: Array<{
    supplier_id: string;
    supplier_name: string;
    status: SubmissionSupplierReviewStatus;
    admin_note: string | null;
    correction_items: CampaignCorrectionItem[];
    reviewed_at: string | null;
  }>;
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
  campaign_id: string;
  phase_key: CampaignPhaseKey;
  purchase_order_delegate_to_admin: boolean;
  purchase_order_order_placement_mode: OrderPlacementMode;
  purchase_order_multi_supplier_enabled: boolean;
  purchase_order_can_admin_place_order: boolean;
  purchase_order_can_participant_place_order: boolean;
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
      submissionId: null,
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
    submissionId: submission.id as string,
    quantities,
    status: submission.status as 'draft' | 'submitted' | 'needs_correction' | 'accepted',
    updatedAt: (submission.updated_at as string | null) ?? null,
    adminCorrectionNote: parsedCorrection.note,
    adminCorrectionItems: parsedCorrection.items,
  } as const;
};

export type SubmissionSupplierOrderSummary = {
  supplier_id: string;
  supplier_name: string;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  lines_count: number;
};

export type SubmissionSupplierReviewStatus = 'draft' | 'submitted' | 'needs_correction' | 'accepted';

export type SubmissionSupplierReview = {
  supplier_id: string;
  supplier_name: string;
  status: SubmissionSupplierReviewStatus;
  admin_note: string | null;
  correction_items: CampaignCorrectionItem[];
  reviewed_at: string | null;
};

const loadAcceptedSubmissionQuantities = async (campaignId: string, phaseKey: CampaignPhaseKey, pharmacyId: string) => {
  const { data: submission, error: submissionError } = await supabase
    .from('campaign_phase_submissions')
    .select('id, status, updated_at')
    .eq('campaign_id', campaignId)
    .eq('phase_key', phaseKey)
    .eq('pharmacy_id', pharmacyId)
    .eq('status', 'accepted')
    .maybeSingle();

  if (submissionError) throw new Error(submissionError.message);
  if (!submission) {
    return {
      submissionId: null,
      quantities: new Map<string, number>(),
      status: null,
      updatedAt: null,
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

  return {
    submissionId: submission.id as string,
    quantities,
    status: submission.status as 'accepted',
    updatedAt: (submission.updated_at as string | null) ?? null,
  } as const;
};

const isCampaignPhaseEnabledForPharmacy = async (campaignId: string, phaseKey: CampaignPhaseKey, pharmacyId: string) => {
  const { data, error } = await supabase
    .from('campaign_phases')
    .select('is_enabled')
    .eq('campaign_id', campaignId)
    .eq('phase_key', phaseKey)
    .maybeSingle();

  if (!error && typeof data?.is_enabled === 'boolean') return data.is_enabled;

  try {
    const [rpcScoped, explicitScoped] = await Promise.allSettled([
      listCampaignsForPharmacyPortal(),
      listCampaignsForPharmacyPortal(pharmacyId),
    ]);
    const rows: Array<{ campaign_id: string; enabled_phases: CampaignPhaseKey[] }> = [];
    if (rpcScoped.status === 'fulfilled') rows.push(...rpcScoped.value);
    if (explicitScoped.status === 'fulfilled') rows.push(...explicitScoped.value);
    const campaign = rows.find((row) => row.campaign_id === campaignId);
    return Boolean(campaign?.enabled_phases?.includes(phaseKey));
  } catch {
    return false;
  }
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

const getPurchaseOrdersPhaseSettings = async (campaignId: string, pharmacyId: string) => {
  const rpc = await supabase.rpc('get_purchase_orders_phase_settings_for_pharmacy', {
    p_campaign_id: campaignId,
    p_pharmacy_id: pharmacyId,
  });
  if (!rpc.error) {
    const first = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    return {
      allow_higher_than_intentions: Boolean(first?.allow_higher_than_intentions),
      order_placement_mode: ((first?.order_placement_mode as OrderPlacementMode | null) ?? 'participant_choice'),
      multi_supplier_enabled: Boolean(first?.multi_supplier_enabled),
    };
  }

  const fallback = await supabase
    .from('campaign_phases')
    .select('allow_higher_than_intentions, order_placement_mode, multi_supplier_enabled')
    .eq('campaign_id', campaignId)
    .eq('phase_key', 'purchase_orders')
    .maybeSingle();
  if (fallback.error) throw new Error(`Chargement phase BC impossible: ${fallback.error.message}`);
  return {
    allow_higher_than_intentions: Boolean(fallback.data?.allow_higher_than_intentions),
    order_placement_mode: ((fallback.data?.order_placement_mode as OrderPlacementMode | null) ?? 'participant_choice'),
    multi_supplier_enabled: Boolean((fallback.data as any)?.multi_supplier_enabled),
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

  const { submissionId, quantities, status, updatedAt, adminCorrectionNote, adminCorrectionItems } = await loadSubmissionQuantities(campaignId, phaseKey, pharmacyId);
  let initialQuantities = quantities;
  let prefilledFromPhase: CampaignPhaseKey | null = null;
  let prefilledFromStatus: 'draft' | 'submitted' | 'needs_correction' | 'accepted' | null = null;
  let prefilledFromUpdatedAt: string | null = null;
  let purchaseOrderPrerequisiteBlocked = false;
  let purchaseOrderPrerequisiteMessage: string | null = null;
  let purchaseOrderPrerequisiteStatus: 'not_planned' | 'not_accepted' | 'accepted' = 'not_planned';
  let purchaseOrderAllowHigherThanIntentions = false;
  let intentionsAcceptedQuantitiesByProductId: Record<string, number> = {};
  let purchaseOrderPartnerSuppliers: Array<{ id: string; name: string; nature: 'medicament' | 'para' | 'mixte' }> = [];
  let purchaseOrderSelectedSupplierIds: string[] = [];
  let purchaseOrderMultiSupplierEnabled = false;
  let purchaseOrderLineSupplierAllocations: Record<string, Array<{ supplier_id: string; quantity: number }>> = {};
  let purchaseOrderDelegateToAdmin = false;
  let purchaseOrderOrderPlacementMode: OrderPlacementMode = 'participant_choice';
  let purchaseOrderAuthorizedSupplierIds: string[] = [];
  let purchaseOrderCanAdminPlaceOrder = false;
  let purchaseOrderCanParticipantPlaceOrder = false;
  let purchaseOrderDispatchHistory: CampaignDynamicFormPayload['purchase_order_dispatch_history'] = [];
  let purchaseOrderHasBeenDispatched = false;
  let purchaseOrderSupplierReviews: CampaignDynamicFormPayload['purchase_order_supplier_reviews'] = [];

  // Purchase order can inherit latest purchase intentions lines when no PO draft exists yet.
  if (phaseKey === 'purchase_orders') {
    const intentionsPhaseEnabled = await isCampaignPhaseEnabledForPharmacy(campaignId, 'purchase_intentions', pharmacyId);
    const purchaseOrdersPhase = await getPurchaseOrdersPhaseSettings(campaignId, pharmacyId);
    purchaseOrderAllowHigherThanIntentions = Boolean(purchaseOrdersPhase?.allow_higher_than_intentions);
    purchaseOrderOrderPlacementMode = ((purchaseOrdersPhase?.order_placement_mode as OrderPlacementMode | null) ?? 'participant_choice');
    purchaseOrderMultiSupplierEnabled = Boolean(purchaseOrdersPhase?.multi_supplier_enabled);
    purchaseOrderCanAdminPlaceOrder = purchaseOrderOrderPlacementMode !== 'participant_only';
    purchaseOrderCanParticipantPlaceOrder = purchaseOrderOrderPlacementMode !== 'admin_only';

    const { data: authorizedRows } = await supabase
      .from('campaign_phase_authorized_suppliers')
      .select('supplier_id')
      .eq('campaign_id', campaignId)
      .eq('phase_key', 'purchase_orders');
    purchaseOrderAuthorizedSupplierIds = (authorizedRows ?? []).map((row) => row.supplier_id as string);

    if (intentionsPhaseEnabled) {
      const acceptedIntentionsSubmission = await loadAcceptedSubmissionQuantities(campaignId, 'purchase_intentions', pharmacyId);
      purchaseOrderPrerequisiteStatus = acceptedIntentionsSubmission.status === 'accepted' ? 'accepted' : 'not_accepted';
      intentionsAcceptedQuantitiesByProductId = Object.fromEntries(acceptedIntentionsSubmission.quantities.entries());
      if (acceptedIntentionsSubmission.status !== 'accepted') {
        purchaseOrderPrerequisiteBlocked = true;
        purchaseOrderPrerequisiteMessage = 'Soumission BC bloquee: les intentions d\'achat doivent etre acceptees par les admins.';
      }
    }

    try {
      const [partnerIds, suppliers] = await Promise.all([
        listMyPartnerSupplierIds(pharmacyId),
        listSuppliers(),
      ]);
      const partnerSet = new Set(partnerIds);
      const authorizedSet = new Set(purchaseOrderAuthorizedSupplierIds);
      purchaseOrderPartnerSuppliers = suppliers
        .filter((supplier) => supplier.is_active && partnerSet.has(supplier.id))
        .filter((supplier) => !authorizedSet.size || authorizedSet.has(supplier.id))
        .map((supplier) => ({ id: supplier.id, name: supplier.name, nature: supplier.nature }));
    } catch {
      purchaseOrderPartnerSuppliers = [];
    }

    const { data: existingSubmission } = await supabase
      .from('campaign_phase_submissions')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('phase_key', 'purchase_orders')
      .eq('pharmacy_id', pharmacyId)
      .maybeSingle();
    if (existingSubmission?.id) {
      const { data: selectedRows } = await supabase
        .from('campaign_phase_submission_suppliers')
        .select('supplier_id')
        .eq('submission_id', existingSubmission.id);
      purchaseOrderSelectedSupplierIds = (selectedRows ?? []).map((row) => row.supplier_id as string);
      const { data: submissionMeta } = await supabase
        .from('campaign_phase_submissions')
        .select('delegate_order_to_admin')
        .eq('id', existingSubmission.id)
        .maybeSingle();
      purchaseOrderDelegateToAdmin = Boolean(submissionMeta?.delegate_order_to_admin);
      const { data: dispatchRows } = await supabase
        .from('purchase_order_dispatches')
        .select('id, supplier_id, actor_role, channel, status, created_at')
        .eq('submission_id', existingSubmission.id)
        .order('created_at', { ascending: false });
      if (dispatchRows?.length) {
        const names = new Map(purchaseOrderPartnerSuppliers.map((s) => [s.id, s.name]));
        purchaseOrderDispatchHistory = dispatchRows.map((row) => ({
          id: row.id as string,
          supplier_id: row.supplier_id as string,
          supplier_name: names.get(row.supplier_id as string) ?? 'Fournisseur',
          actor_role: row.actor_role as 'admin' | 'pharmacy_user',
          channel: row.channel as 'email' | 'sms' | 'whatsapp',
          status: row.status as 'sent' | 'failed',
          created_at: row.created_at as string,
        }));
        purchaseOrderHasBeenDispatched = purchaseOrderDispatchHistory.length > 0;
      }
      if (submissionId) {
        try {
          purchaseOrderSupplierReviews = await listSubmissionSupplierReviews(submissionId);
        } catch {
          purchaseOrderSupplierReviews = [];
        }
      }
      const allocationResponse = await supabase
        .from('campaign_phase_submission_line_suppliers')
        .select('product_id, supplier_id, quantity')
        .eq('submission_id', existingSubmission.id);
      if (allocationResponse.error) {
        throw new Error(`Chargement repartition multi-fournisseurs impossible: ${allocationResponse.error.message}`);
      }
      for (const row of allocationResponse.data ?? []) {
        const productId = row.product_id as string;
        const entry = purchaseOrderLineSupplierAllocations[productId] ?? [];
        entry.push({
          supplier_id: row.supplier_id as string,
          quantity: Number(row.quantity ?? 0),
        });
        purchaseOrderLineSupplierAllocations[productId] = entry;
      }
    }
  }

  if (phaseKey === 'purchase_orders' && status === null) {
    const intentionsPhaseEnabled = await isCampaignPhaseEnabledForPharmacy(campaignId, 'purchase_intentions', pharmacyId);

    if (intentionsPhaseEnabled) {
      const acceptedIntentionsSubmission = await loadAcceptedSubmissionQuantities(campaignId, 'purchase_intentions', pharmacyId);
      if (acceptedIntentionsSubmission.quantities.size > 0) {
        initialQuantities = acceptedIntentionsSubmission.quantities;
        prefilledFromPhase = 'purchase_intentions';
        prefilledFromStatus = acceptedIntentionsSubmission.status;
        prefilledFromUpdatedAt = acceptedIntentionsSubmission.updatedAt;
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
    submission_id: submissionId,
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
    purchase_order_allow_higher_than_intentions: purchaseOrderAllowHigherThanIntentions,
    intentions_accepted_quantities_by_product_id: intentionsAcceptedQuantitiesByProductId,
    purchase_order_partner_suppliers: purchaseOrderPartnerSuppliers,
    purchase_order_selected_supplier_ids: purchaseOrderSelectedSupplierIds,
    purchase_order_multi_supplier_enabled: purchaseOrderMultiSupplierEnabled,
    purchase_order_line_supplier_allocations: purchaseOrderLineSupplierAllocations,
    purchase_order_delegate_to_admin: purchaseOrderDelegateToAdmin,
    purchase_order_order_placement_mode: purchaseOrderOrderPlacementMode,
    purchase_order_authorized_supplier_ids: purchaseOrderAuthorizedSupplierIds,
    purchase_order_can_admin_place_order: purchaseOrderCanAdminPlaceOrder,
    purchase_order_can_participant_place_order: purchaseOrderCanParticipantPlaceOrder,
    purchase_order_dispatch_history: purchaseOrderDispatchHistory,
    purchase_order_has_been_dispatched: purchaseOrderHasBeenDispatched,
    purchase_order_supplier_reviews: purchaseOrderSupplierReviews,
    admin_correction_note: adminCorrectionNote,
    admin_correction_items: adminCorrectionItems,
  };
};

export const saveCampaignDynamicForm = async (payload: {
  campaignId: string;
  phaseKey: CampaignPhaseKey;
  pharmacyId?: string | null;
  quantitiesByProductId: Record<string, number>;
  selectedSupplierIds?: string[];
  lineSupplierAllocationsByProductId?: Record<string, Array<{ supplier_id: string; quantity: number }>>;
  delegateOrderToAdmin?: boolean;
  submit: boolean;
}) => {
  const pharmacyId = payload.pharmacyId ?? await resolveCurrentUserPharmacyId();
  if (!pharmacyId) throw new Error('Pharmacie introuvable pour l\'utilisateur courant.');

  await ensurePhaseEnabled(payload.campaignId, payload.phaseKey);
  await ensureAcceptedParticipant(payload.campaignId, pharmacyId);
  const { data: existingSubmission, error: existingSubmissionError } = await supabase
    .from('campaign_phase_submissions')
    .select('id, status, admin_correction_note')
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
    if (existingSubmission?.id && existingSubmission.status === 'needs_correction') {
      const parsedCorrection = parseCorrectionPayload(existingSubmission.admin_correction_note as string | null);
      const unresolvedCount = parsedCorrection.items.filter((item) => !item.resolved).length;
      if (unresolvedCount > 0) {
        const { data: existingLines, error: existingLinesError } = await supabase
          .from('campaign_phase_submission_lines')
          .select('product_id, quantity')
          .eq('submission_id', existingSubmission.id);
        if (existingLinesError) throw new Error(existingLinesError.message);

        const previousQuantities = new Map<string, number>();
        for (const line of existingLines ?? []) {
          previousQuantities.set(line.product_id as string, Number(line.quantity ?? 0));
        }

        const hasAtLeastOneChange = effectiveProductIds.some((productId) => {
          const prev = previousQuantities.get(productId) ?? 0;
          const next = Math.max(0, Number(payload.quantitiesByProductId[productId] ?? 0));
          return !approxEqual(prev, next);
        });

        if (!hasAtLeastOneChange) {
          throw new Error('Resoumission rectification bloquee: aucune modification detectee sur les quantites.');
        }
      }
    }

    if (payload.phaseKey === 'purchase_orders') {
      const intentionsPhaseEnabled = await isCampaignPhaseEnabledForPharmacy(payload.campaignId, 'purchase_intentions', pharmacyId);
      const purchaseOrdersPhase = await getPurchaseOrdersPhaseSettings(payload.campaignId, pharmacyId);
      const orderPlacementMode = ((purchaseOrdersPhase?.order_placement_mode as OrderPlacementMode | null) ?? 'participant_choice');
      const multiSupplierEnabled = Boolean(purchaseOrdersPhase?.multi_supplier_enabled);
      if (intentionsPhaseEnabled) {
        const acceptedIntentionsSubmission = await loadAcceptedSubmissionQuantities(payload.campaignId, 'purchase_intentions', pharmacyId);
        if (acceptedIntentionsSubmission.status !== 'accepted') {
          throw new Error('Soumission BC bloquee: les intentions d\'achat doivent etre acceptees avant le bon de commande.');
        }
        const allowHigher = Boolean(purchaseOrdersPhase?.allow_higher_than_intentions);
        if (!allowHigher) {
          const overLimitLines = linesPayload
            .filter((line) => line.quantity > (acceptedIntentionsSubmission.quantities.get(line.product_id) ?? 0))
            .map((line) => line.product_name);
          if (overLimitLines.length) {
            throw new Error(`Soumission BC bloquee: quantites superieures aux intentions acceptees (${overLimitLines.slice(0, 3).join(' | ')}).`);
          }
        }
      }

      const selectedSupplierIds = Array.from(new Set((payload.selectedSupplierIds ?? []).filter(Boolean)));
      if (!selectedSupplierIds.length) {
        throw new Error('Soumission BC bloquee: choisissez un fournisseur partenaire.');
      }
      if (!multiSupplierEnabled && selectedSupplierIds.length !== 1) {
        throw new Error('Soumission BC bloquee: selectionnez un seul fournisseur pour cette commande.');
      }
      const { data: authorizedRows } = await supabase
        .from('campaign_phase_authorized_suppliers')
        .select('supplier_id')
        .eq('campaign_id', payload.campaignId)
        .eq('phase_key', 'purchase_orders');
      const authorizedIds = new Set((authorizedRows ?? []).map((row) => row.supplier_id as string));
      if (authorizedIds.size > 0) {
        const unauthorized = selectedSupplierIds.filter((supplierId) => !authorizedIds.has(supplierId));
        if (unauthorized.length) {
          throw new Error('Soumission BC bloquee: certains fournisseurs selectionnes ne sont pas autorises pour cette campagne.');
        }
      }
      if (orderPlacementMode === 'admin_only' && !payload.delegateOrderToAdmin) {
        throw new Error('Soumission BC bloquee: le passage de commande est reserve a l\'administrateur.');
      }
      if (orderPlacementMode === 'participant_only' && payload.delegateOrderToAdmin) {
        throw new Error('Soumission BC bloquee: le passage de commande doit etre effectue par le participant.');
      }

      if (multiSupplierEnabled) {
        const allocations = payload.lineSupplierAllocationsByProductId ?? {};
        const selectedSet = new Set(selectedSupplierIds);
        for (const line of linesPayload) {
          const entries = (allocations[line.product_id] ?? [])
            .map((entry) => ({
              supplier_id: entry.supplier_id,
              quantity: Math.max(0, Number(entry.quantity ?? 0)),
            }))
            .filter((entry) => !!entry.supplier_id && entry.quantity > 0);
          if (!entries.length) {
            throw new Error(`Soumission BC bloquee: repartition manquante pour ${line.product_name}.`);
          }
          const badSupplier = entries.find((entry) => !selectedSet.has(entry.supplier_id));
          if (badSupplier) {
            throw new Error(`Soumission BC bloquee: fournisseur non selectionne dans la repartition de ${line.product_name}.`);
          }
          const allocatedQty = entries.reduce((sum, entry) => sum + entry.quantity, 0);
          if (!approxEqual(allocatedQty, line.quantity)) {
            throw new Error(`Soumission BC bloquee: repartition incoherente pour ${line.product_name} (attendu ${line.quantity}, obtenu ${allocatedQty.toFixed(3)}).`);
          }
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
    // Preserve correction tracking until an explicit admin review decision updates it.
    admin_correction_note: existingSubmission?.admin_correction_note ?? null,
    delegate_order_to_admin: payload.phaseKey === 'purchase_orders' ? Boolean(payload.delegateOrderToAdmin) : false,
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

  if (payload.phaseKey === 'purchase_orders') {
    const purchaseOrdersPhase = await getPurchaseOrdersPhaseSettings(payload.campaignId, pharmacyId);
    const multiSupplierEnabled = Boolean(purchaseOrdersPhase.multi_supplier_enabled);
    const selectedSupplierIds = Array.from(new Set((payload.selectedSupplierIds ?? []).filter(Boolean)));
    const { error: deleteSelectedSuppliersError } = await supabase
      .from('campaign_phase_submission_suppliers')
      .delete()
      .eq('submission_id', submissionId);
    if (deleteSelectedSuppliersError) throw new Error(deleteSelectedSuppliersError.message);

    if (selectedSupplierIds.length) {
      const { error: insertSelectedSuppliersError } = await supabase
        .from('campaign_phase_submission_suppliers')
        .insert(selectedSupplierIds.map((supplierId) => ({ submission_id: submissionId, supplier_id: supplierId })));
      if (insertSelectedSuppliersError) throw new Error(insertSelectedSuppliersError.message);
    }

    const { error: deleteAllocationsError } = await supabase
      .from('campaign_phase_submission_line_suppliers')
      .delete()
      .eq('submission_id', submissionId);
    if (deleteAllocationsError && !deleteAllocationsError.message.toLowerCase().includes('campaign_phase_submission_line_suppliers')) {
      throw new Error(deleteAllocationsError.message);
    }

    if (multiSupplierEnabled) {
      const allocations = payload.lineSupplierAllocationsByProductId ?? {};
      const rows = Object.entries(allocations).flatMap(([productId, entries]) =>
        (entries ?? [])
          .map((entry) => ({
            product_id: productId,
            supplier_id: entry.supplier_id,
            quantity: Math.max(0, Number(entry.quantity ?? 0)),
          }))
          .filter((entry) => !!entry.supplier_id && entry.quantity > 0)
          .map((entry) => ({
            submission_id: submissionId,
            product_id: entry.product_id,
            supplier_id: entry.supplier_id,
            quantity: Number(entry.quantity.toFixed(3)),
          })),
      );
      if (rows.length) {
        const { error: insertAllocationsError } = await supabase
          .from('campaign_phase_submission_line_suppliers')
          .insert(rows);
        if (insertAllocationsError) throw new Error(insertAllocationsError.message);
      }
    }
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
    .select('id, campaign_id, phase_key, pharmacy_id, status, total_quantity, total_amount_ht, submitted_at, updated_at, admin_correction_note, reviewed_at, delegate_order_to_admin')
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
  let orderPlacementMode: OrderPlacementMode = 'participant_choice';
  let multiSupplierEnabled = false;
  if ((submission.phase_key as CampaignPhaseKey) === 'purchase_orders') {
    const { data: phaseRow } = await supabase
      .from('campaign_phases')
      .select('order_placement_mode, multi_supplier_enabled')
      .eq('campaign_id', submission.campaign_id as string)
      .eq('phase_key', 'purchase_orders')
      .maybeSingle();
    orderPlacementMode = ((phaseRow?.order_placement_mode as OrderPlacementMode | null) ?? 'participant_choice');
    multiSupplierEnabled = Boolean((phaseRow as any)?.multi_supplier_enabled ?? false);
  }
  const canAdminPlace = orderPlacementMode !== 'participant_only';
  const canParticipantPlace = orderPlacementMode !== 'admin_only';

  return {
    submission_id: submission.id as string,
    pharmacy_id: submission.pharmacy_id as string,
    campaign_id: submission.campaign_id as string,
    phase_key: submission.phase_key as CampaignPhaseKey,
    purchase_order_delegate_to_admin: Boolean(submission.delegate_order_to_admin),
    purchase_order_order_placement_mode: orderPlacementMode,
    purchase_order_multi_supplier_enabled: multiSupplierEnabled,
    purchase_order_can_admin_place_order: canAdminPlace,
    purchase_order_can_participant_place_order: canParticipantPlace,
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
  action: 'accept' | 'request_correction' | 'unfreeze';
  note?: string | null;
  correctionItems?: CampaignCorrectionItem[];
}) => {
  const note = payload.note?.trim() ?? null;
  const correctionItems = payload.correctionItems ?? [];
  const { data: currentSubmission, error: currentSubmissionError } = await supabase
    .from('campaign_phase_submissions')
    .select('status, phase_key, campaign_id, pharmacy_id, admin_correction_note')
    .eq('id', payload.submissionId)
    .single();
  if (currentSubmissionError) throw new Error(currentSubmissionError.message);

  if (payload.action === 'accept') {
    const parsed = parseCorrectionPayload((currentSubmission.admin_correction_note as string | null) ?? null);
    const unresolvedCount = parsed.items.filter((item) => !item.resolved).length;
    if (unresolvedCount > 0) {
      throw new Error(`Acceptation impossible: ${unresolvedCount} rectification(s) reste(nt) a verifier.`);
    }

    if ((currentSubmission.phase_key as CampaignPhaseKey) === 'purchase_orders') {
      const selectedSuppliers = await listSubmissionSelectedSuppliers(payload.submissionId);
      if (selectedSuppliers.length > 0) {
        const { data: reviews, error: reviewsError } = await supabase
          .from('campaign_phase_submission_supplier_reviews')
          .select('supplier_id, status, correction_items')
          .eq('submission_id', payload.submissionId);
        if (reviewsError) throw new Error(reviewsError.message);

        const reviewBySupplier = new Map<string, { status: SubmissionSupplierReviewStatus; correction_items: CampaignCorrectionItem[] }>(
          (reviews ?? []).map((row: any) => [
            row.supplier_id as string,
            {
              status: (row.status as SubmissionSupplierReviewStatus) ?? 'submitted',
              correction_items: Array.isArray(row.correction_items) ? (row.correction_items as CampaignCorrectionItem[]) : [],
            },
          ]),
        );
        const notAcceptedSuppliers = selectedSuppliers.filter((supplier) => (reviewBySupplier.get(supplier.supplier_id)?.status ?? 'submitted') !== 'accepted');

        // Convenience path: in split mode with a single supplier, accept sub-BC and global BC together.
        if (notAcceptedSuppliers.length === 1 && selectedSuppliers.length === 1) {
          const onlySupplier = notAcceptedSuppliers[0];
          const onlySupplierReview = reviewBySupplier.get(onlySupplier.supplier_id);
          const unresolvedSupplier = (onlySupplierReview?.correction_items ?? []).filter((item) => !item.resolved).length;
          if (unresolvedSupplier > 0) {
            throw new Error(`Acceptation impossible: ${unresolvedSupplier} rectification(s) fournisseur reste(nt) a verifier.`);
          }

          const { data: currentUser } = await supabase.auth.getUser();
          const actorUserId = currentUser.user?.id ?? null;
          const { error: autoAcceptSupplierError } = await supabase
            .from('campaign_phase_submission_supplier_reviews')
            .upsert({
              submission_id: payload.submissionId,
              supplier_id: onlySupplier.supplier_id,
              status: 'accepted',
              reviewed_at: new Date().toISOString(),
              reviewed_by: actorUserId,
            }, {
              onConflict: 'submission_id,supplier_id',
            });
          if (autoAcceptSupplierError) throw new Error(autoAcceptSupplierError.message);
        } else if (notAcceptedSuppliers.length > 0) {
          throw new Error('Acceptation impossible: tous les sous-BC fournisseurs doivent etre acceptes avant d accepter le BC global.');
        }
      }
    }
  }

  if (payload.action === 'unfreeze' && currentSubmission.status !== 'accepted') {
    throw new Error('Defige impossible: seule une soumission acceptee peut etre defigee.');
  }
  if (payload.action === 'unfreeze' && currentSubmission.phase_key === 'purchase_intentions') {
    const { data: purchaseOrderSubmission, error: purchaseOrderSubmissionError } = await supabase
      .from('campaign_phase_submissions')
      .select('status')
      .eq('campaign_id', currentSubmission.campaign_id as string)
      .eq('pharmacy_id', currentSubmission.pharmacy_id as string)
      .eq('phase_key', 'purchase_orders')
      .maybeSingle();
    if (purchaseOrderSubmissionError) throw new Error(purchaseOrderSubmissionError.message);

    const purchaseOrderStatus = purchaseOrderSubmission?.status as 'draft' | 'submitted' | 'needs_correction' | 'accepted' | null | undefined;
    if (purchaseOrderStatus === 'submitted' || purchaseOrderStatus === 'needs_correction' || purchaseOrderStatus === 'accepted') {
      throw new Error('Defige des intentions impossible: le bon de commande de cette campagne est deja engage (soumis/rectification/accepte).');
    }
  }

  const updates = payload.action === 'accept'
    ? { status: 'accepted', admin_correction_note: note, reviewed_at: new Date().toISOString() }
    : payload.action === 'unfreeze'
      ? { status: 'needs_correction', admin_correction_note: note, reviewed_at: new Date().toISOString() }
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

const recomputeSubmissionStatusFromSupplierReviews = async (submissionId: string) => {
  const { data: reviews, error: reviewsError } = await supabase
    .from('campaign_phase_submission_supplier_reviews')
    .select('supplier_id, status')
    .eq('submission_id', submissionId);
  if (reviewsError) throw new Error(reviewsError.message);
  const selectedSuppliers = await listSubmissionSelectedSuppliers(submissionId);
  const reviewStatusesBySupplier = new Map<string, SubmissionSupplierReviewStatus>(
    (reviews ?? []).map((row) => [row.supplier_id as string, (row.status as SubmissionSupplierReviewStatus) ?? 'submitted']),
  );
  const statuses = selectedSuppliers.length
    ? selectedSuppliers.map((supplier) => reviewStatusesBySupplier.get(supplier.supplier_id) ?? 'submitted')
    : Array.from(reviewStatusesBySupplier.values());
  if (!statuses.length) return;

  let nextStatus: 'draft' | 'submitted' | 'needs_correction' | 'accepted' = 'submitted';
  if (statuses.every((status) => status === 'accepted')) nextStatus = 'accepted';
  else if (statuses.some((status) => status === 'needs_correction')) nextStatus = 'needs_correction';
  else if (statuses.every((status) => status === 'draft')) nextStatus = 'draft';
  else if (statuses.some((status) => status === 'accepted')) nextStatus = 'needs_correction';

  const { error: updateError } = await supabase
    .from('campaign_phase_submissions')
    .update({ status: nextStatus, reviewed_at: new Date().toISOString() })
    .eq('id', submissionId);
  if (updateError) throw new Error(updateError.message);
};

export const listSubmissionSupplierReviews = async (submissionId: string): Promise<SubmissionSupplierReview[]> => {
  const [selectedSuppliers, reviewRows] = await Promise.all([
    listSubmissionSelectedSuppliers(submissionId),
    supabase
      .from('campaign_phase_submission_supplier_reviews')
      .select('supplier_id, status, admin_note, correction_items, reviewed_at')
      .eq('submission_id', submissionId),
  ]);
  if (reviewRows.error) throw new Error(reviewRows.error.message);

  const reviewBySupplier = new Map(
    (reviewRows.data ?? []).map((row) => [row.supplier_id as string, row]),
  );
  return selectedSuppliers.map((supplier) => {
    const review = reviewBySupplier.get(supplier.supplier_id);
    return {
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      status: (review?.status as SubmissionSupplierReviewStatus | undefined) ?? 'submitted',
      admin_note: (review?.admin_note as string | null | undefined) ?? null,
      correction_items: Array.isArray((review as any)?.correction_items)
        ? ((review as any).correction_items as CampaignCorrectionItem[]).map((item) => ({
          id: item.id ?? makeCorrectionId(),
          scope_type: item.scope_type ?? 'campaign',
          campaign_business_unit_id: item.campaign_business_unit_id ?? null,
          campaign_group_brand_id: item.campaign_group_brand_id ?? null,
          product_id: item.product_id ?? null,
          message: item.message ?? '',
          resolved: Boolean(item.resolved),
          resolved_at: item.resolved_at ?? null,
        }))
        : [],
      reviewed_at: (review?.reviewed_at as string | null | undefined) ?? null,
    };
  });
};

export const reviewSubmissionSupplierOrder = async (payload: {
  submissionId: string;
  supplierId: string;
  action: 'accept' | 'request_correction' | 'reset_to_submitted';
  note?: string | null;
  correctionItems?: CampaignCorrectionItem[];
}) => {
  const { data: roleData, error: roleError } = await supabase.rpc('current_user_role');
  if (roleError) throw new Error(roleError.message);
  if ((roleData as string | null) !== 'admin') throw new Error('Action reservee aux administrateurs.');

  const nextStatus: SubmissionSupplierReviewStatus = payload.action === 'accept'
    ? 'accepted'
    : payload.action === 'request_correction'
      ? 'needs_correction'
      : 'submitted';

  const { data: currentUser } = await supabase.auth.getUser();
  const actorUserId = currentUser.user?.id ?? null;

  const correctionItems = payload.correctionItems ?? [];
  if (payload.action === 'accept') {
    const selectedSuppliers = await listSubmissionSelectedSuppliers(payload.submissionId);
    const { data: submissionRow, error: submissionError } = await supabase
      .from('campaign_phase_submissions')
      .select('admin_correction_note')
      .eq('id', payload.submissionId)
      .single();
    if (submissionError) throw new Error(submissionError.message);

    const { data: currentReview } = await supabase
      .from('campaign_phase_submission_supplier_reviews')
      .select('correction_items, status')
      .eq('submission_id', payload.submissionId)
      .eq('supplier_id', payload.supplierId)
      .maybeSingle();
    const items = Array.isArray((currentReview as any)?.correction_items) ? ((currentReview as any).correction_items as CampaignCorrectionItem[]) : [];
    const unresolved = items.filter((item) => !item.resolved).length;
    if (unresolved > 0) throw new Error(`Acceptation impossible: ${unresolved} rectification(s) fournisseur reste(nt) a verifier.`);

    const { data: allReviews, error: allReviewsError } = await supabase
      .from('campaign_phase_submission_supplier_reviews')
      .select('supplier_id, status')
      .eq('submission_id', payload.submissionId);
    if (allReviewsError) throw new Error(allReviewsError.message);
    const statusBySupplier = new Map<string, SubmissionSupplierReviewStatus>(
      (allReviews ?? []).map((row) => [row.supplier_id as string, (row.status as SubmissionSupplierReviewStatus) ?? 'submitted']),
    );
    statusBySupplier.set(payload.supplierId, 'accepted');
    const remainingSuppliers = selectedSuppliers.filter((supplier) => (statusBySupplier.get(supplier.supplier_id) ?? 'submitted') !== 'accepted');
    const isLastSupplierToAccept = remainingSuppliers.length === 0;
    if (isLastSupplierToAccept) {
      const globalCorrections = parseCorrectionPayload((submissionRow?.admin_correction_note as string | null) ?? null).items;
      const unresolvedGlobal = globalCorrections.filter((item) => !item.resolved).length;
      if (unresolvedGlobal > 0) {
        throw new Error(`Acceptation impossible: ${unresolvedGlobal} rectification(s) generale(s) reste(nt) a verifier.`);
      }
    }
  }

  const { error: upsertError } = await supabase
    .from('campaign_phase_submission_supplier_reviews')
    .upsert({
      submission_id: payload.submissionId,
      supplier_id: payload.supplierId,
      status: nextStatus,
      admin_note: payload.note?.trim() ?? null,
      correction_items: payload.action === 'request_correction' ? correctionItems : undefined,
      reviewed_at: new Date().toISOString(),
      reviewed_by: actorUserId,
    }, {
      onConflict: 'submission_id,supplier_id',
    });
  if (upsertError) throw new Error(upsertError.message);

  await recomputeSubmissionStatusFromSupplierReviews(payload.submissionId);
};

export const saveSubmissionSupplierCorrectionTracking = async (payload: {
  submissionId: string;
  supplierId: string;
  note?: string | null;
  correctionItems: CampaignCorrectionItem[];
}) => {
  const { data: currentUser } = await supabase.auth.getUser();
  const actorUserId = currentUser.user?.id ?? null;
  const { error } = await supabase
    .from('campaign_phase_submission_supplier_reviews')
    .upsert({
      submission_id: payload.submissionId,
      supplier_id: payload.supplierId,
      status: 'needs_correction',
      admin_note: payload.note?.trim() ?? null,
      correction_items: payload.correctionItems,
      reviewed_at: new Date().toISOString(),
      reviewed_by: actorUserId,
    }, {
      onConflict: 'submission_id,supplier_id',
    });
  if (error) throw new Error(error.message);
  await recomputeSubmissionStatusFromSupplierReviews(payload.submissionId);
};

export const dispatchPurchaseOrderToSuppliers = async (payload: {
  submissionId: string;
  supplierIds: string[];
  channel: 'email' | 'sms' | 'whatsapp';
  attachment?: {
    file_name: string;
    mime_type: string;
    base64: string;
  } | null;
}) => {
  const supplierIds = Array.from(new Set(payload.supplierIds.filter(Boolean)));
  if (!supplierIds.length) throw new Error('Aucun fournisseur cible.');

  const { data: submission, error: submissionError } = await supabase
    .from('campaign_phase_submissions')
    .select('id, campaign_id, pharmacy_id, phase_key, status, delegate_order_to_admin')
    .eq('id', payload.submissionId)
    .single();
  if (submissionError) throw new Error(submissionError.message);
  if ((submission.phase_key as CampaignPhaseKey) !== 'purchase_orders') throw new Error('Action reservee aux bons de commande.');
  if ((submission.status as string) !== 'accepted') throw new Error('Envoi impossible: le BC doit etre accepte.');

  const { data: phaseRow, error: phaseError } = await supabase
    .from('campaign_phases')
    .select('order_placement_mode')
    .eq('campaign_id', submission.campaign_id as string)
    .eq('phase_key', 'purchase_orders')
    .maybeSingle();
  if (phaseError) throw new Error(phaseError.message);
  const orderPlacementMode = ((phaseRow?.order_placement_mode as OrderPlacementMode | null) ?? 'participant_choice');

  const { data: roleData, error: roleError } = await supabase.rpc('current_user_role');
  if (roleError) throw new Error(roleError.message);
  const actorRole = roleData as 'admin' | 'pharmacy_user' | null;
  if (!actorRole) throw new Error('Role utilisateur introuvable.');

  const canAdmin = orderPlacementMode !== 'participant_only';
  const canParticipant = orderPlacementMode !== 'admin_only';
  if (actorRole === 'admin' && !canAdmin) throw new Error('Action non autorisee: passage de commande reserve au participant.');
  if (actorRole === 'pharmacy_user' && !canParticipant) throw new Error('Action non autorisee: passage de commande reserve a l\'administrateur.');
  if (actorRole === 'admin' && orderPlacementMode === 'participant_choice' && !Boolean(submission.delegate_order_to_admin)) {
    throw new Error('Action non autorisee: le participant n\'a pas delegue le passage de commande.');
  }

  const { data: authorizedRows, error: authorizedError } = await supabase
    .from('campaign_phase_authorized_suppliers')
    .select('supplier_id')
    .eq('campaign_id', submission.campaign_id as string)
    .eq('phase_key', 'purchase_orders');
  if (authorizedError) throw new Error(authorizedError.message);
  const authorizedSet = new Set((authorizedRows ?? []).map((row) => row.supplier_id as string));
  if (authorizedSet.size > 0) {
    const unauthorized = supplierIds.filter((supplierId) => !authorizedSet.has(supplierId));
    if (unauthorized.length) throw new Error('Action non autorisee: certains fournisseurs ne sont pas autorises pour cette campagne.');
  }

  const { data: selectedRows, error: selectedError } = await supabase
    .from('campaign_phase_submission_suppliers')
    .select('supplier_id')
    .eq('submission_id', submission.id as string);
  if (selectedError) throw new Error(selectedError.message);
  const selectedSet = new Set((selectedRows ?? []).map((row) => row.supplier_id as string));
  const notSelected = supplierIds.filter((supplierId) => !selectedSet.has(supplierId));
  if (notSelected.length) throw new Error('Action impossible: certains fournisseurs ne sont pas associes a ce BC.');

  const { data: currentUser } = await supabase.auth.getUser();
  const actorUserId = currentUser.user?.id;
  if (!actorUserId) throw new Error('Utilisateur non authentifie.');

  const { error: insertError } = await supabase
    .from('purchase_order_dispatches')
    .insert(supplierIds.map((supplierId) => ({
      submission_id: submission.id as string,
      supplier_id: supplierId,
      actor_user_id: actorUserId,
      actor_role: actorRole,
      channel: payload.channel,
      status: 'sent',
      payload: {
        message: 'Dispatch enregistre depuis l\'application (provider externe non branche).',
        attachment: payload.attachment ?? null,
      },
    })));
  if (insertError) throw new Error(insertError.message);

  const { error: auditError } = await supabase
    .from('audit_logs')
    .insert({
      user_id: actorUserId,
      entity_type: 'campaign_phase_submission',
      entity_id: submission.id as string,
      action: actorRole === 'admin' ? 'purchase_order_dispatched_by_admin' : 'purchase_order_dispatched_by_participant',
      details: {
        submission_id: submission.id,
        channel: payload.channel,
        supplier_ids: supplierIds,
      },
    });
  if (auditError) {
    // keep non-blocking
  }
};

export const markPurchaseOrderAsPassedByAdmin = async (payload: {
  submissionId: string;
  supplierId: string;
  channel: 'email' | 'sms' | 'whatsapp';
}) => {
  const { data: roleData, error: roleError } = await supabase.rpc('current_user_role');
  if (roleError) throw new Error(roleError.message);
  if ((roleData as string | null) !== 'admin') throw new Error('Action reservee aux administrateurs.');

  const { data: submission, error: submissionError } = await supabase
    .from('campaign_phase_submissions')
    .select('id, phase_key, status')
    .eq('id', payload.submissionId)
    .single();
  if (submissionError) throw new Error(submissionError.message);
  if ((submission.phase_key as CampaignPhaseKey) !== 'purchase_orders') throw new Error('Action reservee aux bons de commande.');
  if ((submission.status as string) !== 'accepted') throw new Error('Action impossible: le BC doit etre accepte.');

  const { data: selectedRows, error: selectedError } = await supabase
    .from('campaign_phase_submission_suppliers')
    .select('supplier_id')
    .eq('submission_id', submission.id as string);
  if (selectedError) throw new Error(selectedError.message);
  const selectedSet = new Set((selectedRows ?? []).map((row) => row.supplier_id as string));
  if (!selectedSet.has(payload.supplierId)) throw new Error('Fournisseur non associe a ce BC.');

  const { data: currentUser } = await supabase.auth.getUser();
  const actorUserId = currentUser.user?.id;
  if (!actorUserId) throw new Error('Utilisateur non authentifie.');

  const { error: insertError } = await supabase
    .from('purchase_order_dispatches')
    .insert({
      submission_id: submission.id as string,
      supplier_id: payload.supplierId,
      actor_user_id: actorUserId,
      actor_role: 'admin',
      channel: payload.channel,
      status: 'sent',
      payload: { message: 'Commande marquee comme passee par administrateur.' },
    });
  if (insertError) throw new Error(insertError.message);
};

export const listSubmissionSelectedSuppliers = async (submissionId: string) => {
  const { data, error } = await supabase
    .from('campaign_phase_submission_suppliers')
    .select('supplier_id, suppliers(name)')
    .eq('submission_id', submissionId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    supplier_id: row.supplier_id as string,
    supplier_name: (row.suppliers?.name as string | undefined) ?? 'Fournisseur',
  }));
};

export const buildPurchaseOrderDispatchDocument = async (payload: {
  submissionId: string;
  supplierId: string;
}) => {
  const { data: submission, error: submissionError } = await supabase
    .from('campaign_phase_submissions')
    .select('id, campaign_id, pharmacy_id, phase_key, submitted_at')
    .eq('id', payload.submissionId)
    .single();
  if (submissionError) throw new Error(submissionError.message);
  if ((submission.phase_key as CampaignPhaseKey) !== 'purchase_orders') throw new Error('Document reserve aux bons de commande.');

  const [campaignRes, pharmacyRes, supplierRes, linesRes] = await Promise.all([
    supabase.from('campaigns').select('name, supplier_id').eq('id', submission.campaign_id as string).maybeSingle(),
    supabase.from('pharmacies').select('name, address, phone').eq('id', submission.pharmacy_id as string).maybeSingle(),
    supabase.from('suppliers').select('name, address, mobile_phone, landline_phone').eq('id', payload.supplierId).maybeSingle(),
    supabase.from('campaign_phase_submission_lines').select('product_id, product_name, quantity, unit_price_ht, line_total_ht').eq('submission_id', submission.id as string),
  ]);
  if (linesRes.error) throw new Error(linesRes.error.message);
  const allocationResponse = await supabase
    .from('campaign_phase_submission_line_suppliers')
    .select('product_id, supplier_id, quantity')
    .eq('submission_id', submission.id as string)
    .eq('supplier_id', payload.supplierId);

  let campaignName = (campaignRes.data?.name as string | undefined) ?? 'Campagne';
  let campaignSupplierId = (campaignRes.data?.supplier_id as string | null | undefined) ?? null;
  if ((!campaignRes.data || campaignRes.error) && submission.pharmacy_id) {
    try {
      const visibleCampaigns = await listCampaignsForPharmacyPortal(submission.pharmacy_id as string);
      const visible = visibleCampaigns.find((row) => row.campaign_id === (submission.campaign_id as string));
      if (visible) {
        campaignName = visible.campaign_name;
        campaignSupplierId = visible.supplier_id;
      }
    } catch {
      // keep default values
    }
  }

  let laboratoryLabel = 'Laboratoire';
  const laboratoryId = campaignSupplierId;
  if (laboratoryId) {
    const { data: lab } = await supabase.from('laboratories').select('designation').eq('id', laboratoryId).maybeSingle();
    if (lab?.designation) laboratoryLabel = lab.designation as string;
    else {
      const { data: supplierLab } = await supabase.from('suppliers').select('name').eq('id', laboratoryId).maybeSingle();
      if (supplierLab?.name) laboratoryLabel = supplierLab.name as string;
    }
  }

  const { data: managedProducts } = await supabase
    .from('managed_products')
    .select('id, nature, pct_code, barcode, vat_rate_id');
  const vatRateIds = Array.from(new Set((managedProducts ?? []).map((row) => row.vat_rate_id as string | null).filter(Boolean) as string[]));
  let vatRateById = new Map<string, number>();
  if (vatRateIds.length) {
    const { data: vatRates } = await supabase
      .from('vat_rates')
      .select('id, rate')
      .in('id', vatRateIds);
    vatRateById = new Map((vatRates ?? []).map((row) => [row.id as string, Number(row.rate ?? 0)]));
  }
  const vatRateByProductId = new Map<string, number>();
  const displayCodeByProduct = new Map<string, string>();
  for (const row of managedProducts ?? []) {
    const productId = row.id as string;
    const nature = (row.nature as 'medicament' | 'para' | null) ?? null;
    const pctCode = (row.pct_code as string | null)?.trim() ?? '';
    const barcode = (row.barcode as string | null)?.trim() ?? '';
    const displayCode = nature === 'medicament'
      ? (pctCode || 'N/A')
      : (barcode || 'N/A');
    displayCodeByProduct.set(productId, displayCode);
    const vatRateId = row.vat_rate_id as string | null;
    vatRateByProductId.set(productId, vatRateId ? (vatRateById.get(vatRateId) ?? 0) : 0);
  }
  const allocationByProductId = new Map<string, number>();
  for (const row of allocationResponse.data ?? []) {
    const productId = row.product_id as string;
    allocationByProductId.set(productId, (allocationByProductId.get(productId) ?? 0) + Number(row.quantity ?? 0));
  }

  const lines = (linesRes.data ?? [])
    .map((row) => {
      const allocatedQuantity = allocationByProductId.get(row.product_id as string);
      const effectiveQuantity = allocatedQuantity ?? Number(row.quantity ?? 0);
      if (effectiveQuantity <= 0) return null;
      const unitPrice = Number(row.unit_price_ht ?? 0);
      const lineTotalHt = Number((unitPrice * effectiveQuantity).toFixed(3));
      const vatRate = vatRateByProductId.get(row.product_id as string) ?? 0;
      const lineTva = Number((lineTotalHt * vatRate / 100).toFixed(3));
      const lineTtc = Number((lineTotalHt + lineTva).toFixed(3));
      return {
        product_id: row.product_id as string,
        product_name: row.product_name as string,
        pct_code: displayCodeByProduct.get(row.product_id as string) ?? 'N/A',
        quantity: effectiveQuantity,
        unit_price_ht: unitPrice,
        vat_rate: vatRate,
        line_total_ttc: lineTtc,
        line_total_ht: lineTotalHt,
        line_total_tva: lineTva,
      };
    })
    .filter(Boolean)
    .map((line) => line as {
      product_id: string;
      product_name: string;
      pct_code: string;
      quantity: number;
      unit_price_ht: number;
      vat_rate: number;
      line_total_ttc: number;
      line_total_ht: number;
      line_total_tva: number;
    });
  const totalHt = lines.reduce((acc, row) => acc + row.line_total_ht, 0);
  const totalTva = lines.reduce((acc, row) => acc + row.line_total_tva, 0);
  const totalTtc = Number((totalHt + totalTva).toFixed(3));
  const { data: latestDispatch } = await supabase
    .from('purchase_order_dispatches')
    .select('created_at, channel')
    .eq('submission_id', submission.id as string)
    .eq('supplier_id', payload.supplierId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    campaign_name: campaignName,
    laboratory_name: laboratoryLabel,
    participant: {
      name: (pharmacyRes.data?.name as string | undefined) ?? 'Pharmacie',
      address: (pharmacyRes.data?.address as string | null) ?? null,
      phone: (pharmacyRes.data?.phone as string | null) ?? null,
    },
    supplier: {
      name: (supplierRes.data?.name as string | undefined) ?? 'Fournisseur',
      address: (supplierRes.data?.address as string | null) ?? null,
      phone: (supplierRes.data?.mobile_phone as string | null) ?? (supplierRes.data?.landline_phone as string | null) ?? null,
    },
    submitted_at: (submission.submitted_at as string | null) ?? null,
    lines,
    total_ht: Number(totalHt.toFixed(3)),
    total_tva: Number(totalTva.toFixed(3)),
    total_ttc: totalTtc,
    last_dispatch: latestDispatch
      ? {
        created_at: latestDispatch.created_at as string,
        channel: latestDispatch.channel as 'email' | 'sms' | 'whatsapp',
      }
      : null,
  };
};

export const listSubmissionSupplierOrderSummaries = async (submissionId: string): Promise<SubmissionSupplierOrderSummary[]> => {
  const suppliers = await listSubmissionSelectedSuppliers(submissionId);
  if (!suppliers.length) return [];
  const docs = await Promise.all(
    suppliers.map(async (supplier) => {
      const doc = await buildPurchaseOrderDispatchDocument({
        submissionId,
        supplierId: supplier.supplier_id,
      });
      return {
        supplier_id: supplier.supplier_id,
        supplier_name: supplier.supplier_name,
        total_ht: doc.total_ht,
        total_tva: doc.total_tva,
        total_ttc: doc.total_ttc,
        lines_count: doc.lines.length,
      } as SubmissionSupplierOrderSummary;
    }),
  );
  return docs;
};


