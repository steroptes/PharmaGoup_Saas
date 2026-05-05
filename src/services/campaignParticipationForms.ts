import { supabase } from '@/lib/supabase';
import {
  CampaignCondition,
  CampaignPhaseKey,
  getCampaignProductConfiguration,
  listCampaignBusinessUnits,
  listCampaignConditions,
  listCampaignGroupBrands,
  listManagedProductsForLaboratory,
} from '@/services/campaigns';
import { listCampaignsForPharmacyPortal, resolveCurrentUserPharmacyId } from '@/services/pharmacyCampaigns';

export type CampaignDynamicProductRow = {
  product_id: string;
  designation: string;
  unit_price_ht: number;
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

export type CampaignDynamicFormPayload = {
  campaign_id: string;
  campaign_name: string;
  phase_key: CampaignPhaseKey;
  pharmacy_id: string;
  arrangement_mode: 'inherit_laboratory' | 'custom';
  business_units: CampaignDynamicBu[];
  root_products: CampaignDynamicProductRow[];
  conditions: CampaignCondition[];
  submission_status: 'draft' | 'submitted' | null;
  submission_updated_at: string | null;
};

export type CampaignSubmissionSummary = {
  submission_id: string;
  pharmacy_id: string;
  pharmacy_name: string;
  status: 'draft' | 'submitted';
  total_quantity: number;
  total_amount_ht: number;
  submitted_at: string | null;
  updated_at: string;
};

export type CampaignSubmissionDetail = {
  submission_id: string;
  pharmacy_id: string;
  pharmacy_name: string;
  status: 'draft' | 'submitted';
  total_quantity: number;
  total_amount_ht: number;
  submitted_at: string | null;
  updated_at: string;
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

const ensurePhaseEnabled = async (campaignId: string, phaseKey: CampaignPhaseKey) => {
  const { data, error } = await supabase
    .from('campaign_phases')
    .select('is_enabled')
    .eq('campaign_id', campaignId)
    .eq('phase_key', phaseKey)
    .maybeSingle();

  const enabledByDirectRead = !error && !!data?.is_enabled;
  if (enabledByDirectRead) return;

  const fallbackRows = await listCampaignsForPharmacyPortal();
  const campaign = fallbackRows.find((row) => row.campaign_id === campaignId);
  if (campaign?.enabled_phases?.includes(phaseKey)) return;

  if (error) throw new Error(error.message);
  throw new Error('Cette phase n\'est pas active pour cette campagne.');
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
    .select('id, status, updated_at')
    .eq('campaign_id', campaignId)
    .eq('phase_key', phaseKey)
    .eq('pharmacy_id', pharmacyId)
    .maybeSingle();

  if (submissionError) throw new Error(submissionError.message);
  if (!submission) return { quantities: new Map<string, number>(), status: null, updatedAt: null } as const;

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
    quantities,
    status: submission.status as 'draft' | 'submitted',
    updatedAt: (submission.updated_at as string | null) ?? null,
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

const getCampaignProductConfigurationForPharmacy = async (campaignId: string) => {
  try {
    return await getCampaignProductConfiguration(campaignId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isPermissionLikeError(message)) throw error;

    const { data, error: productsError } = await supabase
      .from('campaign_products')
      .select('product_id')
      .eq('campaign_id', campaignId);
    if (productsError) throw new Error(productsError.message);
    return {
      productIds: (data ?? []).map((row) => row.product_id as string),
      arrangementMode: 'inherit_laboratory' as const,
      arrangements: [],
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

  const [config, products, businessUnitsResult, groupBrandsResult, conditionsResult] = await Promise.allSettled([
    getCampaignProductConfigurationForPharmacy(campaignId),
    listManagedProductsForLaboratory(campaign.supplier_id),
    listCampaignBusinessUnits(campaignId),
    listCampaignGroupBrands(campaignId),
    listCampaignConditions(campaignId),
  ]);

  if (config.status === 'rejected') throw config.reason;
  if (products.status === 'rejected') throw products.reason;
  const resolvedBusinessUnits = businessUnitsResult.status === 'fulfilled' ? businessUnitsResult.value : [];
  const resolvedGroupBrands = groupBrandsResult.status === 'fulfilled' ? groupBrandsResult.value : [];
  const resolvedConditions = conditionsResult.status === 'fulfilled' ? conditionsResult.value : [];

  await ensurePhaseEnabled(campaignId, phaseKey);
  await ensureAcceptedParticipant(campaignId, pharmacyId);

  const { quantities, status, updatedAt } = await loadSubmissionQuantities(campaignId, phaseKey, pharmacyId);
  const resolvedConfig = config.value;
  const productRows = products.value;
  const effectiveProductIds = resolvedConfig.productIds.length
    ? resolvedConfig.productIds
    : productRows.map((product) => product.id);
  const selectedProducts = new Set(effectiveProductIds);
  const arrangementsByProduct = new Map(resolvedConfig.arrangements.map((row) => [row.product_id, row]));
  const productsById = new Map(productRows.map((product) => [product.id, product]));

  const rootProducts: CampaignDynamicProductRow[] = [];
  const buMap = new Map<string, CampaignDynamicBu>();
  const groupMap = new Map<string, CampaignDynamicGroup>();

  for (const productId of effectiveProductIds) {
    const product = productsById.get(productId);
    if (!product || !selectedProducts.has(product.id)) continue;
    const arrangement = arrangementsByProduct.get(product.id);
    const row: CampaignDynamicProductRow = {
      product_id: product.id,
      designation: product.designation,
      unit_price_ht: Number((product as any).purchase_unit_price_ht ?? 0),
      quantity: quantities.get(product.id) ?? 0,
      campaign_business_unit_id: arrangement?.campaign_business_unit_id ?? null,
      campaign_group_brand_id: arrangement?.campaign_group_brand_id ?? null,
    };

    if (!row.campaign_business_unit_id) {
      rootProducts.push(row);
      continue;
    }

    const buName = resolvedBusinessUnits.find((bu) => bu.id === row.campaign_business_unit_id)?.name ?? 'BU';
    const bu = buMap.get(row.campaign_business_unit_id) ?? {
      id: row.campaign_business_unit_id,
      name: buName,
      groups: [],
    };

    if (!buMap.has(row.campaign_business_unit_id)) buMap.set(row.campaign_business_unit_id, bu);

    const groupId = row.campaign_group_brand_id ?? `__ungrouped__${bu.id}`;
    const groupName = row.campaign_group_brand_id
      ? (resolvedGroupBrands.find((group) => group.id === row.campaign_group_brand_id)?.name ?? 'GROUP')
      : 'Sans GROUP';

    const group = groupMap.get(groupId) ?? { id: groupId, name: groupName, products: [] };
    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, group);
      bu.groups.push(group);
    }
    group.products.push(row);
  }

  const filteredConditions = resolvedConditions.filter((condition) => condition.phase === phaseKey || condition.phase === 'both');

  return {
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    phase_key: phaseKey,
    pharmacy_id: pharmacyId,
    arrangement_mode: resolvedConfig.arrangementMode,
    business_units: Array.from(buMap.values()),
    root_products: rootProducts,
    conditions: filteredConditions,
    submission_status: status,
    submission_updated_at: updatedAt,
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

  const { data: upsertedRows, error: upsertError } = await supabase
    .from('campaign_phase_submissions')
    .upsert({
      campaign_id: payload.campaignId,
      phase_key: payload.phaseKey,
      pharmacy_id: pharmacyId,
      status: payload.submit ? 'submitted' : 'draft',
      submitted_at: payload.submit ? new Date().toISOString() : null,
      total_quantity: totalQty,
      total_amount_ht: Number(totalAmount.toFixed(3)),
    }, { onConflict: 'campaign_id,phase_key,pharmacy_id' })
    .select('id');

  if (upsertError) throw new Error(upsertError.message);

  const submissionId = (upsertedRows?.[0]?.id as string | undefined) ?? null;
  if (!submissionId) {
    throw new Error('Impossible de retrouver la soumission après enregistrement (id manquant).');
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
    .select('id, pharmacy_id, status, total_quantity, total_amount_ht, submitted_at, updated_at')
    .eq('campaign_id', campaignId)
    .eq('phase_key', phaseKey)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  const pharmacyIds = Array.from(new Set((data ?? []).map((row) => row.pharmacy_id as string)));
  let names = new Map<string, string>();
  if (pharmacyIds.length) {
    const { data: pharmacies, error: pharmaciesError } = await supabase
      .from('pharmacies')
      .select('id, name')
      .in('id', pharmacyIds);
    if (pharmaciesError) throw new Error(pharmaciesError.message);
    names = new Map((pharmacies ?? []).map((pharmacy) => [pharmacy.id as string, pharmacy.name as string]));
  }

  return (data ?? []).map((row) => ({
    submission_id: row.id as string,
    pharmacy_id: row.pharmacy_id as string,
    pharmacy_name: names.get(row.pharmacy_id as string) ?? 'Pharmacie',
    status: row.status as 'draft' | 'submitted',
    total_quantity: Number(row.total_quantity ?? 0),
    total_amount_ht: Number(row.total_amount_ht ?? 0),
    submitted_at: (row.submitted_at as string | null) ?? null,
    updated_at: row.updated_at as string,
  }));
};

export const getCampaignPhaseSubmissionDetail = async (submissionId: string): Promise<CampaignSubmissionDetail> => {
  const { data: submission, error: submissionError } = await supabase
    .from('campaign_phase_submissions')
    .select('id, pharmacy_id, status, total_quantity, total_amount_ht, submitted_at, updated_at')
    .eq('id', submissionId)
    .single();

  if (submissionError) throw new Error(submissionError.message);

  const { data: pharmacy, error: pharmacyError } = await supabase
    .from('pharmacies')
    .select('name')
    .eq('id', submission.pharmacy_id)
    .maybeSingle();

  if (pharmacyError) throw new Error(pharmacyError.message);

  const { data: lines, error: linesError } = await supabase
    .from('campaign_phase_submission_lines')
    .select('product_id, product_name, campaign_business_unit_id, campaign_group_brand_id, quantity, unit_price_ht, line_total_ht')
    .eq('submission_id', submissionId)
    .order('product_name', { ascending: true });

  if (linesError) throw new Error(linesError.message);

  return {
    submission_id: submission.id as string,
    pharmacy_id: submission.pharmacy_id as string,
    pharmacy_name: (pharmacy?.name as string | undefined) ?? 'Pharmacie',
    status: submission.status as 'draft' | 'submitted',
    total_quantity: Number(submission.total_quantity ?? 0),
    total_amount_ht: Number(submission.total_amount_ht ?? 0),
    submitted_at: (submission.submitted_at as string | null) ?? null,
    updated_at: submission.updated_at as string,
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
