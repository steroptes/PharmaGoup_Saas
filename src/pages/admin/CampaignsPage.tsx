import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';

type CampaignPhaseKey = 'intentions' | 'orders' | 'deliveries' | 'bonifications';

type CampaignPhase = {
  key: CampaignPhaseKey;
  label: string;
  required: boolean;
  enabled: boolean;
  startDate: string;
  endDate: string;
};

const DEFAULT_PHASES: CampaignPhase[] = [
  { key: 'intentions', label: "Recueil des intentions d'achat", required: false, enabled: false, startDate: '', endDate: '' },
  { key: 'orders', label: 'Recueil des bons de commande', required: false, enabled: false, startDate: '', endDate: '' },
  { key: 'deliveries', label: 'Recueil des bons de livraison', required: true, enabled: true, startDate: '', endDate: '' },
  { key: 'bonifications', label: 'Régularisation des bonifications', required: false, enabled: true, startDate: '', endDate: '' },
];

const LABORATORY_OPTIONS = [
  { id: 'lab-1', name: 'Laboratoire Alpha' },
  { id: 'lab-2', name: 'Laboratoire Beta' },
  { id: 'lab-3', name: 'Laboratoire Gamma' },
];

const PHARMACY_OPTIONS = [
  'Pharmacie du Centre',
  'Pharmacie Bellevue',
  'Pharmacie Nouvelle',
  'Pharmacie des Marchés',
  'Pharmacie Santé Plus',
];

const PRODUCT_OPTIONS = [
  'Paracétamol 500mg',
  'Amoxicilline 1g',
  'Vitamine C 1000',
  'Sérum physiologique 500ml',
  'Pansements stériles',
];

