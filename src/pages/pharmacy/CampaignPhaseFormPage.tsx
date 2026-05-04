import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CampaignPhaseKey } from '@/services/campaigns';
import { loadCampaignDynamicForm, saveCampaignDynamicForm } from '@/services/campaignParticipationForms';
import { useAuth } from '@/context/AuthContext';

const PHASE_LABEL: Record<CampaignPhaseKey, string> = {
  purchase_intentions: "Annonce des intentions",
  purchase_orders: 'Creation du bon de commande',
  delivery_notes: 'Collecte des BL',
};

const money = (value: number) => value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

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
    if (!form) return [] as Array<{ id: string; name: string; unitPrice: number; qty: number }>;
    const rows: Array<{ id: string; name: string; unitPrice: number; qty: number }> = [];
    for (const product of form.root_products) {
      rows.push({ id: product.product_id, name: product.designation, unitPrice: product.unit_price_ht, qty: quantities[product.product_id] ?? 0 });
    }
    for (const bu of form.business_units) {
      for (const group of bu.groups) {
        for (const product of group.products) {
          rows.push({ id: product.product_id, name: product.designation, unitPrice: product.unit_price_ht, qty: quantities[product.product_id] ?? 0 });
        }
      }
    }
    return rows;
  }, [form, quantities]);

  const totalQty = useMemo(() => allProducts.reduce((acc, row) => acc + row.qty, 0), [allProducts]);
  const totalAmount = useMemo(() => allProducts.reduce((acc, row) => acc + (row.qty * row.unitPrice), 0), [allProducts]);

  const blockingRules = useMemo(() => {
    if (!form) return [] as string[];
    const messages: string[] = [];
    for (const condition of form.conditions) {
      const kind = condition.condition_kind;
      const value = Number(condition.target_value ?? 0);
      if (kind === 'campaign_min_amount' && totalAmount < value) messages.push(`Montant total minimum campagne: ${value}`);
      if (kind === 'campaign_max_amount' && totalAmount > value) messages.push(`Montant total maximum campagne: ${value}`);
    }
    return messages;
  }, [form, totalAmount]);

  const setQty = (productId: string, raw: string) => {
    const nextValue = Math.max(0, Number(raw || 0));
    setQuantities((current) => ({ ...current, [productId]: Number.isFinite(nextValue) ? nextValue : 0 }));
  };

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
      <Card>
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
              <p style={{ margin: 0 }}>Total quantites: <strong>{totalQty}</strong> - Total HT: <strong>{money(totalAmount)}</strong></p>
              <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>Statut: {form.submission_status ?? 'non demarre'}</p>
            </div>
            {!!blockingRules.length && (
              <div style={{ marginTop: 10, border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 10, padding: 10 }}>
                {blockingRules.map((rule) => <p key={rule} style={{ margin: '4px 0' }}>Condition bloquante: {rule}</p>)}
              </div>
            )}
          </Card>

          {!!form.root_products.length && (
            <Card>
              <h2>Produits racine</h2>
              <div className="grid" style={{ gap: 8 }}>
                {form.root_products.map((product) => (
                  <label key={product.product_id} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 180px', gap: 10, alignItems: 'center' }}>
                    <span>{product.designation}</span>
                    <Input type="number" min={0} step="1" value={quantities[product.product_id] ?? 0} onChange={(event) => setQty(product.product_id, event.target.value)} />
                    <span style={{ textAlign: 'right' }}>{money((quantities[product.product_id] ?? 0) * product.unit_price_ht)} HT</span>
                  </label>
                ))}
              </div>
            </Card>
          )}

          {form.business_units.map((bu) => (
            <Card key={bu.id}>
              <h2>BU: {bu.name}</h2>
              <div className="grid" style={{ gap: 10 }}>
                {bu.groups.map((group) => {
                  const groupTotal = group.products.reduce((acc, product) => acc + ((quantities[product.product_id] ?? 0) * product.unit_price_ht), 0);
                  return (
                    <details key={group.id} open>
                      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>GROUP: {group.name} - Sous-total: {money(groupTotal)} HT</summary>
                      <div className="grid" style={{ gap: 8, marginTop: 8 }}>
                        {group.products.map((product) => (
                          <label key={product.product_id} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 180px', gap: 10, alignItems: 'center' }}>
                            <span>{product.designation}</span>
                            <Input type="number" min={0} step="1" value={quantities[product.product_id] ?? 0} onChange={(event) => setQty(product.product_id, event.target.value)} />
                            <span style={{ textAlign: 'right' }}>{money((quantities[product.product_id] ?? 0) * product.unit_price_ht)} HT</span>
                          </label>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </Card>
          ))}

          <Card>
            <div className="toolbar">
              <Button variant="secondary" onClick={() => void save(false)} disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer brouillon'}</Button>
              <Button onClick={() => void save(true)} disabled={isSaving || blockingRules.length > 0}>{isSaving ? 'Soumission...' : 'Valider et soumettre'}</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
