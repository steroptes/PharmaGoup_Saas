import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Eye, Mail, MessageCircle, MessageSquare, Printer, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CampaignPhaseKey } from '@/services/campaigns';
import { buildPurchaseOrderDispatchDocument, dispatchPurchaseOrderToSuppliers, loadCampaignDynamicForm, saveCampaignDynamicForm } from '@/services/campaignParticipationForms';
import { useAuth } from '@/context/AuthContext';
import { blobToBase64, buildPurchaseOrderInvoicePdf, downloadBlob } from '@/utils/pdf';

const PHASE_LABEL: Record<CampaignPhaseKey, string> = {
  purchase_intentions: "Annonce des intentions",
  purchase_orders: 'Creation du bon de commande',
  delivery_notes: 'Collecte des BL',
};
const statusLabel = (status: 'draft' | 'submitted' | 'needs_correction' | 'accepted' | null) => {
  if (status === 'draft') return 'Brouillon';
  if (status === 'submitted') return 'Soumise';
  if (status === 'needs_correction') return 'Rectification demandee';
  if (status === 'accepted') return 'Acceptee';
  return 'Non demarree';
};
const statusToneClass = (status: 'draft' | 'submitted' | 'needs_correction' | 'accepted' | null, hasBlockingRules: boolean) => {
  if (status === 'needs_correction' || hasBlockingRules) return 'warn';
  if (status === 'accepted') return 'ok';
  return '';
};
const purchaseIntentionsPrerequisiteLabel = (status: 'not_planned' | 'not_accepted' | 'accepted') => {
  if (status === 'accepted') return 'Intentions: Acceptees';
  if (status === 'not_accepted') return 'Intentions: En attente d approbation';
  return 'Intentions: Non planifiee';
};
const purchaseIntentionsPrerequisiteTone = (status: 'not_planned' | 'not_accepted' | 'accepted') => {
  if (status === 'accepted') return 'ok';
  if (status === 'not_accepted') return 'warn';
  return '';
};
const formatDelta = (value: number) => (value > 0 ? `+${value}` : `${value}`);

const money = (value: number) => value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.0001;
const includesAny = (kind: string, values: string[]) => values.some((value) => kind.includes(value));
type ConditionState = { label: string; scopeLabel: string; ok: boolean; current: number; target: number; unit: string; detail: string };
type CorrectionGroup = { key: string; label: string; note: string | null; items: Array<{ id: string; scope_type: 'campaign' | 'business_unit' | 'group_brand' | 'product'; campaign_business_unit_id: string | null; campaign_group_brand_id: string | null; product_id: string | null; message: string; resolved: boolean; resolved_at: string | null }> };

const ConditionIcon = ({ ok, title }: { ok: boolean; title: string }) => (
  <span className="pg-tooltip">
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {ok
        ? <CheckCircle2 size={14} color="#15803d" />
        : <AlertCircle size={14} color="#b42318" />}
    </span>
    <span className="pg-tooltip-bubble">{title}</span>
  </span>
);

const getConditionTone = (conditions: ConditionState[]) => {
  if (!conditions.length) return null;
  return conditions.every((condition) => condition.ok) ? 'ok' : 'warn';
};

const renderScopeConditionMeta = (conditions: ConditionState[]) => {
  if (!conditions.length) return null;
  const pctConditions = conditions.filter((condition) => condition.unit.trim() === '%');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {conditions.map((condition) => (
        <ConditionIcon key={`meta-${condition.label}`} ok={condition.ok} title={`${condition.label} - ${condition.detail}`} />
      ))}
      {pctConditions.map((condition) => (
        <span
          key={`pct-${condition.label}`}
          className="pg-tooltip"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: condition.ok ? '#166534' : '#b42318',
            background: condition.ok ? '#ecfdf3' : '#fff1f2',
            border: `1px solid ${condition.ok ? '#86efac' : '#fda29b'}`,
            borderRadius: 999,
            padding: '1px 8px',
          }}
        >
          {condition.current.toFixed(1)}% / {condition.target.toFixed(1)}%
          <span className="pg-tooltip-bubble">{`${condition.label} - ${condition.detail}`}</span>
        </span>
      ))}
    </span>
  );
};

