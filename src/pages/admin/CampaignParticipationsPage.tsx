import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select as NativeSelect } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CampaignPhaseKey, getCampaignById, listCampaignBusinessUnits, listCampaignGroupBrands } from '@/services/campaigns';
import { CampaignCorrectionItem, getCampaignPhaseSubmissionDetail, listCampaignPhaseSubmissionSummaries, listCampaignSubmissionStatusesByPharmacy, reviewCampaignPhaseSubmission, saveCampaignPhaseCorrectionTracking } from '@/services/campaignParticipationForms';

const PHASE_OPTIONS: Array<{ key: CampaignPhaseKey; label: string }> = [
  { key: 'purchase_intentions', label: 'Intentions d\'achat' },
  { key: 'purchase_orders', label: 'Bons de commande' },
  { key: 'delivery_notes', label: 'Bons de livraison' },
];

const money = (value: number) => value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const formatDateTime = (value: string | null) => {
  if (!value) return 'Non soumise';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('fr-FR');
};
const statusLabel = (
  status: 'draft' | 'submitted' | 'needs_correction' | 'accepted',
  opts?: { allCorrectionsAccepted?: boolean },
) => {
  if (status === 'draft') return 'Brouillon';
  if (status === 'submitted') return 'Soumise';
  if (status === 'needs_correction' && opts?.allCorrectionsAccepted) return 'Rectification acceptee';
  if (status === 'needs_correction') return 'Rectification demandee';
  return 'Acceptee';
};
const statusToneClass = (
  status: 'draft' | 'submitted' | 'needs_correction' | 'accepted',
  opts?: { allCorrectionsAccepted?: boolean },
) => {
  if (status === 'accepted') return 'ok';
  if (status === 'needs_correction' && opts?.allCorrectionsAccepted) return 'ok';
  if (status === 'needs_correction') return 'warn';
  return '';
};
const statusLabelShort = (status: 'draft' | 'submitted' | 'needs_correction' | 'accepted' | undefined) => {
  if (status === 'accepted') return 'Acceptee';
  if (status === 'submitted') return 'Soumise';
  if (status === 'needs_correction') return 'Rectification';
  if (status === 'draft') return 'Brouillon';
  return 'Non soumise';
};

