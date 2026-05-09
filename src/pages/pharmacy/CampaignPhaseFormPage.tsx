import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CampaignPhaseKey } from '@/services/campaigns';
import { loadCampaignDynamicForm, saveCampaignDynamicForm } from '@/services/campaignParticipationForms';
import { useAuth } from '@/context/AuthContext';

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
const purchaseIntentionsPrerequisiteLabel = (status: 'not_planned' | 'not_submitted' | 'submitted') => {
  if (status === 'submitted') return 'Intentions: Soumise';
  if (status === 'not_submitted') return 'Intentions: Non soumise';
  return 'Intentions: Non planifiee';
};
const purchaseIntentionsPrerequisiteTone = (status: 'not_planned' | 'not_submitted' | 'submitted') => {
  if (status === 'submitted') return 'ok';
  if (status === 'not_submitted') return 'warn';
  return '';
};

const money = (value: number) => value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.0001;
const includesAny = (kind: string, values: string[]) => values.some((value) => kind.includes(value));
type ConditionState = { label: string; scopeLabel: string; ok: boolean; current: number; target: number; unit: string; detail: string };

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
  const [selectedSectionKey, setSelectedSectionKey] = useState<string>('root');
  const [sectionPage, setSectionPage] = useState(1);
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({});
  const [showBlockingDetails, setShowBlockingDetails] = useState(false);
  const [showConditionDetails, setShowConditionDetails] = useState(false);
  const PAGE_SIZE = 8;
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
  const correctionTracking = useMemo(() => {
    const unresolved = (form?.admin_correction_items ?? []).filter((item) => !item.resolved);
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
  }, [form?.admin_correction_items]);
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
    const all = form?.admin_correction_items ?? [];
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
  const renderCorrectionBadge = (state: { tone: 'none' | 'pending' | 'resolved'; tooltip: string }) => {
    if (state.tone === 'none') return null;
    if (state.tone === 'pending') {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="rectif-state-icon pending">
              <AlertTriangle size={13} />
            </span>
          </TooltipTrigger>
          <TooltipContent>{state.tooltip}</TooltipContent>
        </Tooltip>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="rectif-state-icon resolved">
            <CheckCircle2 size={13} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{state.tooltip}</TooltipContent>
      </Tooltip>
    );
  };
  const nodeCorrectionState = (nodeKey: string) => {
    if (nodeKey === 'root') return correctionStateFor('campaign');
    if (nodeKey.startsWith('bu:')) return correctionStateFor('business_unit', null, nodeKey.replace('bu:', ''), null);
    if (nodeKey.startsWith('group:')) return correctionStateFor('group_brand', null, null, nodeKey.replace('group:', ''));
    return { tone: 'none' as const, tooltip: '' };
  };

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
    if (submit && blockingRules.length) {
      setFeedback('Certaines conditions bloquantes ne sont pas respectees.');
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      await saveCampaignDynamicForm({
        campaignId,
        phaseKey: phase,
        pharmacyId: profile?.pharmacy_id,
        quantitiesByProductId: quantities,
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

  return (
    <TooltipProvider delayDuration={120}>
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
              </div>
            )}
          </div>
          <Button variant="secondary" onClick={() => navigate('/pharmacy/campaigns')}>Retour portail</Button>
        </div>
      </Card>

      {feedback && <section className="alert">{feedback}</section>}
      {form?.submission_status === 'needs_correction' && correctionTracking.unresolved.length > 0 && (
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
          <p style={{ margin: '4px 0 0 0' }}>
            {form.admin_correction_note?.trim() ? `Motif: ${form.admin_correction_note}` : 'Aucune note detaillee fournie. Merci de corriger puis soumettre a nouveau.'}
          </p>
          {correctionTracking.unresolved.length > 0 && (
            <div style={{ marginTop: 8, borderTop: '1px solid #fecdd3', paddingTop: 8, display: 'grid', gap: 4 }}>
              {correctionTracking.unresolved.map((item, index) => {
                const scopeLabel = item.scope_type === 'campaign'
                  ? 'Campagne'
                  : item.scope_type === 'business_unit'
                    ? 'Section BU'
                    : item.scope_type === 'group_brand'
                      ? 'Section GROUP'
                      : 'Produit';
                return (
                  <p key={`${item.scope_type}-${item.product_id ?? index}-${index}`} style={{ margin: 0, fontSize: 13 }}>
                    <strong>{scopeLabel}:</strong> {item.message}
                  </p>
                );
              })}
            </div>
          )}
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
                <p style={{ margin: 0 }}>Retour admin: {form.admin_correction_note}</p>
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
                        {renderCorrectionBadge(nodeCorrectionState(node.key))}
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
                              <label key={`direct-${product.id}`} className="product-line rich" style={{ gridTemplateColumns: 'minmax(220px,1fr) 130px 110px 90px 130px', alignItems: 'center' }}>
                                <span className="product-name-inline" style={{ color: tone === 'warn' ? '#b42318' : tone === 'ok' ? '#166534' : undefined, fontWeight: tone ? 600 : 500 }}>
                                  <span>{product.name}</span>
                                  <span className="product-icons-inline">
                                    {renderCorrectionBadge(correctionStateFor('product', product.id, product.buId, product.groupId))}
                                    {productConditions.map((c) => (
                                      <ConditionIcon key={`${product.id}-${c.label}`} ok={c.ok} title={`${c.label} - ${c.detail}`} />
                                    ))}
                                  </span>
                                </span>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <Input
                                    type="number"
                                    min={0}
                                    step="1"
                                    disabled={form.submission_status === 'accepted'}
                                    value={quantities[product.id] ?? 0}
                                    onChange={(event) => setQty(product.id, event.target.value)}
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
                                <span className="product-line-amount">{money(product.unitPrice)} HT</span>
                                <span className="product-line-amount">TVA {product.vatRate.toFixed(0)}%</span>
                                <span className="product-line-amount">{money(stTtc)} TTC</span>
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
                                <label key={`${block.key}-${product.id}`} className="product-line rich" style={{ gridTemplateColumns: 'minmax(220px,1fr) 130px 110px 90px 130px', alignItems: 'center' }}>
                                  <span className="product-name-inline" style={{ color: tone === 'warn' ? '#b42318' : tone === 'ok' ? '#166534' : undefined, fontWeight: tone ? 600 : 500 }}>
                                    <span>{product.name}</span>
                                    <span className="product-icons-inline">
                                      {renderCorrectionBadge(correctionStateFor('product', product.id, product.buId, product.groupId))}
                                      {productConditions.map((c) => (
                                        <ConditionIcon key={`${block.key}-${product.id}-${c.label}`} ok={c.ok} title={`${c.label} - ${c.detail}`} />
                                      ))}
                                    </span>
                                  </span>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <Input
                                      type="number"
                                      min={0}
                                      step="1"
                                      disabled={form.submission_status === 'accepted'}
                                      value={quantities[product.id] ?? 0}
                                      onChange={(event) => setQty(product.id, event.target.value)}
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
                                  <span className="product-line-amount">{money(product.unitPrice)} HT</span>
                                  <span className="product-line-amount">TVA {product.vatRate.toFixed(0)}%</span>
                                  <span className="product-line-amount">{money(stTtc)} TTC</span>
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
                      <label key={product.id} className="product-line rich" style={{ gridTemplateColumns: 'minmax(220px,1fr) minmax(180px,1fr) 130px 110px 90px 130px', alignItems: 'center' }}>
                        <span className="product-name-inline" style={{ color: tone === 'warn' ? '#b42318' : tone === 'ok' ? '#166534' : undefined, fontWeight: tone ? 600 : 500 }}>
                          <span>{product.name}</span>
                          <span className="product-icons-inline">
                            {renderCorrectionBadge(correctionStateFor('product', product.id, product.buId, product.groupId))}
                            {productConditions.map((c) => (
                              <ConditionIcon key={`${product.id}-${c.label}`} ok={c.ok} title={`${c.label} - ${c.detail}`} />
                            ))}
                          </span>
                        </span>
                        <span className="status-pill" style={{ width: 'fit-content' }}>{affiliation}</span>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            disabled={form.submission_status === 'accepted'}
                            value={quantities[product.id] ?? 0}
                            onChange={(event) => setQty(product.id, event.target.value)}
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
                        <span className="product-line-amount">{money(product.unitPrice)} HT</span>
                        <span className="product-line-amount">TVA {product.vatRate.toFixed(0)}%</span>
                        <span className="product-line-amount">{money(stTtc)} TTC</span>
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
            </div>
          </Card>

          <Card>
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
              <Button variant="secondary" onClick={() => void save(false)} disabled={isSaving || form.submission_status === 'accepted'}>{isSaving ? 'Enregistrement...' : 'Enregistrer brouillon'}</Button>
              <Button onClick={() => void save(true)} disabled={isSaving || blockingRules.length > 0 || form.submission_status === 'accepted'}>{isSaving ? 'Soumission...' : 'Valider et soumettre'}</Button>
            </div>
            {form.submission_status === 'accepted' && <p style={{ margin: '8px 0 0 0', color: '#475467', fontSize: 13 }}>Soumission acceptee: les quantites sont verrouillees pour cette phase.</p>}
          </Card>
        </>
      )}
      </div>
    </TooltipProvider>
  );
};