export const PharmacyCampaignPhaseFormPage = () => {
  const { campaignId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const phase = (searchParams.get('phase') as CampaignPhaseKey | null) ?? 'purchase_intentions';

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState<Awaited<ReturnType<typeof loadCampaignDynamicForm>> | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [isScopeRectifModalOpen, setIsScopeRectifModalOpen] = useState(false);
  const [scopeRectifModalState, setScopeRectifModalState] = useState<{ scope: 'campaign' | 'business_unit' | 'group_brand' | 'product'; buId?: string | null; groupId?: string | null; productId?: string | null; title: string }>({ scope: 'campaign', title: 'Rectifications' });
  const [detailCorrectionGroupKey, setDetailCorrectionGroupKey] = useState<string | null>(null);
  const [lineSupplierAllocations, setLineSupplierAllocations] = useState<Record<string, Array<{ supplier_id: string; quantity: number }>>>({});
  const [dispatchSupplierId, setDispatchSupplierId] = useState<string>('');
  const [delegateOrderToAdmin, setDelegateOrderToAdmin] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [tempSelectedSupplierIds, setTempSelectedSupplierIds] = useState<string[]>([]);
  const [selectedSectionKey, setSelectedSectionKey] = useState<string>('root');
  const [sectionPage, setSectionPage] = useState(1);
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({});
  const [showBlockingDetails, setShowBlockingDetails] = useState(false);
  const [showConditionDetails, setShowConditionDetails] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1440);
  const PAGE_SIZE = 8;
  const iconActionBtnStyle: React.CSSProperties = {
    width: 38,
    height: 38,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const uiPrefsKey = useMemo(() => `pharma:phase-form:ui:${campaignId ?? 'none'}:${phase}`, [campaignId, phase]);

  const load = async () => {
    if (!campaignId) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const payload = await loadCampaignDynamicForm(campaignId, phase, profile?.pharmacy_id);
      setForm(payload);
      const next: Record<string, number> = {};
      for (const product of payload.root_products) next[product.product_id] = product.quantity;
      for (const bu of payload.business_units) {
        for (const group of bu.groups) {
          for (const product of group.products) next[product.product_id] = product.quantity;
        }
      }
      setQuantities(next);
      setSelectedSupplierIds(payload.purchase_order_selected_supplier_ids ?? []);
      setLineSupplierAllocations(payload.purchase_order_line_supplier_allocations ?? {});
      setDispatchSupplierId(payload.purchase_order_selected_supplier_ids?.[0] ?? '');
      setDelegateOrderToAdmin(payload.purchase_order_delegate_to_admin ?? false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Chargement impossible.');
      setForm(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [campaignId, phase, profile?.pharmacy_id]);

  useEffect(() => {
    setDispatchSupplierId(selectedSupplierIds[0] ?? '');
  }, [selectedSupplierIds]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(uiPrefsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { showBlockingDetails?: boolean; showConditionDetails?: boolean };
      if (typeof parsed.showBlockingDetails === 'boolean') setShowBlockingDetails(parsed.showBlockingDetails);
      if (typeof parsed.showConditionDetails === 'boolean') setShowConditionDetails(parsed.showConditionDetails);
    } catch {
      // no-op
    }
  }, [uiPrefsKey]);

  useEffect(() => {
    try {
      localStorage.setItem(uiPrefsKey, JSON.stringify({ showBlockingDetails, showConditionDetails }));
    } catch {
      // no-op
    }
  }, [uiPrefsKey, showBlockingDetails, showConditionDetails]);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const allProducts = useMemo(() => {
    if (!form) return [] as Array<{ id: string; name: string; unitPrice: number; vatRate: number; qty: number; buId: string | null; groupId: string | null }>;
    const rows: Array<{ id: string; name: string; unitPrice: number; vatRate: number; qty: number; buId: string | null; groupId: string | null }> = [];
    for (const product of form.root_products) {
      rows.push({
        id: product.product_id,
        name: product.designation,
        unitPrice: product.unit_price_ht,
        vatRate: product.vat_rate,
        qty: quantities[product.product_id] ?? 0,
        buId: null,
        groupId: null,
      });
    }
    for (const bu of form.business_units) {
      for (const group of bu.groups) {
        for (const product of group.products) {
          rows.push({
            id: product.product_id,
            name: product.designation,
            unitPrice: product.unit_price_ht,
            vatRate: product.vat_rate,
            qty: quantities[product.product_id] ?? 0,
            buId: bu.id,
            groupId: group.id,
          });
        }
      }
    }
    return rows;
  }, [form, quantities]);
  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of allProducts) map.set(row.id, row.name);
    return map;
  }, [allProducts]);

  const totalQty = useMemo(() => allProducts.reduce((acc, row) => acc + row.qty, 0), [allProducts]);
  const totalAmount = useMemo(() => allProducts.reduce((acc, row) => acc + (row.qty * row.unitPrice), 0), [allProducts]);
  const totalTTC = useMemo(() => allProducts.reduce((acc, row) => acc + (row.qty * row.unitPrice * (1 + (row.vatRate / 100))), 0), [allProducts]);

  const totals = useMemo(() => {
    const result = {
      campaignQty: 0,
      campaignAmount: 0,
      byBuQty: new Map<string, number>(),
      byBuAmount: new Map<string, number>(),
      byGroupQty: new Map<string, number>(),
      byGroupAmount: new Map<string, number>(),
      byProductQty: new Map<string, number>(),
      byProductAmount: new Map<string, number>(),
    };
    for (const row of allProducts as any[]) {
      const qty = row.qty ?? 0;
      const amount = qty * row.unitPrice;
      result.campaignQty += qty;
      result.campaignAmount += amount;
      result.byProductQty.set(row.id, qty);
      result.byProductAmount.set(row.id, amount);
    }
    for (const product of form?.root_products ?? []) {
      const qty = quantities[product.product_id] ?? 0;
      const amount = qty * product.unit_price_ht;
      if (product.campaign_business_unit_id) {
        result.byBuQty.set(product.campaign_business_unit_id, (result.byBuQty.get(product.campaign_business_unit_id) ?? 0) + qty);
        result.byBuAmount.set(product.campaign_business_unit_id, (result.byBuAmount.get(product.campaign_business_unit_id) ?? 0) + amount);
      }
      if (product.campaign_group_brand_id) {
        result.byGroupQty.set(product.campaign_group_brand_id, (result.byGroupQty.get(product.campaign_group_brand_id) ?? 0) + qty);
        result.byGroupAmount.set(product.campaign_group_brand_id, (result.byGroupAmount.get(product.campaign_group_brand_id) ?? 0) + amount);
      }
    }
    for (const bu of form?.business_units ?? []) {
      for (const group of bu.groups) {
        for (const product of group.products) {
          const qty = quantities[product.product_id] ?? 0;
          const amount = qty * product.unit_price_ht;
          result.byBuQty.set(bu.id, (result.byBuQty.get(bu.id) ?? 0) + qty);
          result.byBuAmount.set(bu.id, (result.byBuAmount.get(bu.id) ?? 0) + amount);
          result.byGroupQty.set(group.id, (result.byGroupQty.get(group.id) ?? 0) + qty);
          result.byGroupAmount.set(group.id, (result.byGroupAmount.get(group.id) ?? 0) + amount);
        }
      }
    }
    return result;
  }, [allProducts, form, quantities]);

  const conditionEvaluations = useMemo(() => {
    if (!form) return [] as ConditionState[];

    const resolveScope = (condition: (typeof form.conditions)[number], scope: string) => {
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

    const scopeLabel = (condition: (typeof form.conditions)[number]) => {
      if (condition.scope_type === 'campaign') return 'Campagne';
      if (condition.scope_type === 'business_unit') return 'BU';
      if (condition.scope_type === 'group_brand') return 'GROUP';
      return 'Produit';
    };

    return form.conditions.map((condition) => {
      const kind = condition.condition_kind.toLowerCase();
      const target = Number(condition.target_value ?? 0);
      const scoped = resolveScope(condition, condition.scope_type);
      const metric = includesAny(kind, ['qty', 'quantity']) ? scoped.qty : scoped.amount;
      let current = metric;

      if (kind.includes('pct_total')) {
        const referenceScope = resolveScope(condition, condition.reference_scope_type ?? 'campaign');
        const denominator = includesAny(kind, ['qty', 'quantity']) ? referenceScope.qty : referenceScope.amount;
        current = denominator > 0 ? (metric / denominator) * 100 : 0;
      }

      let ok = true;
      if (kind.includes('_min_')) ok = current >= target;
      if (kind.includes('_max_')) ok = current <= target;
      if (kind.includes('modulo')) ok = target > 0 && approxEqual(current % target, 0);

      return {
        label: condition.label,
        scopeLabel: scopeLabel(condition),
        ok,
        current,
        target,
        unit: condition.unit ?? '',
        detail: ok
          ? `OK - ${current.toFixed(3)} ${condition.unit ?? ''}`.trim()
          : `Attendu ${condition.operator} ${target}${condition.unit ? ` ${condition.unit}` : ''}, obtenu ${current.toFixed(3)}`,
      };
    });
  }, [form, totals]);

  const blockingRules = useMemo(() => {
    const messages = conditionEvaluations.filter((item) => !item.ok).map((item) => `${item.label}: ${item.detail}`);
    if (totalQty <= 0) messages.unshift('Remplissage incomplet: ajoutez au moins une quantite strictement positive.');
    if (form?.purchase_order_prerequisite_blocked && form.purchase_order_prerequisite_message) {
      messages.unshift(form.purchase_order_prerequisite_message);
    }
    return messages;
  }, [conditionEvaluations, totalQty, form?.purchase_order_prerequisite_blocked, form?.purchase_order_prerequisite_message]);

  const setQty = (productId: string, raw: string) => {
    const nextValue = Math.max(0, Number(raw || 0));
    setQuantities((current) => ({ ...current, [productId]: Number.isFinite(nextValue) ? nextValue : 0 }));
  };

  const renderIntentionsReference = (productId: string) => {
    if (phase !== 'purchase_orders' || !form) return null;
    if (form.purchase_order_prerequisite_status === 'not_planned') return null;
    const refQty = Number(form.intentions_accepted_quantities_by_product_id?.[productId] ?? 0);
    const currentQty = Number(quantities[productId] ?? 0);
    const delta = currentQty - refQty;
    const tone = delta > 0 ? '#b45309' : delta < 0 ? '#1d4ed8' : '#166534';
    return (
      <span style={{ marginLeft: 8, fontSize: 11, color: tone }}>
        IA: {refQty}U ({formatDelta(delta)}U)
      </span>
    );
  };

  const treeNodes = useMemo(() => {
    if (!form) return [] as Array<{ key: string; label: string; level: 0 | 1 | 2; productCount: number; filledCount: number; selectable: boolean }>;
    const nodes: Array<{ key: string; label: string; level: 0 | 1 | 2; productCount: number; filledCount: number; selectable: boolean }> = [];
    const rootCount = allProducts.filter((item) => item.buId === null).length;
    const rootFilled = allProducts.filter((item) => item.buId === null && item.qty > 0).length;
    if (rootCount > 0) {
      nodes.push({ key: 'root', label: 'Produits generaux', level: 0, productCount: rootCount, filledCount: rootFilled, selectable: true });
    }
    for (const bu of form.business_units) {
      const buCount = allProducts.filter((item) => item.buId === bu.id).length;
      const buFilled = allProducts.filter((item) => item.buId === bu.id && item.qty > 0).length;
      if (buCount === 0) continue;
      nodes.push({ key: `bu:${bu.id}`, label: `BU: ${bu.name}`, level: 1, productCount: buCount, filledCount: buFilled, selectable: true });
      for (const group of bu.groups) {
        if (group.name.trim().toLowerCase() === 'sans group') continue;
        const groupCount = allProducts.filter((item) => item.groupId === group.id).length;
        const groupFilled = allProducts.filter((item) => item.groupId === group.id && item.qty > 0).length;
        if (groupCount === 0) continue;
        nodes.push({ key: `group:${group.id}`, label: `GROUP: ${group.name}`, level: 2, productCount: groupCount, filledCount: groupFilled, selectable: true });
      }
    }
    return nodes;
  }, [form, allProducts]);

  useEffect(() => {
    if (!treeNodes.length) return;
    const selectableNodes = treeNodes.filter((node) => node.selectable);
    if (!selectableNodes.length) return;
    const exists = selectableNodes.some((node) => node.key === selectedSectionKey);
    if (!exists) setSelectedSectionKey(selectableNodes[0].key);
  }, [treeNodes, selectedSectionKey]);

  const visibleProducts = useMemo(() => {
    if (!form) return [] as typeof allProducts;
    if (selectedSectionKey === 'root') return allProducts.filter((item) => item.buId === null);
    if (selectedSectionKey.startsWith('bu:')) {
      const buId = selectedSectionKey.replace('bu:', '');
      return allProducts.filter((item) => item.buId === buId);
    }
    if (selectedSectionKey.startsWith('group:')) {
      const groupId = selectedSectionKey.replace('group:', '');
      return allProducts.filter((item) => item.groupId === groupId);
    }
    return allProducts;
  }, [allProducts, form, selectedSectionKey]);

  const pageCount = Math.max(1, Math.ceil(visibleProducts.length / PAGE_SIZE));
  const pagedProducts = useMemo(
    () => visibleProducts.slice((sectionPage - 1) * PAGE_SIZE, sectionPage * PAGE_SIZE),
    [visibleProducts, sectionPage],
  );

  const sectionTotals = useMemo(() => {
    const qty = visibleProducts.reduce((acc, row) => acc + row.qty, 0);
    const ht = visibleProducts.reduce((acc, row) => acc + (row.qty * row.unitPrice), 0);
    const ttc = visibleProducts.reduce((acc, row) => acc + (row.qty * row.unitPrice * (1 + row.vatRate / 100)), 0);
    return { qty, ht, ttc };
  }, [visibleProducts]);

  const conditionStates = useMemo(() => conditionEvaluations, [conditionEvaluations]);
  const failedConditionStates = useMemo(() => conditionStates.filter((item) => !item.ok), [conditionStates]);
  const okConditionCount = Math.max(0, conditionStates.length - failedConditionStates.length);
  const correctionGroups = useMemo(() => {
    if (!form) return [] as CorrectionGroup[];
    const groups: CorrectionGroup[] = [];
    const globalItems = (form.admin_correction_items ?? []).filter((item) => !item.resolved);
    groups.push({ key: 'general', label: 'General', note: form.admin_correction_note ?? null, items: globalItems });
    for (const review of form.purchase_order_supplier_reviews ?? []) {
      const items = (review.correction_items ?? []).filter((item) => !item.resolved);
      if (!items.length && !review.admin_note) continue;
      groups.push({ key: `supplier:${review.supplier_id}`, label: review.supplier_name, note: review.admin_note ?? null, items });
    }
    return groups;
  }, [form]);
  const allUnresolvedCorrections = useMemo(() => correctionGroups.flatMap((group) => group.items), [correctionGroups]);
  const correctionTracking = useMemo(() => {
    const unresolved = allUnresolvedCorrections;
    const campaign = unresolved.filter((item) => item.scope_type === 'campaign').map((item) => item.message);
    const byBu = new Map<string, string[]>();
    const byGroup = new Map<string, string[]>();
    const byProduct = new Map<string, string[]>();
    for (const item of unresolved) {
      if (item.scope_type === 'business_unit' && item.campaign_business_unit_id) {
        byBu.set(item.campaign_business_unit_id, [...(byBu.get(item.campaign_business_unit_id) ?? []), item.message]);
      }
      if (item.scope_type === 'group_brand' && item.campaign_group_brand_id) {
        byGroup.set(item.campaign_group_brand_id, [...(byGroup.get(item.campaign_group_brand_id) ?? []), item.message]);
      }
      if (item.scope_type === 'product' && item.product_id) {
        byProduct.set(item.product_id, [...(byProduct.get(item.product_id) ?? []), item.message]);
      }
    }
    return { unresolved, campaign, byBu, byGroup, byProduct };
  }, [allUnresolvedCorrections]);
  const correctionMessagesFor = (productId: string, buId: string | null, groupId: string | null) => {
    return [
      ...correctionTracking.campaign,
      ...(buId ? (correctionTracking.byBu.get(buId) ?? []) : []),
      ...(groupId ? (correctionTracking.byGroup.get(groupId) ?? []) : []),
      ...(correctionTracking.byProduct.get(productId) ?? []),
    ];
  };
  const correctionStateFor = (
    scope: 'campaign' | 'business_unit' | 'group_brand' | 'product',
    productId?: string | null,
    buId?: string | null,
    groupId?: string | null,
  ) => {
    const all = allUnresolvedCorrections;
    const targeted = all.filter((item) => {
      if (scope === 'product') return !!productId && item.scope_type === 'product' && item.product_id === productId;
      if (scope === 'group_brand') return !!groupId && item.scope_type === 'group_brand' && item.campaign_group_brand_id === groupId;
      if (scope === 'business_unit') return !!buId && item.scope_type === 'business_unit' && item.campaign_business_unit_id === buId;
      return item.scope_type === 'campaign';
    });
    if (!targeted.length) return { tone: 'none' as const, tooltip: '' };
    const unresolved = targeted.filter((item) => !item.resolved);
    const unresolvedMessages = Array.from(new Set(unresolved.map((item) => item.message.trim()).filter(Boolean)));
    const resolvedMessages = Array.from(new Set(targeted.map((item) => item.message.trim()).filter(Boolean)));
    if (unresolved.length) {
      return {
        tone: 'pending' as const,
        tooltip: `Rectifications a traiter:\n- ${unresolvedMessages.join('\n- ')}`,
      };
    }
    return {
      tone: 'resolved' as const,
      tooltip: `Rectifications traitees:\n- ${resolvedMessages.join('\n- ')}`,
    };
  };
  const filteredPartnerSuppliers = useMemo(() => {
    if (!form) return [];
    const q = supplierSearch.trim().toLowerCase();
    return form.purchase_order_partner_suppliers.filter((supplier) => {
      if (!q) return true;
      return [supplier.name, supplier.nature].some((value) => value.toLowerCase().includes(q));
    });
  }, [form, supplierSearch]);

  const selectedPartnerSupplierNames = useMemo(() => {
    if (!form) return [] as string[];
    const byId = new Map(form.purchase_order_partner_suppliers.map((supplier) => [supplier.id, supplier.name]));
    return selectedSupplierIds.map((id) => byId.get(id)).filter(Boolean) as string[];
  }, [form, selectedSupplierIds]);

  const multiSupplierEnabled = phase === 'purchase_orders' && !!form?.purchase_order_multi_supplier_enabled;
  const isSplitPerSupplier = multiSupplierEnabled && selectedSupplierIds.length > 1;
  const isCompactLayout = viewportWidth < 1440;
  const allocationTotalsByProduct = useMemo(() => {
    const totals = new Map<string, number>();
    for (const [productId, rows] of Object.entries(lineSupplierAllocations)) {
      totals.set(productId, (rows ?? []).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0));
    }
    return totals;
  }, [lineSupplierAllocations]);

  const missingPurchaseOrderSuppliers = phase === 'purchase_orders' && (!multiSupplierEnabled ? selectedSupplierIds.length !== 1 : selectedSupplierIds.length === 0);
  const hasInvalidAllocations = phase === 'purchase_orders'
    && isSplitPerSupplier
    && allProducts
      .filter((row) => row.qty > 0)
      .some((row) => !approxEqual(allocationTotalsByProduct.get(row.id) ?? 0, row.qty));
  const isReadOnly = form?.submission_status === 'accepted';
  const acceptedSupplierIds = useMemo(() => new Set(
    (form?.purchase_order_supplier_reviews ?? [])
      .filter((review) => review.status === 'accepted')
      .map((review) => review.supplier_id),
  ), [form]);
  const hasAcceptedSupplierLocks = acceptedSupplierIds.size > 0;
  const isSupplierLocked = (supplierId: string) => isReadOnly || acceptedSupplierIds.has(supplierId);
  const canToggleDelegation = phase === 'purchase_orders' && !!form && !isReadOnly && form.purchase_order_order_placement_mode === 'participant_choice';
  const mustDelegateToAdmin = phase === 'purchase_orders' && !!form && form.purchase_order_order_placement_mode === 'admin_only';
  const participantCanDispatchAcceptedOrder = phase === 'purchase_orders'
    && !!form
    && form.submission_status === 'accepted'
    && form.purchase_order_can_participant_place_order
    && (form.purchase_order_order_placement_mode !== 'participant_choice' || !delegateOrderToAdmin);
  const canPrintPurchaseOrder = phase === 'purchase_orders'
    && !!form
    && selectedSupplierIds.length > 0
    && (form.purchase_order_order_placement_mode !== 'admin_only' || form.purchase_order_has_been_dispatched);
  const canResetPurchaseOrderFromIntentions = phase === 'purchase_orders'
    && !isReadOnly
    && !!form
    && form.purchase_order_prerequisite_status === 'accepted';

  const resetPurchaseOrderFromIntentions = () => {
    if (!form) return;
    if (!canResetPurchaseOrderFromIntentions) return;
    const resetMap: Record<string, number> = {};
    for (const product of form.root_products) {
      resetMap[product.product_id] = Number(form.intentions_accepted_quantities_by_product_id?.[product.product_id] ?? 0);
    }
    for (const bu of form.business_units) {
      for (const group of bu.groups) {
        for (const product of group.products) {
          resetMap[product.product_id] = Number(form.intentions_accepted_quantities_by_product_id?.[product.product_id] ?? 0);
        }
      }
    }
    setQuantities(resetMap);
    setFeedback('BC reinitialise sur la base des quantites des intentions acceptees.');
  };

  const openSupplierModal = () => {
    setTempSelectedSupplierIds(selectedSupplierIds);
    setSupplierSearch('');
    setIsSupplierModalOpen(true);
  };

  const applySupplierSelection = () => {
    const next = Array.from(new Set(tempSelectedSupplierIds));
    setSelectedSupplierIds(next);
    setDispatchSupplierId(next[0] ?? '');
    // Reset quantities and allocations when supplier selection changes.
    setLineSupplierAllocations({});
    setQuantities((current) => Object.fromEntries(Object.keys(current).map((key) => [key, 0])));
    setIsSupplierModalOpen(false);
  };
  const getSupplierQtyForProduct = (productId: string, supplierId: string) =>
    Number(lineSupplierAllocations[productId]?.find((entry) => entry.supplier_id === supplierId)?.quantity ?? 0);
  const buildSupplierTotalsForProducts = (products: Array<{ id: string; qty: number; unitPrice: number; vatRate: number }>) => {
    const map = new Map<string, { qty: number; ht: number; ttc: number }>();
    if (!isSplitPerSupplier) return map;
    for (const supplierId of selectedSupplierIds) {
      map.set(supplierId, { qty: 0, ht: 0, ttc: 0 });
    }
    for (const row of products) {
      for (const supplierId of selectedSupplierIds) {
        const qty = getSupplierQtyForProduct(row.id, supplierId);
        if (!qty) continue;
        const ht = qty * row.unitPrice;
        const ttc = ht * (1 + row.vatRate / 100);
        const current = map.get(supplierId) ?? { qty: 0, ht: 0, ttc: 0 };
        map.set(supplierId, {
          qty: current.qty + qty,
          ht: current.ht + ht,
          ttc: current.ttc + ttc,
        });
      }
    }
    return map;
  };
  const setLineSupplierQty = (productId: string, supplierId: string, raw: string) => {
    if (isSupplierLocked(supplierId)) return;
    const value = Math.max(0, Number(raw || 0));
    setLineSupplierAllocations((current) => {
      const entries = [...(current[productId] ?? [])];
      const idx = entries.findIndex((entry) => entry.supplier_id === supplierId);
      if (idx >= 0) {
        if (value > 0) entries[idx] = { supplier_id: supplierId, quantity: value };
        else entries.splice(idx, 1);
      } else if (value > 0) {
        entries.push({ supplier_id: supplierId, quantity: value });
      }
      return { ...current, [productId]: entries };
    });
    setQuantities((current) => {
      const entries = [...(lineSupplierAllocations[productId] ?? [])];
      const idx = entries.findIndex((entry) => entry.supplier_id === supplierId);
      if (idx >= 0) {
        if (value > 0) entries[idx] = { supplier_id: supplierId, quantity: value };
        else entries.splice(idx, 1);
      } else if (value > 0) {
        entries.push({ supplier_id: supplierId, quantity: value });
      }
      const nextTotal = entries.reduce((sum, entry) => sum + Number(entry.quantity ?? 0), 0);
      return { ...current, [productId]: Number(nextTotal.toFixed(3)) };
    });
  };
  const setPrimaryQty = (productId: string, raw: string) => {
    if (isReadOnly) return;
    if (multiSupplierEnabled && selectedSupplierIds.length === 1 && isSupplierLocked(selectedSupplierIds[0])) return;
    setQty(productId, raw);
    if (!multiSupplierEnabled || selectedSupplierIds.length !== 1) return;
    const supplierId = selectedSupplierIds[0];
    const value = Math.max(0, Number(raw || 0));
    setLineSupplierAllocations((current) => {
      if (!supplierId) return current;
      const nextEntries = value > 0 ? [{ supplier_id: supplierId, quantity: value }] : [];
      return { ...current, [productId]: nextEntries };
    });
  };
  const renderQuantityEditor = (productId: string, tone: 'ok' | 'warn' | null, unitPrice?: number, vatRate?: number) => {
    const useSingleInput = !multiSupplierEnabled || selectedSupplierIds.length <= 1;
    const singleSupplierId = useSingleInput && multiSupplierEnabled && selectedSupplierIds.length === 1 ? selectedSupplierIds[0] : null;
    const singleInputLocked = isReadOnly || (singleSupplierId ? isSupplierLocked(singleSupplierId) : false);
    if (useSingleInput) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Input
            type="number"
            min={0}
            step="1"
            disabled={singleInputLocked}
            value={quantities[productId] ?? 0}
            onChange={(event) => setPrimaryQty(productId, event.target.value)}
            style={tone
              ? {
                borderColor: tone === 'warn' ? '#fda29b' : '#86efac',
                background: tone === 'warn' ? '#fff5f4' : '#f0fdf4',
                color: tone === 'warn' ? '#b42318' : '#166534',
                fontWeight: 600,
                textAlign: 'center',
              }
              : { textAlign: 'center' }}
          />
          {tone && <ConditionIcon ok={tone === 'ok'} title={tone === 'ok' ? 'Champ conforme aux conditions' : 'Champ non conforme aux conditions'} />}
        </div>
      );
    }

    const totalQty = Number(quantities[productId] ?? 0);
    const totalST = (totalQty * Number(unitPrice ?? 0)) * (1 + (Number(vatRate ?? 0) / 100));
    return (
      <div className="supplier-qty-wrap">
        <div className="supplier-qty-grid">
          <div className="supplier-qty-cell supplier-qty-cell-total">
            <span className="supplier-qty-label" title="Total a commander">Total a commander</span>
            <Input
              type="number"
              value={totalQty}
              disabled
              className="supplier-qty-input"
              style={{ textAlign: 'center', fontWeight: 700, background: '#f8fafc', borderColor: '#cbd5e1' }}
              title="Total ligne"
            />
            <span className="supplier-qty-amount">{money(Number(unitPrice ?? 0))} HT</span>
            <span className="supplier-qty-amount">TVA {Number(vatRate ?? 0).toFixed(0)}%</span>
            <span className="supplier-qty-amount supplier-qty-st">{money(totalST)} ST</span>
          </div>
          {selectedSupplierIds.map((supplierId) => {
            const supplierName = form?.purchase_order_partner_suppliers.find((s) => s.id === supplierId)?.name ?? supplierId;
            const currentQty = getSupplierQtyForProduct(productId, supplierId);
            const st = (currentQty * Number(unitPrice ?? 0)) * (1 + (Number(vatRate ?? 0) / 100));
            const supplierRectifState = supplierProductCorrectionState(productId, supplierId);
            return (
              <div key={`${productId}-${supplierId}`} className="supplier-qty-cell">
                <span className="supplier-qty-label" title={supplierName} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {supplierName}
                  {renderCorrectionBadge(supplierRectifState)}
                </span>
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={currentQty}
                  disabled={isSupplierLocked(supplierId)}
                  className="supplier-qty-input"
                  style={{ textAlign: 'center' }}
                  onChange={(event) => setLineSupplierQty(productId, supplierId, event.target.value)}
                />
                <span className="supplier-qty-amount">{money(Number(unitPrice ?? 0))} HT</span>
                <span className="supplier-qty-amount">TVA {Number(vatRate ?? 0).toFixed(0)}%</span>
                <span className="supplier-qty-amount supplier-qty-st">{money(st)} ST</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const renderCorrectionBadge = (state: { tone: 'none' | 'pending' | 'resolved'; tooltip: string }, onClick?: (() => void) | null) => {
    if (state.tone === 'none') return null;
    const handleClick: React.MouseEventHandler<HTMLSpanElement> | undefined = onClick
      ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }
      : undefined;
    if (state.tone === 'pending') {
      return (
        <span className="rectif-state-icon pending" title={state.tooltip} onClick={handleClick} style={onClick ? { cursor: 'pointer' } : undefined}>
          <AlertTriangle size={13} />
        </span>
      );
    }
    return (
      <span className="rectif-state-icon resolved" title={state.tooltip}>
        <CheckCircle2 size={13} />
      </span>
    );
  };
  const nodeCorrectionState = (nodeKey: string) => {
    if (nodeKey === 'root') return correctionStateFor('campaign');
    if (nodeKey.startsWith('bu:')) return correctionStateFor('business_unit', null, nodeKey.replace('bu:', ''), null);
    if (nodeKey.startsWith('group:')) return correctionStateFor('group_brand', null, null, nodeKey.replace('group:', ''));
    return { tone: 'none' as const, tooltip: '' };
  };
  const openScopeRectifModal = (scope: 'campaign' | 'business_unit' | 'group_brand' | 'product', title: string, buId?: string | null, groupId?: string | null, productId?: string | null) => {
    setScopeRectifModalState({ scope, buId, groupId, productId, title });
    setIsScopeRectifModalOpen(true);
  };
  const getScopeGroupedCorrections = (scope: 'campaign' | 'business_unit' | 'group_brand' | 'product', buId?: string | null, groupId?: string | null, productId?: string | null) => {
    return correctionGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (scope === 'campaign') return item.scope_type === 'campaign';
          if (scope === 'business_unit') return !!buId && item.scope_type === 'business_unit' && item.campaign_business_unit_id === buId;
          if (scope === 'group_brand') return !!groupId && item.scope_type === 'group_brand' && item.campaign_group_brand_id === groupId;
          return !!productId && item.scope_type === 'product' && item.product_id === productId;
        }),
      }))
      .filter((group) => group.items.length > 0);
  };
  const supplierProductCorrectionState = (productId: string, supplierId: string) => {
    const globalItems = (form?.admin_correction_items ?? []).filter((item) => !item.resolved && item.scope_type === 'product' && item.product_id === productId);
    const review = (form?.purchase_order_supplier_reviews ?? []).find((item) => item.supplier_id === supplierId);
      const supplierItems = (review?.correction_items ?? []).filter((item: any) => !item.resolved && item.scope_type === 'product' && item.product_id === productId);
    const count = globalItems.length + supplierItems.length;
    return {
      tone: count > 0 ? 'pending' as const : 'none' as const,
      tooltip: count > 0 ? `${count} rectification(s) produit a traiter` : '',
    };
  };
  const correctionScopeCounts = (items: CorrectionGroup['items']) => {
    const counts = { campaign: 0, business_unit: 0, group_brand: 0, product: 0 };
    for (const item of items) counts[item.scope_type] += 1;
    return counts;
  };
  const correctionItemDisplay = (item: CorrectionGroup['items'][number]) => {
    if (item.scope_type !== 'product') return item.message;
    const name = item.product_id ? (productNameById.get(item.product_id) ?? item.product_id) : 'Produit';
    return `${name} - ${item.message}`;
  };
  const visibleCorrectionGroups = useMemo(() => correctionGroups.filter((group) => group.items.length > 0 || group.key === 'general'), [correctionGroups]);
  const detailCorrectionGroup = useMemo(
    () => visibleCorrectionGroups.find((group) => group.key === detailCorrectionGroupKey) ?? null,
    [detailCorrectionGroupKey, visibleCorrectionGroups],
  );
  const hasAnyCorrectionSignal = useMemo(
    () => correctionGroups.some((group) => group.items.length > 0 || !!group.note?.trim()),
    [correctionGroups],
  );

  const conditionsByScope = useMemo(() => {
    const byProduct = new Map<string, ConditionState[]>();
    const byGroup = new Map<string, ConditionState[]>();
    const byBu = new Map<string, ConditionState[]>();
    const campaign: ConditionState[] = [];

    for (const item of conditionStates) {
      const source = form?.conditions.find((condition) => condition.label === item.label);
      if (!source) continue;
      if (source.scope_type === 'product' && source.product_id) {
        byProduct.set(source.product_id, [...(byProduct.get(source.product_id) ?? []), item]);
      } else if (source.scope_type === 'group_brand' && source.campaign_group_brand_id) {
        byGroup.set(source.campaign_group_brand_id, [...(byGroup.get(source.campaign_group_brand_id) ?? []), item]);
      } else if (source.scope_type === 'business_unit' && source.campaign_business_unit_id) {
        byBu.set(source.campaign_business_unit_id, [...(byBu.get(source.campaign_business_unit_id) ?? []), item]);
      } else if (source.scope_type === 'campaign') {
        campaign.push(item);
      }
    }

    return { byProduct, byGroup, byBu, campaign };
  }, [conditionStates, form?.conditions]);

  const buAccordionBlocks = useMemo(() => {
    if (!form || !selectedSectionKey.startsWith('bu:')) {
      return { directProducts: [] as typeof allProducts, groupedBlocks: [] as Array<{ key: string; label: string; products: typeof allProducts }> };
    }
    const buId = selectedSectionKey.replace('bu:', '');
    const bu = form.business_units.find((item) => item.id === buId);
    if (!bu) {
      return { directProducts: [] as typeof allProducts, groupedBlocks: [] as Array<{ key: string; label: string; products: typeof allProducts }> };
    }
    const blocks: Array<{ key: string; label: string; products: typeof allProducts }> = [];
    const sansGroupIds = new Set(
      bu.groups
        .filter((group) => group.name.trim().toLowerCase() === 'sans group')
        .map((group) => group.id),
    );
    const buDirectProducts = allProducts.filter((item) => item.buId === buId && (item.groupId === null || sansGroupIds.has(item.groupId)));
    for (const group of bu.groups) {
      const groupProducts = allProducts.filter((item) => item.groupId === group.id);
      if (!groupProducts.length) continue;
      if (group.name.trim().toLowerCase() === 'sans group') continue;
      blocks.push({ key: `group:${group.id}`, label: `GROUP: ${group.name} (${groupProducts.length})`, products: groupProducts });
    }
    return { directProducts: buDirectProducts, groupedBlocks: blocks };
  }, [allProducts, form, selectedSectionKey]);

  const save = async (submit: boolean) => {
    if (!campaignId) return;
    if (isReadOnly) return;
    if (submit && blockingRules.length) {
      setFeedback('Certaines conditions bloquantes ne sont pas respectees.');
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      let allocationsPayload = lineSupplierAllocations;
      if (phase === 'purchase_orders' && multiSupplierEnabled && selectedSupplierIds.length === 1) {
        const supplierId = selectedSupplierIds[0];
        allocationsPayload = Object.fromEntries(
          Object.entries(quantities)
            .filter(([, qty]) => Number(qty ?? 0) > 0)
            .map(([productId, qty]) => [productId, [{ supplier_id: supplierId, quantity: Number(qty ?? 0) }]]),
        );
      }
      await saveCampaignDynamicForm({
        campaignId,
        phaseKey: phase,
        pharmacyId: profile?.pharmacy_id,
        quantitiesByProductId: quantities,
        selectedSupplierIds,
        lineSupplierAllocationsByProductId: allocationsPayload,
        delegateOrderToAdmin: mustDelegateToAdmin ? true : delegateOrderToAdmin,
        submit,
      });
      setFeedback(submit ? 'Formulaire soumis avec succes.' : 'Brouillon enregistre.');
      await load();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Enregistrement impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const dispatchOrder = async (channel: 'email' | 'sms' | 'whatsapp') => {
    if (!form?.submission_id) return;
    if (!dispatchSupplierId) {
      setFeedback('Choisissez un fournisseur concerne pour passer la commande.');
      return;
    }
    try {
      const supplier = form.purchase_order_partner_suppliers.find((item) => item.id === dispatchSupplierId);
      if (!supplier) throw new Error('Fournisseur introuvable.');
      const doc = await buildPurchaseOrderDispatchDocument({
        submissionId: form.submission_id,
        supplierId: supplier.id,
      });
      const pdfBlob = buildPurchaseOrderInvoicePdf({
        date: new Date().toLocaleDateString('fr-FR'),
        participant: doc.participant,
        laboratory_name: doc.laboratory_name,
        supplier_name: doc.supplier.name,
        lines: doc.lines,
        total_ht: doc.total_ht,
        total_tva: doc.total_tva,
        total_ttc: doc.total_ttc,
        dispatch_info: doc.last_dispatch ?? null,
      });
      const fileName = `BC_${doc.participant.name.replace(/\s+/g, '_')}_${doc.supplier.name.replace(/\s+/g, '_')}.pdf`;
      downloadBlob(pdfBlob, fileName);
      await dispatchPurchaseOrderToSuppliers({
        submissionId: form.submission_id,
        supplierIds: [supplier.id],
        channel,
        attachment: {
          file_name: fileName,
          mime_type: 'application/pdf',
          base64: await blobToBase64(pdfBlob),
        },
      });
      setFeedback(`Commande envoyee (${channel}) au fournisseur ${supplier.name}.`);
      await load();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Envoi impossible.');
    }
  };

  const printPurchaseOrderPdf = async () => {
    if (!form?.submission_id) return;
    if (!dispatchSupplierId) {
      setFeedback('Choisissez un fournisseur concerne pour imprimer le BC.');
      return;
    }
    const supplier = form.purchase_order_partner_suppliers.find((item) => item.id === dispatchSupplierId);
    if (!supplier) return;
    const doc = await buildPurchaseOrderDispatchDocument({
      submissionId: form.submission_id,
      supplierId: supplier.id,
    });
    const pdfBlob = buildPurchaseOrderInvoicePdf({
      date: new Date().toLocaleDateString('fr-FR'),
      participant: doc.participant,
      laboratory_name: doc.laboratory_name,
      supplier_name: doc.supplier.name,
      lines: doc.lines,
      total_ht: doc.total_ht,
      total_tva: doc.total_tva,
      total_ttc: doc.total_ttc,
      dispatch_info: doc.last_dispatch ?? null,
    });
    const fileName = `BC_${doc.participant.name.replace(/\s+/g, '_')}_${doc.supplier.name.replace(/\s+/g, '_')}.pdf`;
    downloadBlob(pdfBlob, fileName);
    setFeedback(`PDF du bon de commande genere pour ${supplier.name}.`);
  };

  return (
      <div className="grid">
      <Card className="phase-hero">
        <div className="toolbar">
          <div>
            <h1>{PHASE_LABEL[phase]}</h1>
            <p>{form?.campaign_name ?? 'Campagne'} - Saisir les quantites souhaitees par produit.</p>
            {phase === 'purchase_orders' && form && (
              <div style={{ marginTop: 8 }}>
                <span className={`status-pill ${purchaseIntentionsPrerequisiteTone(form.purchase_order_prerequisite_status)}`}>
                  {purchaseIntentionsPrerequisiteLabel(form.purchase_order_prerequisite_status)}
                </span>
                <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#667085' }}>
                  {form.purchase_order_allow_higher_than_intentions
                    ? 'Depassement autorise: vous pouvez saisir des quantites BC superieures aux intentions acceptees.'
                    : 'Depassement non autorise: les quantites BC ne peuvent pas depasser les intentions acceptees.'}
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#475467' }}>
                  Fournisseurs selectionnes: {selectedSupplierIds.length}
                </p>
              </div>
            )}
          </div>
          <div style={{ display: 'inline-flex', gap: 8 }}>
            {canResetPurchaseOrderFromIntentions && (
              <Button
                variant="secondary"
                type="button"
                onClick={resetPurchaseOrderFromIntentions}
              >
                Reinitialiser depuis intentions
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/pharmacy/campaigns')}>Retour portail</Button>
          </div>
        </div>
      </Card>

      {feedback && <section className="alert">{feedback}</section>}
      {form?.submission_status === 'needs_correction' && hasAnyCorrectionSignal && (
        <section
          className="alert"
          style={{
            borderColor: '#fda29b',
            background: '#fff1f2',
            color: '#9f1239',
            borderLeft: '6px solid #e11d48',
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Rectification demandee par l&apos;admin</p>
          <p style={{ margin: '4px 0 0 0' }}>Merci de corriger puis soumettre a nouveau.</p>
          <div style={{ marginTop: 10 }}>
            <Carousel className="grid" style={{ gap: 8 } as React.CSSProperties}>
              <CarouselContent>
                {visibleCorrectionGroups.map((group, index) => {
                  const counts = correctionScopeCounts(group.items);
                  return (
                    <CarouselItem key={`slide-${group.key}`}>
                      <div style={{ border: '1px solid #fecdd3', background: '#fff7f8', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
                          {index + 1}/{visibleCorrectionGroups.length} - {group.label === 'General' ? 'General' : `Fournisseur: ${group.label}`}
                        </p>
                        <div className="toolbar" style={{ alignItems: 'center', gap: 8 }}>
                          <p style={{ margin: 0, fontSize: 12, flex: 1 }}>
                            Produits: <strong>{counts.product}</strong> | BU: <strong>{counts.business_unit}</strong> | GROUP: <strong>{counts.group_brand}</strong> | Campagne: <strong>{counts.campaign}</strong>
                          </p>
                          <Button type="button" variant="ghost" className="rectif-link-btn" onClick={() => setDetailCorrectionGroupKey(group.key)}>
                            <Eye size={14} /> Afficher le detail
                          </Button>
                        </div>
                        {group.note?.trim() && <p style={{ margin: 0, fontSize: 12 }}>Motif: {group.note}</p>}
                      </div>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
              <div style={{ display: 'inline-flex', gap: 8 }}>
                <CarouselPrevious className="status-pill" />
                <CarouselNext className="status-pill" />
              </div>
            </Carousel>
          </div>
        </section>
      )}
      {isLoading && <Card><p style={{ margin: 0 }}>Chargement...</p></Card>}

      {!isLoading && form && (
        <>
          <Card>
            <div className="toolbar">
              <span className={`status-pill ${statusToneClass(form.submission_status, blockingRules.length > 0)}`}>Statut: {statusLabel(form.submission_status)}</span>
              <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {!!blockingRules.length && (
                  <button
                    type="button"
                    className="status-pill warn"
                    onClick={() => setShowBlockingDetails((current) => !current)}
                    style={{ cursor: 'pointer' }}
                  >
                    {blockingRules.length} bloquante(s)
                  </button>
                )}
                <span style={{ margin: 0, color: '#667085', fontSize: 13 }}>{form.conditions.length} actives / {form.total_conditions_count} total</span>
              </div>
            </div>
            {form.other_phase_conditions_count > 0 && (
              <div style={{ marginTop: 10, border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10, padding: 10 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#92400e' }}>
                  {form.other_phase_conditions_count} condition(s) existent mais s'appliquent a une autre phase.
                </p>
              </div>
            )}
            {phase === 'purchase_orders' && form.prefilled_from_phase === 'purchase_intentions' && (
              <div style={{ marginTop: 10, border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: 10, padding: 10 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#1d4ed8' }}>
                  BC pre-rempli depuis les intentions d'achat
                  {form.prefilled_from_updated_at ? ` (mise a jour: ${new Date(form.prefilled_from_updated_at).toLocaleString('fr-FR')})` : ''}.
                  Vous pouvez ajuster puis soumettre.
                </p>
              </div>
            )}
            {form.admin_correction_note && (
              <div style={{ marginTop: 10, border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: 10, padding: 10 }}>
                <p style={{ margin: 0 }}>Retour admin (general): {form.admin_correction_note}</p>
              </div>
            )}
            {!!blockingRules.length && showBlockingDetails && (
              <div style={{ marginTop: 8, border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 10, padding: 10 }}>
                <div className="rule-list">
                  {blockingRules.map((rule) => <p key={rule} className="rule-item">Condition bloquante: {rule}</p>)}
                </div>
              </div>
            )}
          </Card>

          {phase === 'purchase_orders' && form && (
            <Card>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
                <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>Fournisseur(s) du bon de commande</p>
                {form.purchase_order_partner_suppliers.length === 0 ? (
                  <p style={{ margin: 0, color: '#b42318', fontSize: 13 }}>
                    Aucun fournisseur partenaire defini. Configurez-les dans Parametres.
                  </p>
                ) : (
                  <div className="grid" style={{ gap: 8 }}>
                    <div className="toolbar" style={{ alignItems: 'center' }}>
                      <p style={{ margin: 0, color: '#475467', fontSize: 13 }}>
                        {selectedSupplierIds.length} fournisseur(s) selectionne(s)
                      </p>
                      <p style={{ margin: 0, color: multiSupplierEnabled ? '#166534' : '#92400e', fontSize: 12 }}>
                        Mode multi-fournisseurs: {multiSupplierEnabled ? 'ACTIF' : 'INACTIF'}
                      </p>
                      <Button variant="secondary" type="button" onClick={openSupplierModal} disabled={isReadOnly || hasAcceptedSupplierLocks}>Choisir les fournisseurs</Button>
                    </div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 8 }}>
                      {form.purchase_order_order_placement_mode === 'participant_choice' && (
                        <div className="toolbar">
                          <p style={{ margin: 0, color: '#334155', fontSize: 13 }}>Autoriser l&apos;administrateur a passer la commande a ma place</p>
                          <Switch checked={delegateOrderToAdmin} disabled={!canToggleDelegation} onCheckedChange={setDelegateOrderToAdmin} />
                        </div>
                      )}
                    </div>
                    {selectedPartnerSupplierNames.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {selectedPartnerSupplierNames.map((name) => <span key={name} className="status-pill">{name}</span>)}
                      </div>
                    )}
                    {selectedSupplierIds.length > 0 && (
                      <div>
                        <Button type="button" variant="secondary" title="Imprimer le BC (PDF)" style={iconActionBtnStyle} disabled={!canPrintPurchaseOrder} onClick={() => void printPurchaseOrderPdf()}>
                          <Printer size={16} />
                        </Button>
                      </div>
                    )}
                    {participantCanDispatchAcceptedOrder && (
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, display: 'grid', gap: 6 }}>
                        <p style={{ margin: 0, fontSize: 13, color: '#334155' }}>Passer la commande maintenant</p>
                        <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                          <Button type="button" variant="secondary" title="Envoyer email" style={iconActionBtnStyle} onClick={() => void dispatchOrder('email')}><Mail size={16} /></Button>
                          <Button type="button" variant="secondary" title="Envoyer SMS" style={iconActionBtnStyle} onClick={() => void dispatchOrder('sms')}><MessageSquare size={16} /></Button>
                          <Button type="button" variant="secondary" title="Envoyer WhatsApp" style={iconActionBtnStyle} onClick={() => void dispatchOrder('whatsapp')}><MessageCircle size={16} /></Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card>
            <div className="form-layout">
              <aside className="tree-panel">
                <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>Sections</p>
                <div className="tree-list">
                  {treeNodes.map((node) => (
                    <button
                      key={node.key}
                      type="button"
                      className={`tree-node level-${node.level} ${node.level > 0 ? 'tree-node-sub' : ''} ${selectedSectionKey === node.key ? 'active' : ''} ${node.selectable ? '' : 'disabled'}`}
                      disabled={!node.selectable}
                      onClick={() => {
                        setSelectedSectionKey(node.key);
                        setSectionPage(1);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {node.label}
                        {renderCorrectionBadge(
                          nodeCorrectionState(node.key),
                          node.key === 'root'
                            ? () => openScopeRectifModal('campaign', 'Rectifications campagne')
                            : node.key.startsWith('bu:')
                              ? () => openScopeRectifModal('business_unit', `Rectifications BU`, node.key.replace('bu:', ''), null)
                              : node.key.startsWith('group:')
                                ? () => openScopeRectifModal('group_brand', `Rectifications GROUP`, null, node.key.replace('group:', ''))
                                : null,
                        )}
                      </span>
                      <span className="count-badge">{node.filledCount}/{node.productCount}</span>
                    </button>
                  ))}
                </div>
              </aside>
              <div className="scope-card">
                {selectedSectionKey.startsWith('bu:') && (buAccordionBlocks.directProducts.length > 0 || buAccordionBlocks.groupedBlocks.length > 0) ? (
                  <div className="grid" style={{ gap: 10 }}>
                    {(() => {
                      const buId = selectedSectionKey.replace('bu:', '');
                      const buConditions = conditionsByScope.byBu.get(buId) ?? [];
                      if (!buConditions.length) return null;
                      return (
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.6rem 0.7rem', background: buConditions.some((c) => !c.ok) ? '#fff7ed' : '#f0fdf4' }}>
                          <p style={{ margin: 0, fontSize: 13, color: buConditions.some((c) => !c.ok) ? '#9a3412' : '#166534' }}>
                            {buConditions.every((c) => c.ok) ? 'Conditions BU respectees' : 'Conditions BU non respectees'}: {buConditions.map((c) => c.label).join(' | ')}
                          </p>
                        </div>
                      );
                    })()}
                    {buAccordionBlocks.directProducts.length > 0 && (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.7rem' }}>
                        <div className="toolbar">
                          <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>Produits directs BU</p>
                          <span className="count-badge">{buAccordionBlocks.directProducts.filter((p) => p.qty > 0).length}/{buAccordionBlocks.directProducts.length}</span>
                        </div>
                        <div className="grid" style={{ gap: 8 }}>
                          {buAccordionBlocks.directProducts.map((product) => {
                            const stHt = product.qty * product.unitPrice;
                            const stTtc = stHt * (1 + product.vatRate / 100);
                            const productConditions = conditionsByScope.byProduct.get(product.id) ?? [];
                            const tone = getConditionTone(productConditions);
                            return (
                              <label key={`direct-${product.id}`} className="product-line rich" style={{ gridTemplateColumns: isCompactLayout ? '1fr' : (isSplitPerSupplier ? 'minmax(220px,1fr) minmax(0,1.25fr)' : 'minmax(220px,1fr) 130px 110px 90px 130px'), alignItems: isSplitPerSupplier ? 'start' : 'center' }}>
                                <span className="product-name-inline" style={{ color: tone === 'warn' ? '#b42318' : tone === 'ok' ? '#166534' : undefined, fontWeight: tone ? 600 : 500 }}>
                                  <span>
                                    {product.name}
                                    {renderIntentionsReference(product.id)}
                                  </span>
                                  <span className="product-icons-inline">
                                    {renderCorrectionBadge(
                                      correctionStateFor('product', product.id, product.buId, product.groupId),
                                      () => openScopeRectifModal('product', `Rectifications produit: ${product.name}`, product.buId, product.groupId, product.id),
                                    )}
                                    {productConditions.map((c) => (
                                      <ConditionIcon key={`${product.id}-${c.label}`} ok={c.ok} title={`${c.label} - ${c.detail}`} />
                                    ))}
                                  </span>
                                </span>
                                {renderQuantityEditor(product.id, tone, product.unitPrice, product.vatRate)}
                                {!isSplitPerSupplier && <span className="product-line-amount">{money(product.unitPrice)} HT</span>}
                                {!isSplitPerSupplier && <span className="product-line-amount">TVA {product.vatRate.toFixed(0)}%</span>}
                                {!isSplitPerSupplier && <span className="product-line-amount">{money(stTtc)} TTC</span>}
                              </label>
                            );
                          })}
                        </div>
                        <div className="subtotal-row">
                          <span>Sous-total</span>
                          <strong style={{ color: getConditionTone(conditionsByScope.byBu.get(selectedSectionKey.replace('bu:', '')) ?? []) === 'warn' ? '#b42318' : getConditionTone(conditionsByScope.byBu.get(selectedSectionKey.replace('bu:', '')) ?? []) === 'ok' ? '#166534' : undefined }}>
                            {money(buAccordionBlocks.directProducts.reduce((acc, p) => acc + (p.qty * p.unitPrice), 0))} HT
                            {' - '}
                            {money(buAccordionBlocks.directProducts.reduce((acc, p) => acc + (p.qty * p.unitPrice * (1 + p.vatRate / 100)), 0))} TTC
                          </strong>
                          {renderScopeConditionMeta(conditionsByScope.byBu.get(selectedSectionKey.replace('bu:', '')) ?? [])}
                        </div>
                        {isSplitPerSupplier && (
                          <div className="supplier-subtotals">
                            {Array.from(buildSupplierTotalsForProducts(buAccordionBlocks.directProducts).entries()).map(([supplierId, totals]) => {
                              const supplierName = form?.purchase_order_partner_suppliers.find((s) => s.id === supplierId)?.name ?? supplierId;
                              return (
                                <p key={`direct-sub-${supplierId}`} style={{ margin: 0, fontSize: 12, color: '#475467' }}>
                                  {supplierName}: {totals.qty.toFixed(3)} U - {money(totals.ht)} HT - {money(totals.ttc)} TTC
                                </p>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {buAccordionBlocks.groupedBlocks.map((block) => {
                      const isOpen = expandedBlocks[block.key] ?? true;
                      const groupId = block.key.replace('group:', '');
                      const groupConditions = conditionsByScope.byGroup.get(groupId) ?? [];
                      return (
                        <section key={block.key} className="accordion-clean">
                          <button
                            type="button"
                            className="accordion-trigger"
                            onClick={() => setExpandedBlocks((current) => ({ ...current, [block.key]: !isOpen }))}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              {block.label}
                              {groupConditions.length > 0 && (
                                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                  {groupConditions.map((c) => (
                                    <ConditionIcon key={`${block.key}-${c.label}`} ok={c.ok} title={`${c.label} - ${c.detail}`} />
                                  ))}
                                </span>
                              )}
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <span className="count-badge">{block.products.filter((p) => p.qty > 0).length}/{block.products.length}</span>
                              <ChevronRight size={16} className={`accordion-icon ${isOpen ? 'open' : ''}`} />
                            </span>
                          </button>
                          {isOpen && (
                            <div className="accordion-content grid" style={{ gap: 8 }}>
                            {block.products.map((product) => {
                              const stHt = product.qty * product.unitPrice;
                              const stTtc = stHt * (1 + product.vatRate / 100);
                              const productConditions = conditionsByScope.byProduct.get(product.id) ?? [];
                              const tone = getConditionTone(productConditions);
                              return (
                                <label key={`${block.key}-${product.id}`} className="product-line rich" style={{ gridTemplateColumns: isCompactLayout ? '1fr' : (isSplitPerSupplier ? 'minmax(220px,1fr) minmax(0,1.25fr)' : 'minmax(220px,1fr) 130px 110px 90px 130px'), alignItems: isSplitPerSupplier ? 'start' : 'center' }}>
                                  <span className="product-name-inline" style={{ color: tone === 'warn' ? '#b42318' : tone === 'ok' ? '#166534' : undefined, fontWeight: tone ? 600 : 500 }}>
                                    <span>
                                      {product.name}
                                      {renderIntentionsReference(product.id)}
                                    </span>
                                    <span className="product-icons-inline">
                                      {renderCorrectionBadge(
                                        correctionStateFor('product', product.id, product.buId, product.groupId),
                                        () => openScopeRectifModal('product', `Rectifications produit: ${product.name}`, product.buId, product.groupId, product.id),
                                      )}
                                      {productConditions.map((c) => (
                                        <ConditionIcon key={`${block.key}-${product.id}-${c.label}`} ok={c.ok} title={`${c.label} - ${c.detail}`} />
                                      ))}
                                    </span>
                                  </span>
                                  {renderQuantityEditor(product.id, tone, product.unitPrice, product.vatRate)}
                                  {!isSplitPerSupplier && <span className="product-line-amount">{money(product.unitPrice)} HT</span>}
                                  {!isSplitPerSupplier && <span className="product-line-amount">TVA {product.vatRate.toFixed(0)}%</span>}
                                  {!isSplitPerSupplier && <span className="product-line-amount">{money(stTtc)} TTC</span>}
                                </label>
                              );
                            })}
                            <div className="subtotal-row">
                              <span>Sous-total</span>
                              <strong style={{ color: getConditionTone(groupConditions) === 'warn' ? '#b42318' : getConditionTone(groupConditions) === 'ok' ? '#166534' : undefined }}>
                                {money(block.products.reduce((acc, p) => acc + (p.qty * p.unitPrice), 0))} HT
                                {' - '}
                                {money(block.products.reduce((acc, p) => acc + (p.qty * p.unitPrice * (1 + p.vatRate / 100)), 0))} TTC
                              </strong>
                              {renderScopeConditionMeta(groupConditions)}
                            </div>
                            {isSplitPerSupplier && (
                              <div className="supplier-subtotals">
                                {Array.from(buildSupplierTotalsForProducts(block.products).entries()).map(([supplierId, totals]) => {
                                  const supplierName = form?.purchase_order_partner_suppliers.find((s) => s.id === supplierId)?.name ?? supplierId;
                                  return (
                                    <p key={`group-sub-${block.key}-${supplierId}`} style={{ margin: 0, fontSize: 12, color: '#475467' }}>
                                      {supplierName}: {totals.qty.toFixed(3)} U - {money(totals.ht)} HT - {money(totals.ttc)} TTC
                                    </p>
                                  );
                                })}
                              </div>
                            )}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    {pagedProducts.map((product) => {
                      const stHt = product.qty * product.unitPrice;
                      const stTtc = stHt * (1 + product.vatRate / 100);
                      const parentBu = form.business_units.find((bu) => bu.id === product.buId);
                      const parentGroup = parentBu?.groups.find((group) => group.id === product.groupId);
                      const affiliation = parentGroup ? `GROUP: ${parentGroup.name}` : (parentBu ? `BU direct: ${parentBu.name}` : 'Produit general');
                      const productConditions = conditionsByScope.byProduct.get(product.id) ?? [];
                      const tone = getConditionTone(productConditions);
                      return (
                      <label key={product.id} className="product-line rich" style={{ gridTemplateColumns: isCompactLayout ? '1fr' : (isSplitPerSupplier ? 'minmax(220px,1fr) minmax(180px,1fr) minmax(0,1.25fr)' : 'minmax(220px,1fr) minmax(180px,1fr) 130px 110px 90px 130px'), alignItems: isSplitPerSupplier ? 'start' : 'center' }}>
                        <span className="product-name-inline" style={{ color: tone === 'warn' ? '#b42318' : tone === 'ok' ? '#166534' : undefined, fontWeight: tone ? 600 : 500 }}>
                          <span>
                            {product.name}
                            {renderIntentionsReference(product.id)}
                          </span>
                          <span className="product-icons-inline">
                            {renderCorrectionBadge(
                              correctionStateFor('product', product.id, product.buId, product.groupId),
                              () => openScopeRectifModal('product', `Rectifications produit: ${product.name}`, product.buId, product.groupId, product.id),
                            )}
                            {productConditions.map((c) => (
                              <ConditionIcon key={`${product.id}-${c.label}`} ok={c.ok} title={`${c.label} - ${c.detail}`} />
                            ))}
                          </span>
                        </span>
                        <span className="status-pill" style={{ width: 'fit-content' }}>{affiliation}</span>
                        {renderQuantityEditor(product.id, tone, product.unitPrice, product.vatRate)}
                        {!isSplitPerSupplier && <span className="product-line-amount">{money(product.unitPrice)} HT</span>}
                        {!isSplitPerSupplier && <span className="product-line-amount">TVA {product.vatRate.toFixed(0)}%</span>}
                        {!isSplitPerSupplier && <span className="product-line-amount">{money(stTtc)} TTC</span>}
                      </label>
                    );
                  })}
                    {pagedProducts.length === 0 && <p style={{ margin: 0, color: '#667085' }}>Aucun produit dans cette section.</p>}
                    <div className="toolbar" style={{ marginTop: 10 }}>
                      <Button variant="secondary" disabled={sectionPage <= 1} onClick={() => setSectionPage((p) => Math.max(1, p - 1))}>Precedent</Button>
                      <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>Page {sectionPage} / {pageCount}</p>
                      <Button variant="secondary" disabled={sectionPage >= pageCount} onClick={() => setSectionPage((p) => Math.min(pageCount, p + 1))}>Suivant</Button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div style={{ marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
              <div className="subtotal-row" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                <span>Sous-total section</span>
                <strong style={{ color: selectedSectionKey === 'root'
                  ? (getConditionTone(conditionsByScope.campaign) === 'warn' ? '#b42318' : getConditionTone(conditionsByScope.campaign) === 'ok' ? '#166534' : undefined)
                  : selectedSectionKey.startsWith('group:')
                    ? (getConditionTone(conditionsByScope.byGroup.get(selectedSectionKey.replace('group:', '')) ?? []) === 'warn' ? '#b42318' : getConditionTone(conditionsByScope.byGroup.get(selectedSectionKey.replace('group:', '')) ?? []) === 'ok' ? '#166534' : undefined)
                    : (getConditionTone(conditionsByScope.byBu.get(selectedSectionKey.replace('bu:', '')) ?? []) === 'warn' ? '#b42318' : getConditionTone(conditionsByScope.byBu.get(selectedSectionKey.replace('bu:', '')) ?? []) === 'ok' ? '#166534' : undefined) }}>
                  {sectionTotals.qty} U - {money(sectionTotals.ht)} HT - {money(sectionTotals.ttc)} TTC
                </strong>
                {renderScopeConditionMeta(
                  selectedSectionKey === 'root'
                    ? conditionsByScope.campaign
                    : selectedSectionKey.startsWith('group:')
                      ? (conditionsByScope.byGroup.get(selectedSectionKey.replace('group:', '')) ?? [])
                      : (conditionsByScope.byBu.get(selectedSectionKey.replace('bu:', '')) ?? []),
                )}
              </div>
              {isSplitPerSupplier && (
                <div className="supplier-subtotals" style={{ marginTop: 6 }}>
                  {Array.from(buildSupplierTotalsForProducts(visibleProducts).entries()).map(([supplierId, totals]) => {
                    const supplierName = form?.purchase_order_partner_suppliers.find((s) => s.id === supplierId)?.name ?? supplierId;
                    return (
                      <p key={`section-sub-${supplierId}`} style={{ margin: 0, fontSize: 12, color: '#475467' }}>
                        Sous-total section - {supplierName}: {totals.qty.toFixed(3)} U - {money(totals.ht)} HT - {money(totals.ttc)} TTC
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card>
            {missingPurchaseOrderSuppliers && (
              <p style={{ margin: 0, color: '#b42318', fontSize: 12 }}>
                Selection requise: {multiSupplierEnabled ? 'choisissez au moins un fournisseur.' : 'choisissez exactement un fournisseur.'}
              </p>
            )}
            {hasInvalidAllocations && (
              <p style={{ margin: 0, color: '#b42318', fontSize: 12 }}>
                Repartition invalide: la somme allouee par produit doit etre egale a la quantite BC.
              </p>
            )}
            <h2 style={{ fontSize: 16 }}>Conformite des conditions</h2>
            <div className="grid" style={{ gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowConditionDetails((current) => !current)}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  background: '#fff',
                  padding: '8px 10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="status-pill ok">{okConditionCount} respectee(s)</span>
                  <span className={`status-pill ${failedConditionStates.length > 0 ? 'warn' : 'ok'}`}>{failedConditionStates.length} non respectee(s)</span>
                  <span style={{ color: '#64748b', fontSize: 12 }}>{conditionStates.length} active(s)</span>
                </span>
                <ChevronRight size={16} className={`accordion-icon ${showConditionDetails ? 'open' : ''}`} />
              </button>

              {showConditionDetails && failedConditionStates.map((item) => (
                <div key={`${item.scopeLabel}-${item.label}`} className="toolbar" style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 10px', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>{item.label}</p>
                    <p style={{ margin: '2px 0 0 0', color: '#64748b', fontSize: 12 }}>
                      Scope: {item.scopeLabel} - Actuel: {item.current.toFixed(3)} {item.unit} - Cible: {item.target.toFixed(3)} {item.unit}
                    </p>
                    <p style={{ margin: '2px 0 0 0', color: '#9a3412', fontSize: 12 }}>{item.detail}</p>
                  </div>
                  <span className="status-pill warn">Non respectee</span>
                </div>
              ))}
              {conditionStates.length === 0 && (
                <p style={{ margin: 0, color: '#64748b' }}>
                  {form.total_conditions_count > 0
                    ? 'Aucune condition active pour cette phase (des conditions existent pour d\'autres phases).'
                    : 'Aucune condition definie pour cette phase.'}
                </p>
              )}
              {showConditionDetails && conditionStates.length > 0 && conditionStates.every((item) => item.ok) && (
                <p style={{ margin: 0, color: '#166534', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={14} /> Toutes les conditions actives sont respectees.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <div className="totals-strip">
              <div className="totals-chip">
                <p>Total quantites</p>
                <p>{totalQty}</p>
              </div>
              <div className="totals-chip">
                <p>Total HT</p>
                <p>{money(totalAmount)}</p>
              </div>
              <div className="totals-chip">
                <p>Total TTC</p>
                <p>{money(totalTTC)}</p>
              </div>
            </div>
          </Card>

          <Card className="sticky-actions">
            <div className="toolbar">
              <Button variant="secondary" onClick={() => void save(false)} disabled={isSaving || isReadOnly}>{isSaving ? 'Enregistrement...' : 'Enregistrer brouillon'}</Button>
              <Button onClick={() => void save(true)} disabled={isSaving || blockingRules.length > 0 || missingPurchaseOrderSuppliers || hasInvalidAllocations || isReadOnly}>{isSaving ? 'Soumission...' : 'Valider et soumettre'}</Button>
            </div>
            {isReadOnly && <p style={{ margin: '8px 0 0 0', color: '#475467', fontSize: 13 }}>Mode consultation: soumission acceptee et figee par l'administration.</p>}
          </Card>

          {detailCorrectionGroup && (
            <div className="pg-modal-overlay" onClick={() => setDetailCorrectionGroupKey(null)}>
              <div className="pg-modal-card" style={{ width: 'min(820px, 95vw)' }} onClick={(event) => event.stopPropagation()}>
                <div className="toolbar pg-modal-header">
                  <h3 style={{ margin: 0 }}>
                    Detail rectifications - {detailCorrectionGroup.label === 'General' ? 'General' : detailCorrectionGroup.label}
                  </h3>
                  <Button variant="secondary" type="button" onClick={() => setDetailCorrectionGroupKey(null)}>
                    <X size={14} />
                  </Button>
                </div>
                <div style={{ border: '1px solid #fecdd3', background: '#fff7f8', borderRadius: 10, padding: 10, fontSize: 12 }}>
                  {(() => {
                    const counts = correctionScopeCounts(detailCorrectionGroup.items);
                    return (
                      <p style={{ margin: 0 }}>
                        Produits: <strong>{counts.product}</strong> | BU: <strong>{counts.business_unit}</strong> | GROUP: <strong>{counts.group_brand}</strong> | Campagne: <strong>{counts.campaign}</strong>
                      </p>
                    );
                  })()}
                </div>
                <div className="grid" style={{ gap: 6 }}>
                  {detailCorrectionGroup.items.map((item, index) => {
                    const scopeLabel = item.scope_type === 'campaign'
                      ? 'Campagne'
                      : item.scope_type === 'business_unit'
                        ? 'Section BU'
                        : item.scope_type === 'group_brand'
                          ? 'Section GROUP'
                          : 'Produit';
                    return (
                      <p key={`${detailCorrectionGroup.key}-${item.id}-${index}`} style={{ margin: 0, fontSize: 13 }}>
                        <strong>{scopeLabel}:</strong> {correctionItemDisplay(item)}
                      </p>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {isScopeRectifModalOpen && (
            <div className="pg-modal-overlay" onClick={() => setIsScopeRectifModalOpen(false)}>
              <div className="pg-modal-card" style={{ width: 'min(780px, 95vw)' }} onClick={(event) => event.stopPropagation()}>
                <div className="toolbar pg-modal-header">
                  <h3 style={{ margin: 0 }}>{scopeRectifModalState.title}</h3>
                  <Button variant="secondary" type="button" onClick={() => setIsScopeRectifModalOpen(false)}>
                    <X size={14} />
                  </Button>
                </div>
                <div className="grid" style={{ gap: 8 }}>
                  {getScopeGroupedCorrections(scopeRectifModalState.scope, scopeRectifModalState.buId, scopeRectifModalState.groupId, scopeRectifModalState.productId).length === 0 && (
                    <p style={{ margin: 0, color: '#64748b' }}>Aucune rectification pour ce scope.</p>
                  )}
                  {getScopeGroupedCorrections(scopeRectifModalState.scope, scopeRectifModalState.buId, scopeRectifModalState.groupId, scopeRectifModalState.productId).map((group: CorrectionGroup, idx: number, arr: CorrectionGroup[]) => (
                    <div key={group.key} style={{ border: '1px solid #fecdd3', background: '#fff1f2', borderRadius: 10, padding: 10 }}>
                      <p style={{ margin: 0, fontWeight: 700, color: '#9f1239' }}>
                        {idx + 1}/{arr.length} - {group.label === 'General' ? 'General' : `Fournisseur: ${group.label}`}
                      </p>
                      {!!group.note?.trim() && <p style={{ margin: '4px 0 0 0', fontSize: 12 }}>Motif: {group.note}</p>}
                      <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                        {group.items.map((item, itemIndex: number) => (
                          <p key={`${group.key}-${item.id}-${itemIndex}`} style={{ margin: 0, fontSize: 13 }}>
                            <strong>{item.scope_type === 'campaign' ? 'Campagne' : item.scope_type === 'business_unit' ? 'Section BU' : item.scope_type === 'group_brand' ? 'Section GROUP' : 'Produit'}:</strong> {correctionItemDisplay(item)}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {phase === 'purchase_orders' && form && isSupplierModalOpen && (
            <div className="pg-modal-overlay" onClick={() => setIsSupplierModalOpen(false)}>
              <div className="pg-modal-card" style={{ width: 'min(760px, 95vw)' }} onClick={(event) => event.stopPropagation()}>
                <div className="toolbar pg-modal-header">
                  <h3 style={{ margin: 0 }}>Selection des fournisseurs partenaires</h3>
                  <Button variant="secondary" type="button" onClick={() => setIsSupplierModalOpen(false)}>Fermer</Button>
                </div>
                <Input
                  placeholder="Rechercher par denomination ou nature"
                  value={supplierSearch}
                  onChange={(event) => setSupplierSearch(event.target.value)}
                />
                <div className="grid" style={{ gap: 8, maxHeight: '48vh', overflow: 'auto' }}>
                  {filteredPartnerSuppliers.length === 0 && (
                    <p style={{ margin: 0, color: '#64748b' }}>Aucun fournisseur ne correspond a la recherche.</p>
                  )}
                  {filteredPartnerSuppliers.map((supplier) => {
                    const checked = tempSelectedSupplierIds.includes(supplier.id);
                    return (
                      <button
                        key={supplier.id}
                        type="button"
                        onClick={() => {
                          setTempSelectedSupplierIds((current) =>
                            current.includes(supplier.id)
                              ? current.filter((id) => id !== supplier.id)
                              : (multiSupplierEnabled ? [...current, supplier.id] : [supplier.id]),
                          );
                        }}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          border: checked ? '1px solid #1d4ed8' : '1px solid #e4e7ec',
                          borderRadius: 10,
                          padding: '8px 10px',
                          background: checked ? '#eff6ff' : '#fff',
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left',
                        }}
                      >
                        <span>{supplier.name} - {supplier.nature.toUpperCase()}</span>
                        <span className={`status-pill ${checked ? 'ok' : ''}`}>
                          {checked ? 'Selectionne' : 'Cliquer pour ajouter'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="toolbar">
                  <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                    {tempSelectedSupplierIds.length} fournisseur(s) selectionne(s)
                  </p>
                  <div style={{ display: 'inline-flex', gap: 8 }}>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => setTempSelectedSupplierIds([])}
                    >
                      Vider
                    </Button>
                    <Button type="button" onClick={applySupplierSelection}>Ajouter</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      </div>
  );
};