export const CampaignParticipationsPage = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const phase = (searchParams.get('phase') as CampaignPhaseKey | null) ?? 'purchase_intentions';

  const [rows, setRows] = useState<Awaited<ReturnType<typeof listCampaignPhaseSubmissionSummaries>>>([]);
  const [phaseStatusesByPharmacy, setPhaseStatusesByPharmacy] = useState<Record<string, Partial<Record<CampaignPhaseKey, 'draft' | 'submitted' | 'needs_correction' | 'accepted'>>>>({});
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getCampaignPhaseSubmissionDetail>> | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewNote, setReviewNote] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [buNames, setBuNames] = useState<Map<string, string>>(new Map());
  const [groupNames, setGroupNames] = useState<Map<string, string>>(new Map());
  const [correctionItems, setCorrectionItems] = useState<CampaignCorrectionItem[]>([]);
  const [correctionScope, setCorrectionScope] = useState<'campaign' | 'business_unit' | 'group_brand' | 'product'>('campaign');
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<string>('');
  const [selectedGroupBrand, setSelectedGroupBrand] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [correctionMessage, setCorrectionMessage] = useState('');
  const [isAddCorrectionModalOpen, setIsAddCorrectionModalOpen] = useState(false);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [isSavingTracking, setIsSavingTracking] = useState(false);

  const load = async () => {
    if (!campaignId) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const [data, statuses] = await Promise.all([
        listCampaignPhaseSubmissionSummaries(campaignId, phase),
        listCampaignSubmissionStatusesByPharmacy(campaignId),
      ]);
      setRows(data);
      setPhaseStatusesByPharmacy(statuses);
      const firstId = data[0]?.submission_id ?? null;
      setSelectedSubmissionId(firstId);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Chargement impossible.');
      setRows([]);
      setPhaseStatusesByPharmacy({});
      setSelectedSubmissionId(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [campaignId, phase]);

  useEffect(() => {
    const loadCampaign = async () => {
      if (!campaignId) return;
      try {
        const [campaign, bus, groups] = await Promise.all([
          getCampaignById(campaignId),
          listCampaignBusinessUnits(campaignId),
          listCampaignGroupBrands(campaignId),
        ]);
        setCampaignName(campaign.name);
        setBuNames(new Map(bus.map((bu) => [bu.id, bu.name])));
        setGroupNames(new Map(groups.map((group) => [group.id, group.name])));
      } catch {
        setCampaignName(null);
        setBuNames(new Map());
        setGroupNames(new Map());
      }
    };
    void loadCampaign();
  }, [campaignId]);

  useEffect(() => {
    const loadDetail = async () => {
      if (!selectedSubmissionId) {
        setDetail(null);
        return;
      }
      try {
        const payload = await getCampaignPhaseSubmissionDetail(selectedSubmissionId);
        setDetail(payload);
        setCorrectionItems(payload.admin_correction_items ?? []);
        setIsAddCorrectionModalOpen(false);
        setIsTrackingModalOpen(false);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Detail indisponible.');
        setDetail(null);
        setCorrectionItems([]);
      }
    };

    void loadDetail();
  }, [selectedSubmissionId]);

  useEffect(() => {
    if (!detail) return;
    const firstSection = detail.lines.find((line) => !!line.campaign_business_unit_id || !!line.campaign_group_brand_id);
    setSelectedBusinessUnit(firstSection?.campaign_business_unit_id ?? '');
    setSelectedGroupBrand(firstSection?.campaign_group_brand_id ?? '');
    setSelectedProduct(detail.lines[0]?.product_id ?? '');
  }, [detail]);

  const canReview = phase === 'purchase_intentions' || phase === 'purchase_orders';
  const canReviewCurrentSubmission = detail?.status === 'submitted' || detail?.status === 'needs_correction';

  const review = async (action: 'accept' | 'request_correction') => {
    if (!selectedSubmissionId) return;
    const unresolvedCount = correctionItems.filter((item) => !item.resolved).length;
    if (action === 'accept' && unresolvedCount > 0) {
      setFeedback(`Acceptation impossible: ${unresolvedCount} rectification(s) reste(nt) a verifier.`);
      return;
    }
    setIsReviewing(true);
    setFeedback(null);
    try {
      await reviewCampaignPhaseSubmission({
        submissionId: selectedSubmissionId,
        action,
        note: reviewNote,
        correctionItems: action === 'request_correction' ? correctionItems : [],
      });
      await load();
      setFeedback(action === 'accept' ? 'Soumission acceptee.' : 'Rectification demandee.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Action impossible.');
    } finally {
      setIsReviewing(false);
    }
  };

  const globalTotals = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc.qty += row.total_quantity;
      acc.amount += row.total_amount_ht;
      return acc;
    }, { qty: 0, amount: 0 });
  }, [rows]);
  const statusBreakdown = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc[row.status] += 1;
      return acc;
    }, {
      draft: 0,
      submitted: 0,
      needs_correction: 0,
      accepted: 0,
    } as Record<'draft' | 'submitted' | 'needs_correction' | 'accepted', number>);
  }, [rows]);
  const arrangedLines = useMemo(() => {
    if (!detail) return [] as Array<{ section: string; row: { product_id: string; product_name: string; campaign_business_unit_id: string | null; campaign_group_brand_id: string | null; quantity: number; unit_price_ht: number; line_total_ht: number } }>;
    return detail.lines
      .map((row) => {
        const bu = row.campaign_business_unit_id ? (buNames.get(row.campaign_business_unit_id) ?? `BU ${row.campaign_business_unit_id.slice(0, 6)}`) : 'Hors BU';
        const group = row.campaign_group_brand_id ? (groupNames.get(row.campaign_group_brand_id) ?? `GROUP ${row.campaign_group_brand_id.slice(0, 6)}`) : 'Sans GROUP';
        return { section: `${bu} / ${group}`, row };
      })
      .sort((a, b) => a.section.localeCompare(b.section) || a.row.product_name.localeCompare(b.row.product_name));
  }, [detail, buNames, groupNames]);
  const allCorrectionsAcceptedForDetail = useMemo(() => {
    if (!detail) return false;
    if (detail.status !== 'needs_correction') return false;
    if (!detail.admin_correction_items.length) return false;
    return detail.admin_correction_items.every((item) => item.resolved);
  }, [detail]);
  const sectionOptions = useMemo(() => {
    if (!detail) return [] as Array<{ key: string; label: string; buId: string | null; groupId: string | null }>;
    const unique = new Map<string, { key: string; label: string; buId: string | null; groupId: string | null }>();
    for (const line of detail.lines) {
      const buId = line.campaign_business_unit_id ?? null;
      const groupId = line.campaign_group_brand_id ?? null;
      const key = `${buId ?? ''}::${groupId ?? ''}`;
      if (unique.has(key)) continue;
      const buName = buId ? (buNames.get(buId) ?? 'BU') : 'Hors BU';
      const groupName = groupId ? (groupNames.get(groupId) ?? 'GROUP') : 'Sans GROUP';
      unique.set(key, { key, label: `${buName} / ${groupName}`, buId, groupId });
    }
    return Array.from(unique.values());
  }, [detail, buNames, groupNames]);
  const businessUnitOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const section of sectionOptions) {
      if (!section.buId) continue;
      unique.set(section.buId, buNames.get(section.buId) ?? 'BU');
    }
    return Array.from(unique.entries()).map(([id, label]) => ({ id, label }));
  }, [sectionOptions, buNames]);
  const groupOptions = useMemo(() => {
    const unique = new Map<string, { id: string; label: string; buId: string | null }>();
    for (const section of sectionOptions) {
      if (!section.groupId) continue;
      unique.set(section.groupId, { id: section.groupId, label: section.label, buId: section.buId });
    }
    return Array.from(unique.values());
  }, [sectionOptions]);

  const addCorrectionItem = async () => {
    const message = correctionMessage.trim();
    if (!message) return;
    if (!detail) return;

    let nextItems: CampaignCorrectionItem[] = correctionItems;
    if (correctionScope === 'campaign') {
      nextItems = [...correctionItems, {
        id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        scope_type: 'campaign',
        campaign_business_unit_id: null,
        campaign_group_brand_id: null,
        product_id: null,
        message,
        resolved: false,
        resolved_at: null,
      }];
    } else if (correctionScope === 'business_unit') {
      const buId = selectedBusinessUnit || businessUnitOptions[0]?.id || null;
      if (!buId) return;
      nextItems = [...correctionItems, {
        id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        scope_type: 'business_unit',
        campaign_business_unit_id: buId,
        campaign_group_brand_id: null,
        product_id: null,
        message,
        resolved: false,
        resolved_at: null,
      }];
    } else if (correctionScope === 'group_brand') {
      const group = groupOptions.find((item) => item.id === selectedGroupBrand) ?? groupOptions[0];
      if (!group) return;
      nextItems = [...correctionItems, {
        id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        scope_type: 'group_brand',
        campaign_business_unit_id: group.buId,
        campaign_group_brand_id: group.id,
        product_id: null,
        message,
        resolved: false,
        resolved_at: null,
      }];
    } else {
      const product = detail.lines.find((line) => line.product_id === selectedProduct) ?? detail.lines[0];
      if (!product) return;
      nextItems = [...correctionItems, {
        id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        scope_type: 'product',
        campaign_business_unit_id: product.campaign_business_unit_id ?? null,
        campaign_group_brand_id: product.campaign_group_brand_id ?? null,
        product_id: product.product_id,
        message,
        resolved: false,
        resolved_at: null,
      }];
    }
    setCorrectionMessage('');
    await persistCorrectionTracking(nextItems);
  };
  const openCorrectionModalFor = (scope: 'campaign' | 'business_unit' | 'group_brand' | 'product', payload?: { buId?: string | null; groupId?: string | null; productId?: string | null }) => {
    setCorrectionScope(scope);
    if (scope === 'business_unit' && payload?.buId) setSelectedBusinessUnit(payload.buId);
    if (scope === 'group_brand' && payload?.groupId) setSelectedGroupBrand(payload.groupId);
    if (scope === 'product' && payload?.productId) setSelectedProduct(payload.productId);
    setIsAddCorrectionModalOpen(true);
  };

  const correctionItemLabel = (item: CampaignCorrectionItem) => {
    if (item.scope_type === 'campaign') return 'Campagne';
    if (item.scope_type === 'business_unit') {
      const buName = item.campaign_business_unit_id ? (buNames.get(item.campaign_business_unit_id) ?? 'BU') : 'Hors BU';
      return `Section BU: ${buName}`;
    }
    if (item.scope_type === 'group_brand') {
      const buName = item.campaign_business_unit_id ? (buNames.get(item.campaign_business_unit_id) ?? 'BU') : 'Hors BU';
      const groupName = item.campaign_group_brand_id ? (groupNames.get(item.campaign_group_brand_id) ?? 'GROUP') : 'Sans GROUP';
      return `Section GROUP: ${buName} / ${groupName}`;
    }
    const product = detail?.lines.find((line) => line.product_id === item.product_id);
    return `Produit: ${product?.product_name ?? item.product_id ?? 'N/A'}`;
  };
  const persistCorrectionTracking = async (items: CampaignCorrectionItem[]) => {
    if (!detail) return;
    setIsSavingTracking(true);
    setFeedback(null);
    try {
      await saveCampaignPhaseCorrectionTracking({
        submissionId: detail.submission_id,
        note: reviewNote,
        correctionItems: items,
      });
      setCorrectionItems(items);
      const payload = await getCampaignPhaseSubmissionDetail(detail.submission_id);
      setDetail(payload);
      setFeedback('Suivi des rectifications mis a jour.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Sauvegarde du suivi impossible.');
    } finally {
      setIsSavingTracking(false);
    }
  };

  return (
    <div className="grid">
      <Card className="phase-hero">
        <div className="toolbar">
          <div>
            <h1>Pilotage des participations</h1>
            <p>Suivi des formulaires participants et totaux consolides.</p>
            {campaignName && (
              <p style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{campaignName}</p>
            )}
          </div>
          <Button variant="secondary" onClick={() => navigate('/admin/campaigns')}>Retour campagnes</Button>
        </div>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <NativeSelect value={phase} onChange={(event) => setSearchParams({ phase: event.target.value })}>
            {PHASE_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </NativeSelect>
          <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>Total campagne phase: {globalTotals.qty} U - {money(globalTotals.amount)} HT</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="status-pill">{statusBreakdown.submitted} soumise(s)</span>
          <span className="status-pill warn">{statusBreakdown.needs_correction} rectification(s)</span>
          <span className="status-pill ok">{statusBreakdown.accepted} acceptee(s)</span>
          <span className="status-pill">{statusBreakdown.draft} brouillon(s)</span>
        </div>
      </Card>

      {feedback && <section className="alert">{feedback}</section>}
      {isLoading && <Card><p style={{ margin: 0 }}>Chargement...</p></Card>}

      {!isLoading && (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <Card>
            <h2>Participants</h2>
            <div className="grid" style={{ gap: 8 }}>
              {rows.length === 0 && <p style={{ margin: 0 }}>Aucune soumission pour cette phase.</p>}
              {rows.map((row) => (
                <button
                  key={row.submission_id}
                  type="button"
                  onClick={() => setSelectedSubmissionId(row.submission_id)}
                  style={{
                    textAlign: 'left',
                    border: selectedSubmissionId === row.submission_id ? '1px solid #18181b' : '1px solid #e4e4e7',
                    background: '#fff',
                    borderRadius: 10,
                    padding: 10,
                    cursor: 'pointer',
                  }}
                >
                  <div className="toolbar" style={{ alignItems: 'flex-start' }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{row.pharmacy_name}</p>
                    <span className={`status-pill ${statusToneClass(row.status)}`}>{statusLabel(row.status)}</span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', color: '#475467', fontSize: 13 }}>{row.total_quantity} U - {money(row.total_amount_ht)} HT</p>
                  <p style={{ margin: '4px 0 0 0', color: '#667085', fontSize: 12, display: 'inline-flex', flexWrap: 'wrap', gap: 10 }}>
                    <span>Intentions: {statusLabelShort(phaseStatusesByPharmacy[row.pharmacy_id]?.purchase_intentions)}</span>
                    <span>BC: {statusLabelShort(phaseStatusesByPharmacy[row.pharmacy_id]?.purchase_orders)}</span>
                    <span>BL: {statusLabelShort(phaseStatusesByPharmacy[row.pharmacy_id]?.delivery_notes)}</span>
                  </p>
                  <p style={{ margin: '4px 0 0 0', color: '#667085', fontSize: 12 }}>Derniere soumission: {formatDateTime(row.submitted_at)}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h2>Detail formulaire</h2>
            {!detail && <p style={{ margin: 0 }}>Selectionnez une soumission.</p>}
            {detail && (
              <div className="grid" style={{ gap: 8 }}>
                <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{detail.pharmacy_name}</strong>
                  <span className={`status-pill ${statusToneClass(detail.status, { allCorrectionsAccepted: allCorrectionsAcceptedForDetail })}`}>
                    {statusLabel(detail.status, { allCorrectionsAccepted: allCorrectionsAcceptedForDetail })}
                  </span>
                </p>
                <p style={{ margin: 0 }}>Total: {detail.total_quantity} U - {money(detail.total_amount_ht)} HT</p>
                <p style={{ margin: 0, color: '#667085', fontSize: 12 }}>
                  Soumise le: {formatDateTime(detail.submitted_at)} · Revue le: {formatDateTime(detail.reviewed_at)}
                </p>
                {detail.admin_correction_note && <p style={{ margin: 0, color: '#475467' }}>Note admin: {detail.admin_correction_note}</p>}
                {canReview && (
                  <div className="grid" style={{ gap: 8 }}>
                    <Input placeholder="Note admin (optionnelle)" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
                    <div className="toolbar" style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 10px', background: '#f8fafc' }}>
                      <p style={{ margin: 0, fontSize: 13, color: '#475467' }}>
                        Rectifications: <strong>{correctionItems.length}</strong> ·
                        <strong style={{ color: '#b45309' }}> {correctionItems.filter((item) => !item.resolved).length}</strong> a verifier
                      </p>
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <Button type="button" className="rectif-cta-btn rectif-cta-primary" onClick={() => setIsAddCorrectionModalOpen(true)}>
                          Ajouter demande de rectification
                        </Button>
                        <Button
                          type="button"
                          className="rectif-cta-btn rectif-cta-secondary"
                          disabled={correctionItems.length === 0}
                          onClick={() => setIsTrackingModalOpen(true)}
                        >
                          Monitorer les rectifications
                        </Button>
                      </div>
                    </div>
                    <div className="toolbar">
                      <Button
                        variant="secondary"
                        disabled={isReviewing || !canReviewCurrentSubmission}
                        onClick={() => void review('request_correction')}
                      >
                        Demander rectification
                      </Button>
                      <Button
                        disabled={isReviewing || !canReviewCurrentSubmission || correctionItems.filter((item) => !item.resolved).length > 0}
                        onClick={() => void review('accept')}
                      >
                        Accepter
                      </Button>
                    </div>
                  </div>
                )}
                {isAddCorrectionModalOpen && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    className="pg-modal-overlay"
                    onClick={() => setIsAddCorrectionModalOpen(false)}
                  >
                    <div
                      className="pg-modal-card"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="toolbar pg-modal-header">
                        <h3 style={{ margin: 0 }}>Ajouter une demande de rectification</h3>
                        <Button type="button" variant="secondary" onClick={() => setIsAddCorrectionModalOpen(false)}>Fermer</Button>
                      </div>
                      <Select value={correctionScope} onValueChange={(value) => setCorrectionScope(value as 'campaign' | 'business_unit' | 'group_brand' | 'product')}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir une portee" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="campaign">Portee campagne</SelectItem>
                          <SelectItem value="business_unit">Portee BU</SelectItem>
                          <SelectItem value="group_brand">Portee GROUP</SelectItem>
                          <SelectItem value="product">Portee produit</SelectItem>
                        </SelectContent>
                      </Select>
                      {correctionScope === 'business_unit' && (
                        <Select value={selectedBusinessUnit} onValueChange={setSelectedBusinessUnit}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir une BU" />
                          </SelectTrigger>
                          <SelectContent>
                            {businessUnitOptions.map((option) => (
                              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {correctionScope === 'group_brand' && (
                        <Select value={selectedGroupBrand} onValueChange={setSelectedGroupBrand}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir un GROUP" />
                          </SelectTrigger>
                          <SelectContent>
                            {groupOptions.map((option) => (
                              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {correctionScope === 'product' && (
                        <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir un produit" />
                          </SelectTrigger>
                          <SelectContent>
                            {(detail?.lines ?? []).map((line) => (
                              <SelectItem key={line.product_id} value={line.product_id}>{line.product_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <div className="toolbar pg-modal-row">
                        <Input placeholder="Ex: Corriger la quantite minimale de ce produit" value={correctionMessage} onChange={(event) => setCorrectionMessage(event.target.value)} />
                        <Button type="button" variant="secondary" onClick={addCorrectionItem}>Ajouter</Button>
                      </div>
                      <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>
                        Les demandes ajoutees apparaissent dans le modal de suivi.
                      </p>
                    </div>
                  </div>
                )}
                {isTrackingModalOpen && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    className="pg-modal-overlay"
                    onClick={() => setIsTrackingModalOpen(false)}
                  >
                    <div
                      className="pg-modal-card"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="toolbar pg-modal-header">
                        <h3 style={{ margin: 0 }}>Suivi des rectifications</h3>
                        <Button type="button" variant="secondary" onClick={() => setIsTrackingModalOpen(false)}>Fermer</Button>
                      </div>
                      <div className="grid" style={{ gap: 6 }}>
                        {correctionItems.length === 0 && <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>Aucune rectification structuree.</p>}
                        {correctionItems.map((item, index) => (
                          <div key={`${item.scope_type}-${item.product_id ?? index}-${index}`} className="toolbar" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px', background: '#fff' }}>
                            <p style={{ margin: 0, fontSize: 12, flex: 1 }}>
                              <strong>{correctionItemLabel(item)}</strong> - {item.message}
                              <span style={{ marginLeft: 8, color: item.resolved ? '#166534' : '#9a3412', fontWeight: 700 }}>
                                {item.resolved ? 'Acceptee' : 'A rectifier'}
                              </span>
                            </p>
                            <Button
                              type="button"
                              className="rectif-action-btn rectif-action-accept"
                              disabled={isSavingTracking}
                              onClick={() => void persistCorrectionTracking(correctionItems.map((entry, entryIndex) => (
                                entryIndex === index
                                  ? { ...entry, resolved: !entry.resolved, resolved_at: !entry.resolved ? new Date().toISOString() : null }
                                  : entry
                              )))}
                            >
                              {item.resolved ? 'Rectifier' : 'Accepter'}
                            </Button>
                            <Button
                              type="button"
                              className="rectif-action-btn rectif-action-remove"
                              disabled={isSavingTracking}
                              onClick={() => void persistCorrectionTracking(correctionItems.filter((_, itemIndex) => itemIndex !== index))}
                            >
                              Retirer
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div style={{ borderTop: '1px solid #e4e4e7', paddingTop: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 160px', gap: 10, padding: '6px 0', color: '#64748b', fontSize: 12, fontWeight: 700 }}>
                    <span>Designation</span>
                    <span style={{ textAlign: 'right' }}>Quantite</span>
                    <span style={{ textAlign: 'right' }}>Sous-total HT</span>
                  </div>
                  {arrangedLines.map((item, index) => {
                    const previousSection = index > 0 ? arrangedLines[index - 1].section : null;
                    const showSection = item.section !== previousSection;
                    return (
                      <div key={`${item.row.product_id}-${index}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {showSection && (
                          <p style={{ margin: '8px 0 4px 0', fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
                            {item.section}
                          </p>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 160px', gap: 10, padding: '6px 0' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {item.row.product_name}
                            <button
                              type="button"
                              className="rectif-icon-btn"
                              title="Demander une rectification (produit)"
                              onClick={() => openCorrectionModalFor('product', { productId: item.row.product_id })}
                            >
                              <AlertTriangle size={14} />
                            </button>
                          </span>
                          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.row.quantity} U</span>
                          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(item.row.line_total_ht)} HT</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