export const CampaignsPage = () => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [selectedLaboratory, setSelectedLaboratory] = useState('');
  const [openDate, setOpenDate] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [selectedPharmacies, setSelectedPharmacies] = useState<string[]>([]);
  const [catalogMode, setCatalogMode] = useState<'reuse' | 'new'>('reuse');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [phases, setPhases] = useState<CampaignPhase[]>(DEFAULT_PHASES);
  const [launchedCampaigns, setLaunchedCampaigns] = useState<Array<{ name: string; laboratory: string; openDate: string; closeDate: string; phases: string[] }>>([]);

  const selectedLaboratoryLabel = useMemo(() => LABORATORY_OPTIONS.find((option) => option.id === selectedLaboratory)?.name ?? 'Laboratoire non défini', [selectedLaboratory]);

  const toggleSelection = (value: string, selectedList: string[], setter: (values: string[]) => void) => {
    setter(selectedList.includes(value) ? selectedList.filter((item) => item !== value) : [...selectedList, value]);
  };

  const updatePhase = (phaseKey: CampaignPhaseKey, patch: Partial<CampaignPhase>) => {
    setPhases((current) => current.map((phase) => (phase.key === phaseKey ? { ...phase, ...patch } : phase)));
  };

  const validateStep = () => {
    if (currentStep === 1) {
      if (!campaignName.trim() || !selectedLaboratory || !openDate || !closeDate || selectedPharmacies.length === 0) {
        setFeedback('Complétez la dénomination, le laboratoire, les dates et au moins une pharmacie.');
        return false;
      }
      if (closeDate < openDate) {
        setFeedback('La date de clôture doit être postérieure ou égale à la date d’ouverture.');
        return false;
      }
    }

    if (currentStep === 2 && selectedProducts.length === 0) {
      setFeedback('Sélectionnez au moins un produit pour définir le contenu de campagne.');
      return false;
    }

    if (currentStep === 3) {
      const enabledPhases = phases.filter((phase) => phase.enabled);
      const hasInvalidWindow = enabledPhases.some((phase) => !phase.startDate || !phase.endDate || phase.endDate < phase.startDate);
      const outOfCampaignRange = enabledPhases.some((phase) => phase.startDate < openDate || phase.endDate > closeDate);

      if (hasInvalidWindow) {
        setFeedback('Chaque phase active doit avoir une période valide (début et fin).');
        return false;
      }

      if (outOfCampaignRange) {
        setFeedback('Les périodes de phase doivent rester dans la fenêtre de la campagne.');
        return false;
      }
    }

    setFeedback(null);
    return true;
  };

  const nextStep = () => {
    if (!validateStep()) return;
    setCurrentStep((step) => (step < 3 ? ((step + 1) as 1 | 2 | 3) : step));
  };

  const previousStep = () => {
    setFeedback(null);
    setCurrentStep((step) => (step > 1 ? ((step - 1) as 1 | 2 | 3) : step));
  };

  const launchCampaign = () => {
    if (!validateStep()) return;

    const phaseLabels = phases.filter((phase) => phase.enabled).map((phase) => `${phase.label} (${phase.startDate} → ${phase.endDate})`);

    setLaunchedCampaigns((current) => [
      { name: campaignName, laboratory: selectedLaboratoryLabel, openDate, closeDate, phases: phaseLabels },
      ...current,
    ]);

    setFeedback('Campagne lancée. Les utilisateurs concernés la verront depuis leur session.');
    setCurrentStep(1);
    setCampaignName('');
    setSelectedLaboratory('');
    setOpenDate('');
    setCloseDate('');
    setSelectedPharmacies([]);
    setCatalogMode('reuse');
    setSelectedProducts([]);
    setPhases(DEFAULT_PHASES);
  };

  return (
    <div className="grid">
      <Card>
        <h1>Campagnes d&apos;achat</h1>
        <p>Configuration guidée en 3 étapes: création, contenu catalogue, phases et lancement.</p>
      </Card>

      <Card>
        <h2>Mise en place de campagne — Étape {currentStep}/3</h2>

        {currentStep === 1 && (
          <div className="grid" style={{ gap: 12 }}>
            <Input placeholder="Dénomination campagne" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} />
            <Select value={selectedLaboratory} onChange={(event) => setSelectedLaboratory(event.target.value)}>
              <option value="">Choisir le laboratoire concerné</option>
              {LABORATORY_OPTIONS.map((lab) => (
                <option key={lab.id} value={lab.id}>{lab.name}</option>
              ))}
            </Select>
            <div className="grid grid-2">
              <Input type="date" value={openDate} onChange={(event) => setOpenDate(event.target.value)} />
              <Input type="date" value={closeDate} onChange={(event) => setCloseDate(event.target.value)} />
            </div>
            <div>
              <p>Pharmacies concernées</p>
              <div className="grid grid-2" style={{ marginTop: 8, gap: 8 }}>
                {PHARMACY_OPTIONS.map((pharmacy) => (
                  <label key={pharmacy} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedPharmacies.includes(pharmacy)}
                      onChange={() => toggleSelection(pharmacy, selectedPharmacies, setSelectedPharmacies)}
                    />
                    {pharmacy}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="grid" style={{ gap: 12 }}>
            <div>
              <p>Contenu de campagne</p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <input type="radio" checked={catalogMode === 'reuse'} onChange={() => setCatalogMode('reuse')} />
                Reprendre le catalogue du laboratoire (BU/Brand/Produits)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <input type="radio" checked={catalogMode === 'new'} onChange={() => setCatalogMode('new')} />
                Construire un catalogue spécifique pour la campagne
              </label>
            </div>

            <div>
              <p>Produits concernés</p>
              <div className="grid grid-2" style={{ marginTop: 8, gap: 8 }}>
                {PRODUCT_OPTIONS.map((product) => (
                  <label key={product} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(product)}
                      onChange={() => toggleSelection(product, selectedProducts, setSelectedProducts)}
                    />
                    {product}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="grid" style={{ gap: 12 }}>
            {phases.map((phase) => (
              <div key={phase.key} className="card" style={{ padding: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={phase.enabled}
                    disabled={phase.required}
                    onChange={(event) => updatePhase(phase.key, { enabled: event.target.checked })}
                  />
                  {phase.label} {phase.required ? '(obligatoire)' : '(optionnelle)'}
                </label>
                {phase.enabled && (
                  <div className="grid grid-2" style={{ marginTop: 8 }}>
                    <Input type="date" value={phase.startDate} onChange={(event) => updatePhase(phase.key, { startDate: event.target.value })} />
                    <Input type="date" value={phase.endDate} onChange={(event) => updatePhase(phase.key, { endDate: event.target.value })} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {feedback && <p style={{ marginTop: 12 }}>{feedback}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button onClick={previousStep} disabled={currentStep === 1}>Précédent</Button>
          {currentStep < 3 ? <Button onClick={nextStep}>Continuer</Button> : <Button onClick={launchCampaign}>Lancer la campagne</Button>}
        </div>
      </Card>

      <Card>
        <h2>Campagnes lancées (aperçu session utilisateurs)</h2>
        {!launchedCampaigns.length && <p>Aucune campagne lancée pour le moment.</p>}
        {!!launchedCampaigns.length && (
          <div className="grid" style={{ gap: 8 }}>
            {launchedCampaigns.map((campaign) => (
              <div key={`${campaign.name}-${campaign.openDate}`} className="card" style={{ padding: 12 }}>
                <strong>{campaign.name}</strong>
                <p>{campaign.laboratory} — {campaign.openDate} au {campaign.closeDate}</p>
                <ul>
                  {campaign.phases.map((phase) => <li key={phase}>{phase}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
