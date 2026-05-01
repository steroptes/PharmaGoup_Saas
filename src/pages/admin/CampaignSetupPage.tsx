import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { getCampaignById, updateCampaignDetails } from '@/services/campaigns';
import { Laboratory, listLaboratories } from '@/services/laboratories';

type StepKey = 'details' | 'audience' | 'validation';

const STEP_ORDER: StepKey[] = ['details', 'audience', 'validation'];

export const CampaignSetupPage = () => {
  const navigate = useNavigate();
  const { campaignId } = useParams();
  const [step, setStep] = useState<StepKey>('details');
  const [name, setName] = useState('');
  const [laboratoryId, setLaboratoryId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState('offres');
  const [domain, setDomain] = useState('pharmagroup.tn');
  const [trackingClick, setTrackingClick] = useState(true);
  const [trackingOpen, setTrackingOpen] = useState(false);

  const index = STEP_ORDER.indexOf(step);
  const completion = useMemo(() => Math.round(((index + 1) / STEP_ORDER.length) * 100), [index]);

  useEffect(() => {
    const loadSetupDetails = async () => {
      if (!campaignId) {
        setFeedback('Identifiant de campagne introuvable.');
        setIsLoadingDetails(false);
        return;
      }

      setIsLoadingDetails(true);
      setFeedback(null);
      try {
        const [campaign, labs] = await Promise.all([getCampaignById(campaignId), listLaboratories()]);
        setName(campaign.name);
        setLaboratoryId(campaign.supplier_id ?? '');
        setStartDate(campaign.start_date);
        setEndDate(campaign.end_date);
        setLaboratories(labs);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Impossible de charger les détails de la campagne.');
      } finally {
        setIsLoadingDetails(false);
      }
    };

    void loadSetupDetails();
  }, [campaignId]);

  const saveDetails = async () => {
    if (!campaignId) return;
    if (!name.trim() || !laboratoryId || !startDate || !endDate) return setFeedback('Tous les champs de la section Détails sont obligatoires.');
    if (endDate < startDate) return setFeedback('La date de clôture doit être supérieure ou égale à la date d’ouverture.');

    setIsSavingDetails(true);
    setFeedback(null);
    try {
      await updateCampaignDetails(campaignId, { name: name.trim(), supplier_id: laboratoryId, start_date: startDate, end_date: endDate });
      setFeedback('Détails de campagne mis à jour.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Enregistrement des détails impossible.');
    } finally {
      setIsSavingDetails(false);
    }
  };

  return (
    <div className="grid" style={{ gap: 18 }}>
      <Card>
        <div className="toolbar" style={{ alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: '#667085' }}>Campagne #{campaignId ?? 'draft'}</p>
            <h1 style={{ marginBottom: 4 }}>Paramétrage de la campagne</h1>
            <p style={{ margin: 0, color: '#475467' }}>Configurez chaque étape avant validation et ouverture.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/admin/campaigns')}>Retour</Button>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 18 }}>
        <Card>
          <p style={{ fontWeight: 600, marginTop: 0 }}>Étapes</p>
          <div style={{ display: 'grid', gap: 14 }}>
            {STEP_ORDER.map((item, itemIndex) => {
              const active = item === step;
              const done = itemIndex < index;
              const title = item === 'details' ? 'Détails' : item === 'audience' ? 'Audience' : 'Validation';
              const description = item === 'details' ? 'Nom, domaine, tracking' : item === 'audience' ? 'Participants et ciblage' : 'Résumé final';

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStep(item)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    border: active ? '1px solid #111827' : '1px solid #e4e7ec',
                    borderRadius: 12,
                    padding: '10px 12px',
                    background: active ? '#f8fafc' : '#fff',
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 600 }}>{done ? '✓ ' : ''}{title}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#667085' }}>{description}</p>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 12, marginTop: 16, color: '#667085' }}>Progression: {completion}%</p>
        </Card>

        <Card>
          {step === 'details' && (
            <div className="grid" style={{ gap: 16 }}>
              <h2 style={{ margin: 0 }}>Détails de configuration</h2>
              <p style={{ margin: 0, color: '#475467' }}>Inspiré du setup Resend, adapté à votre workflow de campagne.</p>
              <div className="grid grid-2">
                <div>
                  <label>Nom de campagne</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label>Laboratoire</label>
                  <Select value={laboratoryId} onChange={(e) => setLaboratoryId(e.target.value)}>
                    <option value="">Sélectionner un laboratoire</option>
                    {laboratories.map((laboratory) => <option key={laboratory.id} value={laboratory.id}>{laboratory.designation}</option>)}
                  </Select>
                </div>
              </div>
              <div className="grid grid-2">
                <div>
                  <label>Date d&apos;ouverture</label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label>Date de clôture</label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-2">
                <div>
                  <label>Sous-domaine</label>
                  <Input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} />
                </div>
                <div>
                  <label>Domaine</label>
                  <Input value={domain} onChange={(e) => setDomain(e.target.value)} />
                </div>
              </div>
              <div style={{ border: '1px solid #eaecf0', borderRadius: 12, padding: 12 }}>
                <p style={{ marginTop: 0, fontWeight: 600 }}>Options de tracking</p>
                <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={trackingClick} onChange={() => setTrackingClick((v) => !v)} /> Activer le suivi des clics</label>
                <label style={{ display: 'flex', gap: 8, marginTop: 8 }}><input type="checkbox" checked={trackingOpen} onChange={() => setTrackingOpen((v) => !v)} /> Activer le suivi des ouvertures</label>
              </div>
              <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{isLoadingDetails ? 'Chargement des informations initiales...' : 'Modifiez puis enregistrez les informations de création.'}</p>
                <Button variant="secondary" onClick={() => void saveDetails()} disabled={isLoadingDetails || isSavingDetails}>{isSavingDetails ? 'Enregistrement...' : 'Enregistrer les détails'}</Button>
              </div>
              {feedback && <p style={{ margin: 0, fontSize: 13, color: '#344054' }}>{feedback}</p>}
            </div>
          )}

          {step === 'audience' && (
            <div className="grid" style={{ gap: 16 }}>
              <h2 style={{ margin: 0 }}>Audience de la campagne</h2>
              <div className="grid grid-2">
                <div>
                  <label>Type de ciblage</label>
                  <Select defaultValue="all">
                    <option value="all">Toutes les pharmacies actives</option>
                    <option value="segments">Segment manuel</option>
                  </Select>
                </div>
                <div>
                  <label>Limite participants</label>
                  <Input type="number" min={1} defaultValue={250} />
                </div>
              </div>
              <div style={{ border: '1px dashed #d0d5dd', borderRadius: 12, padding: 14 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>Aperçu destinataires</p>
                <p style={{ margin: '6px 0 0', color: '#667085' }}>250 pharmacies actives seront invitées selon les filtres définis.</p>
              </div>
            </div>
          )}

          {step === 'validation' && (
            <div className="grid" style={{ gap: 16 }}>
              <h2 style={{ margin: 0 }}>Validation avant ouverture</h2>
              <p style={{ margin: 0, color: '#475467' }}>Vérifiez les éléments puis ouvrez la campagne.</p>
              <div style={{ border: '1px solid #eaecf0', borderRadius: 12, padding: 14 }}>
                <p style={{ margin: 0 }}><strong>Nom:</strong> {name}</p>
                <p style={{ margin: '6px 0 0' }}><strong>Domaine de tracking:</strong> {subdomain}.{domain}</p>
                <p style={{ margin: '6px 0 0' }}><strong>Tracking:</strong> clic ({trackingClick ? 'oui' : 'non'}) · ouverture ({trackingOpen ? 'oui' : 'non'})</p>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#667085' }}>La campagne restera en brouillon jusqu&apos;à confirmation.</p>
            </div>
          )}

          <div className="toolbar" style={{ marginTop: 20 }}>
            <Button variant="ghost" disabled={index === 0} onClick={() => setStep(STEP_ORDER[index - 1])}>Précédent</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              {index < STEP_ORDER.length - 1 ? (
                <Button onClick={() => setStep(STEP_ORDER[index + 1])}>Étape suivante</Button>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => navigate('/admin/campaigns')}>Enregistrer en brouillon</Button>
                  <Button>Valider et ouvrir</Button>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
