import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, CircleX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import {
  decideCampaignParticipation,
  listCampaignsForPharmacyPortal,
  PharmacyCampaignSummary,
} from '@/services/pharmacyCampaigns';

const toFrenchDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('fr-FR');
};

const participationLabel = (value: PharmacyCampaignSummary['participation_status']) => {
  if (value === 'accepted') return 'Participation confirmee';
  if (value === 'declined') return 'Participation refusee';
  return 'Decision en attente';
};

type FlowStep = {
  key: 'purchase_intentions' | 'purchase_orders' | 'delivery_notes';
  label: string;
  actionLabel: string;
};

const FLOW_ORDER: FlowStep[] = [
  { key: 'purchase_intentions', label: "Annoncer les intentions d'achat", actionLabel: 'Annoncer' },
  { key: 'purchase_orders', label: 'Creer un bon de commande', actionLabel: 'Creer' },
  { key: 'delivery_notes', label: 'Televerser un BL', actionLabel: 'Televerser' },
];

export const CampaignsPortalPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [rows, setRows] = useState<PharmacyCampaignSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingDecisionCampaignId, setPendingDecisionCampaignId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [participationFilter, setParticipationFilter] = useState<'all' | 'pending' | 'accepted' | 'declined'>('all');
  const [supplierFilter, setSupplierFilter] = useState<'all' | string>('all');

  const loadRows = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const data = await listCampaignsForPharmacyPortal(profile?.pharmacy_id);
      setRows(data);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Impossible de charger vos campagnes.');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, [profile?.pharmacy_id]);

  const acceptedCount = useMemo(() => rows.filter((item) => item.participation_status === 'accepted').length, [rows]);
  const supplierOptions = useMemo(() => {
    const unique = Array.from(new Set(rows.map((row) => row.supplier_name).filter(Boolean))) as string[];
    return unique.sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (participationFilter !== 'all' && row.participation_status !== participationFilter) return false;
      if (supplierFilter !== 'all' && (row.supplier_name ?? '') !== supplierFilter) return false;
      if (!query) return true;
      return [row.campaign_name, row.supplier_name ?? '', row.participation_status].some((value) =>
        value.toLowerCase().includes(query),
      );
    });

    return [...filtered].sort((a, b) => {
      const aTime = new Date(a.start_date).getTime();
      const bTime = new Date(b.start_date).getTime();
      return bTime - aTime;
    });
  }, [rows, searchQuery, participationFilter, supplierFilter]);

  const applyDecision = async (campaignId: string, decision: 'accepted' | 'declined') => {
    setPendingDecisionCampaignId(campaignId);
    setFeedback(null);
    try {
      await decideCampaignParticipation(campaignId, profile?.pharmacy_id, decision);
      await loadRows();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Impossible de mettre a jour votre decision.');
    } finally {
      setPendingDecisionCampaignId(null);
    }
  };

  return (
    <div className="grid">
      <Card>
        <h1>Mes campagnes</h1>
        <p>Campagnes ouvertes qui vous concernent, avec confirmation de participation et acces aux etapes activees.</p>
        <p style={{ marginTop: 8, color: '#667085', fontSize: 13 }}>
          {acceptedCount} campagne(s) acceptee(s) / {rows.length} ouverte(s).
        </p>
        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <input
            className="ui-input"
            placeholder="Rechercher une campagne, un laboratoire, un statut"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="select" value={participationFilter} onChange={(event) => setParticipationFilter(event.target.value as 'all' | 'pending' | 'accepted' | 'declined')}>
              <option value="all">Tous les statuts</option>
              <option value="pending">Decision en attente</option>
              <option value="accepted">Participation confirmee</option>
              <option value="declined">Participation refusee</option>
            </select>
            <select className="select" value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
              <option value="all">Tous les laboratoires</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier} value={supplier}>{supplier}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {feedback && <section className="alert">{feedback}</section>}

      {!isLoading && visibleRows.length === 0 && (
        <Card>
          <p style={{ margin: 0 }}>Aucune campagne ne correspond a votre recherche/filtres.</p>
        </Card>
      )}

      {visibleRows.map((campaign) => {
        const canProceed = campaign.participation_status === 'accepted';
        const isDeciding = pendingDecisionCampaignId === campaign.campaign_id;
        const enabledSteps = FLOW_ORDER.filter((step) => campaign.enabled_phases.includes(step.key));
        const activeStepKey = canProceed && enabledSteps.length ? enabledSteps[0].key : null;
        const flowStarted = campaign.participation_status === 'accepted';

        return (
          <Card key={campaign.campaign_id}>
            <div className="toolbar">
              <div>
                <h2 style={{ marginBottom: 6 }}>{campaign.campaign_name}</h2>
                <p style={{ margin: 0 }}>
                  {campaign.supplier_name ?? 'Laboratoire non renseigne'} · du {toFrenchDate(campaign.start_date)} au {toFrenchDate(campaign.end_date)}
                </p>
                <p style={{ marginTop: 6, color: '#667085', fontSize: 13 }}>{participationLabel(campaign.participation_status)}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  style={{ background: '#16a34a', borderColor: '#15803d', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}
                  disabled={isDeciding || campaign.participation_status === 'accepted'}
                  onClick={() => void applyDecision(campaign.campaign_id, 'accepted')}
                >
                  <CheckCircle2 size={17} style={{ marginRight: 6, strokeWidth: 2.5 }} />
                  Participer
                </Button>
                <Button
                  variant="secondary"
                  style={{ color: '#b42318', borderColor: '#fca5a5', background: '#fff1f2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}
                  disabled={isDeciding || campaign.participation_status === 'declined' || flowStarted}
                  onClick={() => void applyDecision(campaign.campaign_id, 'declined')}
                >
                  <CircleX size={17} style={{ marginRight: 6, strokeWidth: 2.5 }} />
                  Decliner
                </Button>
              </div>
            </div>

            {!canProceed ? (
              <div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', background: '#f8fafc' }}>
                <p style={{ margin: 0, color: '#475467', fontSize: 13 }}>
                  Participez pour debloquer progressivement les etapes de la campagne.
                </p>
              </div>
            ) : (
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                {enabledSteps.map((step, index) => {
                  const isActive = step.key === activeStepKey;
                  const isDeliveryStep = step.key === 'delivery_notes';
                  const stepNumber = index + 1;
                  const window = campaign.phase_windows?.[step.key];

                  return (
                    <div
                      key={step.key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10,
                        border: '1px solid #e4e7ec',
                        borderRadius: 10,
                        padding: '10px 12px',
                        background: isActive ? '#ffffff' : '#f8fafc',
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontWeight: 600 }}>Etape {stepNumber} - {step.label}</p>
                        {window?.has_period_limit && window.start_date && window.end_date ? (
                          <p style={{ margin: '4px 0 0 0', color: '#475467', fontSize: 12 }}>
                            Periode: du {toFrenchDate(window.start_date)} au {toFrenchDate(window.end_date)}
                          </p>
                        ) : (
                          <p style={{ margin: '4px 0 0 0', color: '#667085', fontSize: 12 }}>Periode non limitee</p>
                        )}
                        {!isActive && (
                          <p style={{ margin: '4px 0 0 0', color: '#667085', fontSize: 12 }}>
                            Disponible apres finalisation de l'etape precedente.
                          </p>
                        )}
                      </div>

                      {isDeliveryStep ? (
                        <Button
                          variant={isActive ? 'default' : 'secondary'}
                          disabled={!isActive}
                          onClick={() => navigate(`/pharmacy/upload?campaignId=${campaign.campaign_id}`)}
                        >
                          {step.actionLabel}
                        </Button>
                      ) : (
                        <Button
                          variant={isActive ? 'default' : 'secondary'}
                          disabled={!isActive}
                          onClick={() => navigate(`/pharmacy/campaigns/${campaign.campaign_id}/form?phase=${step.key}`)}
                        >
                          {step.actionLabel}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};
