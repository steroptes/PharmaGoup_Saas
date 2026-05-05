import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { CampaignPhaseKey } from '@/services/campaigns';
import { loadCampaignDynamicForm, saveCampaignDynamicForm } from '@/services/campaignParticipationForms';
import { useAuth } from '@/context/AuthContext';

const PHASE_LABEL: Record<CampaignPhaseKey, string> = {
  purchase_intentions: "Annonce des intentions",
  purchase_orders: 'Creation du bon de commande',
  delivery_notes: 'Collecte des BL',
};

const money = (value: number) => value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.0001;
const includesAny = (kind: string, values: string[]) => values.some((value) => kind.includes(value));

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
  const [selectedBuId, setSelectedBuId] = useState<string>('root');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [sectionPage, setSectionPage] = useState(1);
  const PAGE_SIZE = 8;

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

  const blockingRules = useMemo(() => {
    if (!form) return [] as string[];
    const messages: string[] = [];
    for (const condition of form.conditions) {
      const kind = condition.condition_kind.toLowerCase();
      const target = Number(condition.target_value ?? 0);
      const resolveScope = (scope: string) => {
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
      const scope = resolveScope(condition.scope_type);
      const metric = includesAny(kind, ['qty', 'quantity']) ? scope.qty : scope.amount;
      let evaluated = metric;

      if (kind.includes('pct_total')) {
        const referenceScope = resolveScope(condition.reference_scope_type ?? 'campaign');
        const denominator = includesAny(kind, ['qty', 'quantity']) ? referenceScope.qty : referenceScope.amount;
        evaluated = denominator > 0 ? (metric / denominator) * 100 : 0;
      }

      let ok = true;
      if (kind.includes('_min_')) ok = evaluated >= target;
      if (kind.includes('_max_')) ok = evaluated <= target;
      if (kind.includes('modulo')) ok = target > 0 && approxEqual(evaluated % target, 0);
      if (!ok) messages.push(`${condition.label}: attendu ${condition.operator} ${target}${condition.unit ? ` ${condition.unit}` : ''}, obtenu ${evaluated.toFixed(3)}`);
    }
    return messages;
  }, [form, totals]);

  const setQty = (productId: string, raw: string) => {
    const nextValue = Math.max(0, Number(raw || 0));
    setQuantities((current) => ({ ...current, [productId]: Number.isFinite(nextValue) ? nextValue : 0 }));
  };

  const groupOptions = useMemo(() => {
    if (!form || selectedBuId === 'root') return [] as Array<{ id: string; name: string }>;
    const bu = form.business_units.find((item) => item.id === selectedBuId);
    return bu?.groups ?? [];
  }, [form, selectedBuId]);

  const visibleProducts = useMemo(() => {
    if (!form) return [] as typeof allProducts;
    if (selectedBuId === 'root') return allProducts.filter((item) => item.buId === null);
    if (selectedGroupId === 'all') return allProducts.filter((item) => item.buId === selectedBuId);
    return allProducts.filter((item) => item.buId === selectedBuId && item.groupId === selectedGroupId);
  }, [allProducts, form, selectedBuId, selectedGroupId]);

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

  const conditionStates = useMemo(() => {
    if (!form) return [] as Array<{ label: string; ok: boolean; detail: string }>;
    return form.conditions.map((condition) => {
      const detail = blockingRules.find((item) => item.startsWith(`${condition.label}:`));
      return { label: condition.label, ok: !detail, detail: detail ?? 'Condition respectee' };
    });
  }, [form, blockingRules]);

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
    <div className="grid">
      <Card className="phase-hero">
        <div className="toolbar">
          <div>
            <h1>{PHASE_LABEL[phase]}</h1>
            <p>{form?.campaign_name ?? 'Campagne'} - Saisir les quantites souhaitees par produit.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/pharmacy/campaigns')}>Retour portail</Button>
        </div>
      </Card>

      {feedback && <section className="alert">{feedback}</section>}
      {isLoading && <Card><p style={{ margin: 0 }}>Chargement...</p></Card>}

      {!isLoading && form && (
        <>
          <Card>
            <div className="toolbar">
              <span className={`status-pill ${blockingRules.length ? 'warn' : 'ok'}`}>Statut: {form.submission_status ?? 'non demarre'}</span>
              <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{form.conditions.length} condition(s)</p>
            </div>
            {form.admin_correction_note && (
              <div style={{ marginTop: 10, border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: 10, padding: 10 }}>
                <p style={{ margin: 0 }}>Retour admin: {form.admin_correction_note}</p>
              </div>
            )}
            {!!blockingRules.length && (
              <div style={{ marginTop: 10, border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 10, padding: 10 }}>
                <div className="rule-list">
                  {blockingRules.map((rule) => <p key={rule} className="rule-item">Condition bloquante: {rule}</p>)}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <div className="section-switch">
              <div className="grid grid-2">
              <div>
                <label>Section mère</label>
                <Select
                  value={selectedBuId}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSelectedBuId(next);
                    setSelectedGroupId(next === 'root' ? 'all' : 'all');
                    setSectionPage(1);
                  }}
                >
                  <option value="root">Racine campagne</option>
                  {form.business_units.map((bu) => <option key={bu.id} value={bu.id}>BU: {bu.name}</option>)}
                </Select>
              </div>
              {groupOptions.length > 0 && (
                <div>
                  <label>Section fille (GROUP)</label>
                  <Select
                    value={selectedGroupId}
                    onChange={(event) => {
                      setSelectedGroupId(event.target.value);
                      setSectionPage(1);
                    }}
                  >
                    <option value="all">Tous les GROUP de la BU</option>
                    {groupOptions.map((group) => <option key={group.id} value={group.id}>GROUP: {group.name}</option>)}
                  </Select>
                </div>
              )}
              </div>
            </div>
            <div className="scope-card">
              {pagedProducts.map((product) => {
                const stHt = product.qty * product.unitPrice;
                const stTtc = stHt * (1 + product.vatRate / 100);
                return (
                  <label key={product.id} className="product-line rich">
                    <span>{product.name}</span>
                    <Input type="number" min={0} step="1" disabled={form.submission_status === 'accepted'} value={quantities[product.id] ?? 0} onChange={(event) => setQty(product.id, event.target.value)} />
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
            </div>
            <div style={{ marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
              <p style={{ margin: 0 }}><strong>Sous-total section:</strong> {sectionTotals.qty} U - {money(sectionTotals.ht)} HT - {money(sectionTotals.ttc)} TTC</p>
            </div>
          </Card>

          <Card>
            <h2 style={{ fontSize: 16 }}>Conformite des conditions</h2>
            <div className="grid" style={{ gap: 8 }}>
              {conditionStates.map((item) => (
                <div key={item.label} className="toolbar" style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 10px' }}>
                  <p style={{ margin: 0 }}>{item.label}</p>
                  <span className={`status-pill ${item.ok ? 'ok' : 'warn'}`}>{item.ok ? 'Respectee' : 'Non respectee'}</span>
                </div>
              ))}
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
  );
};
