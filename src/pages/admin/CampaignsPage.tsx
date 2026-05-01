import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ActionDropdown, DropdownAction } from '@/components/ui/dropdown-menu';
import { Input, Select } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table';
import { CampaignRow, CampaignStatus, createCampaign, listCampaigns, updateCampaignStatus } from '@/services/campaigns';
import { listLaboratories, Laboratory } from '@/services/laboratories';
import { supabase } from '@/lib/supabase';
import { listPharmacies, Pharmacy } from '@/services/pharmacies';

const EMPTY_FORM = { name: '', laboratoryId: '', startDate: '', endDate: '' };


const CAMPAIGN_MIGRATIONS = [
  'supabase/migrations/20260501153000_add_campaigns_if_missing.sql',
];

const isMissingCampaignSchema = (message: string | null) =>
  !!message && message.toLowerCase().includes('table supabase des campagnes est absente');

const PAGE_SIZE = 10;

export const CampaignsPage = () => {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [selectedPharmacies, setSelectedPharmacies] = useState<string[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const loadData = async () => {
    setIsLoading(true);
    setFeedback(null);

    const [campaignsResult, laboratoriesResult, pharmaciesResult] = await Promise.allSettled([
      listCampaigns(),
      listLaboratories(),
      listPharmacies(),
    ]);

    if (campaignsResult.status === 'fulfilled') {
      setCampaigns(campaignsResult.value);
    } else {
      setCampaigns([]);
      setFeedback(campaignsResult.reason instanceof Error ? campaignsResult.reason.message : 'Impossible de charger les campagnes.');
    }

    if (laboratoriesResult.status === 'fulfilled') {
      setLaboratories(laboratoriesResult.value);
    } else {
      const { data: supplierFallback } = await supabase.from('suppliers').select('id, name').order('name', { ascending: true });
      setLaboratories((supplierFallback ?? []).map((item) => ({ id: item.id, designation: item.name, tax_identifier: null, address: null, mobile_phone: null, landline_phone: null, created_at: '' })));
      setFeedback((current) => current ?? 'Chargement laboratoires principal indisponible: fallback fournisseurs activé.');
    }

    if (pharmaciesResult.status === 'fulfilled') {
      setPharmacies(pharmaciesResult.value.filter((item) => item.is_active));
    } else {
      setPharmacies([]);
      setFeedback((current) => current ?? (pharmaciesResult.reason instanceof Error ? pharmaciesResult.reason.message : 'Impossible de charger les pharmacies.'));
    }

    setIsLoading(false);
  };

  useEffect(() => { void loadData(); }, []);

  const filteredCampaigns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return campaigns;

    return campaigns.filter((campaign) => {
      const searchable = [campaign.name, campaign.supplier_name ?? '', campaign.status];
      return searchable.some((value) => value.toLowerCase().includes(query));
    });
  }, [campaigns, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / PAGE_SIZE));
  const paginatedCampaigns = useMemo(() => filteredCampaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredCampaigns, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const togglePharmacy = (pharmacyId: string) => {
    setSelectedPharmacies((current) => {
      if (current.includes(pharmacyId)) {
        return current.filter((id) => id !== pharmacyId);
      }
      return [...current, pharmacyId];
    });
  };

  const openModal = () => {
    setFeedback(null);
    setForm(EMPTY_FORM);
    setSelectedPharmacies([]);
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.laboratoryId || !form.startDate || !form.endDate) return setFeedback('Tous les champs de campagne sont obligatoires.');
    if (form.endDate < form.startDate) return setFeedback('La date de clôture doit être supérieure ou égale à la date d’ouverture.');
    if (!selectedPharmacies.length) return setFeedback('Sélectionnez au moins une pharmacie participante.');

    setIsSaving(true);
    try {
      await createCampaign({
        name: form.name.trim(),
        supplier_id: form.laboratoryId,
        start_date: form.startDate,
        end_date: form.endDate,
        pharmacy_ids: selectedPharmacies,
      });
      await loadData();
      setIsModalOpen(false);
      setFeedback('Campagne créée en brouillon.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Création impossible.');
    } finally {
      setIsSaving(false);
    }
  };


  const goToSetup = (campaignId: string) => {
    navigate(`/admin/campaigns/${campaignId}/setup`);
  };

  const campaignActions = (campaignId: string): DropdownAction[] => ([
    { label: 'Paramétrer', onClick: () => goToSetup(campaignId) },
    { label: 'Ouvrir', onClick: () => void changeStatus(campaignId, 'open') },
    { label: 'Clôturer', onClick: () => void changeStatus(campaignId, 'closed') },
    { label: 'Archiver', onClick: () => void changeStatus(campaignId, 'archived') },
  ]);

  const changeStatus = async (campaignId: string, status: CampaignStatus) => {
    try {
      await updateCampaignStatus(campaignId, status);
      await loadData();
      setFeedback('Statut de campagne mis à jour.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Mise à jour du statut impossible.');
    }
  };

  return (
    <div className="grid">
      <Card style={{ minHeight: "calc(100vh - 180px)", display: "flex", flexDirection: "column" }}>
        <div className="toolbar">
          <div>
            <h1>Campagnes d&apos;achat</h1>
            <p>Créer et piloter les campagnes via une table et des actions par ligne.</p>
          </div>
          <Button onClick={openModal}>Nouvelle campagne</Button>
        </div>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <Input placeholder="Rechercher une campagne" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setPage(1); }} />
        </div>
        {feedback && <p style={{ marginTop: 10 }}>{feedback}</p>}
        {isMissingCampaignSchema(feedback) && (
          <div style={{ marginTop: 8, padding: 12, border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 10 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Migrations à appliquer</p>
            <ul style={{ marginTop: 8, marginBottom: 8 }}>
              {CAMPAIGN_MIGRATIONS.map((file) => <li key={file}><code>{file}</code></li>)}
            </ul>
            <p style={{ margin: 0 }}><code>supabase db push</code> puis recharger la page.</p>
          </div>
        )}

        {!isLoading && (
          <div style={{ overflow: 'auto', marginTop: 12, flex: 1 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Campagne</TableHeaderCell>
                  <TableHeaderCell>Laboratoire</TableHeaderCell>
                  <TableHeaderCell>Ouverture</TableHeaderCell>
                  <TableHeaderCell>Clôture</TableHeaderCell>
                  <TableHeaderCell>Participants</TableHeaderCell>
                  <TableHeaderCell>Statut</TableHeaderCell>
                  <TableHeaderCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedCampaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>{campaign.name}</TableCell>
                    <TableCell>{campaign.supplier_name ?? '-'}</TableCell>
                    <TableCell>{campaign.start_date}</TableCell>
                    <TableCell>{campaign.end_date}</TableCell>
                    <TableCell>{campaign.participants_count}</TableCell>
                    <TableCell>{campaign.status}</TableCell>
                    <TableCell>
                      <ActionDropdown actions={campaignActions(campaign.id)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <p style={{ margin: 0 }}>Page {page} / {totalPages} — {filteredCampaigns.length} campagne(s)</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>Précédent</Button>
              <Button variant="secondary" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>Suivant</Button>
            </div>
          </div>
        )}
      </Card>

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 40 }}>
          <Card>
            <div className="toolbar">
              <h2>Créer une campagne</h2>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Fermer</Button>
            </div>
            <form className="grid" onSubmit={handleSubmit}>
              <Input placeholder="Dénomination" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              <Select value={form.laboratoryId} onChange={(event) => setForm((current) => ({ ...current, laboratoryId: event.target.value }))} required>
                <option value="">Sélectionner un laboratoire</option>
                {laboratories.map((laboratory) => <option key={laboratory.id} value={laboratory.id}>{laboratory.designation}</option>)}
              </Select>
              <div className="grid grid-2">
                <Input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} required />
                <Input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} required />
              </div>
              <div>
                <p>Pharmacies concernées</p>
                <div className="grid grid-2" style={{ marginTop: 8, gap: 8 }}>
                  {!pharmacies.length && <p style={{ gridColumn: '1 / -1' }}>Aucune pharmacie active disponible.</p>}
                  {pharmacies.map((pharmacy) => (
                    <label key={pharmacy.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={selectedPharmacies.includes(pharmacy.id)} onChange={() => togglePharmacy(pharmacy.id)} />
                      {pharmacy.name}
                    </label>
                  ))}
                </div>
              </div>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Création...' : 'Créer en brouillon'}</Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};
