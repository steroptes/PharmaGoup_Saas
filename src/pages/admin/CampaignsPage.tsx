import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ActionDropdown, DropdownAction } from '@/components/ui/dropdown-menu';
import { Input, Select } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table';
import { CampaignRow, CampaignStatus, createCampaign, deleteCampaign, listCampaigns, updateCampaignStatus } from '@/services/campaigns';
import { listLaboratories, Laboratory } from '@/services/laboratories';

const EMPTY_FORM = { name: '', laboratoryId: '', startDate: '', endDate: '' };

const CAMPAIGN_MIGRATIONS = [
  'supabase/migrations/20260501153000_add_campaigns_if_missing.sql',
  'supabase/migrations/20260501170000_add_campaign_phases.sql',
  'supabase/migrations/20260501190000_add_campaign_product_arrangement.sql',
  'supabase/migrations/20260501203000_campaign_independent_arrangement.sql',
  'supabase/migrations/20260501213000_add_campaign_conditions_bonifications.sql',
  'supabase/migrations/20260501223000_extend_campaign_conditions_model.sql',
];

const isMissingCampaignSchema = (message: string | null) =>
  !!message && message.toLowerCase().includes('table supabase des campagnes est absente');

const PAGE_SIZE = 10;

export const CampaignsPage = () => {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isNameEditedManually, setIsNameEditedManually] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<CampaignRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExtendedFiltersOpen, setIsExtendedFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | CampaignStatus>('all');
  const [laboratoryFilter, setLaboratoryFilter] = useState<'all' | string>('all');
  const [draftStartFromFilter, setDraftStartFromFilter] = useState('');
  const [draftEndToFilter, setDraftEndToFilter] = useState('');
  const [startFromFilter, setStartFromFilter] = useState('');
  const [endToFilter, setEndToFilter] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const loadData = async () => {
    setIsLoading(true);
    setFeedback(null);

    const [campaignsResult, laboratoriesResult] = await Promise.allSettled([
      listCampaigns(),
      listLaboratories(),
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
      setLaboratories([]);
      setFeedback((current) => current ?? (laboratoriesResult.reason instanceof Error ? laboratoriesResult.reason.message : 'Impossible de charger les laboratoires.'));
    }

    setIsLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredCampaigns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      if (statusFilter !== 'all' && campaign.status !== statusFilter) return false;
      if (laboratoryFilter !== 'all' && campaign.supplier_id !== laboratoryFilter) return false;
      if (startFromFilter && campaign.start_date < startFromFilter) return false;
      if (endToFilter && campaign.end_date > endToFilter) return false;
      if (!query) return true;
      const searchable = [campaign.name, campaign.supplier_name ?? '', campaign.status];
      return searchable.some((value) => value.toLowerCase().includes(query));
    });
  }, [campaigns, searchQuery, statusFilter, laboratoryFilter, startFromFilter, endToFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / PAGE_SIZE));
  const paginatedCampaigns = useMemo(() => filteredCampaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredCampaigns, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const openModal = () => {
    setFeedback(null);
    setForm(EMPTY_FORM);
    setIsNameEditedManually(false);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (isNameEditedManually) return;
    const laboratory = laboratories.find((item) => item.id === form.laboratoryId);
    if (!laboratory || !form.startDate) {
      setForm((current) => ({ ...current, name: '' }));
      return;
    }

    const [year, month] = form.startDate.split('-');
    if (!year || !month) return;
    const generatedName = `${laboratory.designation} - ${month} - ${year}`;
    setForm((current) => ({ ...current, name: generatedName }));
  }, [form.laboratoryId, form.startDate, form.endDate, laboratories, isNameEditedManually]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.laboratoryId || !form.startDate || !form.endDate) return setFeedback('Tous les champs de campagne sont obligatoires.');
    if (form.endDate < form.startDate) return setFeedback('La date de clôture doit être supérieure ou égale à la date d’ouverture.');

    setIsSaving(true);
    try {
      await createCampaign({
        name: form.name.trim(),
        supplier_id: form.laboratoryId,
        start_date: form.startDate,
        end_date: form.endDate,
        pharmacy_ids: [],
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

  const goToParticipations = (campaignId: string) => {
    navigate(`/admin/campaigns/${campaignId}/participations`);
  };

  const openDeleteModal = (campaignId: string) => {
    const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId) ?? null;
    setCampaignToDelete(selectedCampaign);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setIsDeleteModalOpen(false);
    setCampaignToDelete(null);
  };

  const campaignActions = (campaignId: string): DropdownAction[] => ([
    { label: 'Paramétrer', onClick: () => goToSetup(campaignId) },
    { label: 'Participations', onClick: () => goToParticipations(campaignId) },
    { label: 'Ouvrir', onClick: () => void changeStatus(campaignId, 'open') },
    { label: 'Clôturer', onClick: () => void changeStatus(campaignId, 'closed') },
    { label: 'Archiver', onClick: () => void changeStatus(campaignId, 'archived') },
    { label: 'Supprimer', onClick: () => openDeleteModal(campaignId) },
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

  const handleDeleteCampaign = async () => {
    if (!campaignToDelete) return;
    setIsDeleting(true);

    try {
      await deleteCampaign(campaignToDelete.id);
      await loadData();
      setFeedback('Campagne supprimée avec succès.');
      closeDeleteModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Suppression impossible.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="grid">
      <Card style={{ minHeight: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column' }}>
        <div className="toolbar">
          <div>
            <h1>Campagnes d&apos;achat</h1>
            <p>Créer et piloter les campagnes via une table et des actions par ligne.</p>
          </div>
          <Button onClick={openModal}>Nouvelle campagne</Button>
        </div>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <Input
            placeholder="Rechercher une campagne"
            value={searchQuery}
            onChange={(event) => { setSearchQuery(event.target.value); setPage(1); }}
            style={{ minWidth: 260, flex: 1 }}
          />
          <Button variant="secondary" onClick={() => setIsExtendedFiltersOpen((current) => !current)}>
            {isExtendedFiltersOpen ? 'Masquer les filtres' : 'Filtres étendus'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSearchQuery('');
              setIsExtendedFiltersOpen(false);
              setStatusFilter('all');
              setLaboratoryFilter('all');
              setDraftStartFromFilter('');
              setDraftEndToFilter('');
              setStartFromFilter('');
              setEndToFilter('');
              setPage(1);
            }}
          >
            Réinitialiser
          </Button>
        </div>
        {isExtendedFiltersOpen && (
          <div
            style={{
              marginTop: 10,
              border: '1px solid #e4e4e7',
              borderRadius: 12,
              padding: 12,
              display: 'grid',
              gap: 10,
              background: '#fafafa',
            }}
          >
            <div className="grid grid-2" style={{ gap: 10 }}>
              <div>
                <label>Statut</label>
                <Select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as 'all' | CampaignStatus); setPage(1); }}>
                  <option value="all">Tous les statuts</option>
                  <option value="draft">Brouillon</option>
                  <option value="open">Ouverte</option>
                  <option value="closed">Clôturée</option>
                  <option value="archived">Archivée</option>
                </Select>
              </div>
              <div>
                <label>Laboratoire</label>
                <Select value={laboratoryFilter} onChange={(event) => { setLaboratoryFilter(event.target.value); setPage(1); }}>
                  <option value="all">Tous les laboratoires</option>
                  {laboratories.map((laboratory) => (
                    <option key={laboratory.id} value={laboratory.id}>
                      {laboratory.designation}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-2" style={{ gap: 10 }}>
              <div>
                <label>Ouverture à partir du</label>
                <Input type="date" value={draftStartFromFilter} onChange={(event) => setDraftStartFromFilter(event.target.value)} />
              </div>
              <div>
                <label>Clôture jusqu&apos;au</label>
                <Input type="date" value={draftEndToFilter} onChange={(event) => setDraftEndToFilter(event.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setDraftStartFromFilter(startFromFilter);
                  setDraftEndToFilter(endToFilter);
                }}
              >
                Annuler
              </Button>
              <Button
                onClick={() => {
                  setStartFromFilter(draftStartFromFilter);
                  setEndToFilter(draftEndToFilter);
                  setPage(1);
                }}
              >
                Appliquer les filtres
              </Button>
            </div>
          </div>
        )}
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
            {campaigns.length === 0 ? (
              <div style={{ border: '1px dashed #d4d4d8', borderRadius: 12, padding: 16, color: '#52525b' }}>
                Aucune campagne créée.
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div style={{ border: '1px dashed #d4d4d8', borderRadius: 12, padding: 16, color: '#52525b' }}>
                Aucune campagne ne correspond aux filtres.
              </div>
            ) : (
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
            )}
          </div>
        )}

        {!isLoading && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <p style={{ margin: 0 }}>Page {page} / {totalPages} - {filteredCampaigns.length} campagne(s)</p>
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
              <Select value={form.laboratoryId} onChange={(event) => setForm((current) => ({ ...current, laboratoryId: event.target.value }))} required>
                <option value="">Sélectionner un laboratoire</option>
                {laboratories.map((laboratory) => <option key={laboratory.id} value={laboratory.id}>{laboratory.designation}</option>)}
              </Select>
              <div className="grid grid-2">
                <div>
                  <label>Date de début</label>
                  <Input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} required />
                </div>
                <div>
                  <label>Date de fin</label>
                  <Input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} required />
                </div>
              </div>
              <div>
                <label>Dénomination de la campagne</label>
                <Input
                  placeholder="Ex: SAIPH - 05 - 2026"
                  value={form.name}
                  onChange={(event) => {
                    setIsNameEditedManually(true);
                    setForm((current) => ({ ...current, name: event.target.value }));
                  }}
                  required
                />
              </div>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Création...' : 'Créer en brouillon'}</Button>
            </form>
          </Card>
        </div>
      )}

      {isDeleteModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 40 }}>
          <Card>
            <div className="toolbar">
              <h2>Supprimer la campagne</h2>
              <Button variant="ghost" onClick={closeDeleteModal} disabled={isDeleting}>Fermer</Button>
            </div>
            <div className="grid">
              <p>Confirmer la suppression de <strong>{campaignToDelete?.name ?? 'cette campagne'}</strong> ?</p>
              <p>La suppression est autorisée uniquement pour les campagnes en brouillon ou sans participant ayant postulé.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={closeDeleteModal} disabled={isDeleting}>Annuler</Button>
                <Button variant="danger" onClick={() => void handleDeleteCampaign()} disabled={isDeleting}>
                  {isDeleting ? 'Suppression...' : 'Supprimer'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
