import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ActionDropdown } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table';
import {
  createLaboratory,
  deleteLaboratory,
  Laboratory,
  listLaboratories,
  updateLaboratory,
} from '@/services/laboratories';
import { getLaboratoryCatalogTree, LaboratoryCatalogTree } from '@/services/catalogue';
import { bulkDeleteGroupBrands, bulkDeleteProducts, bulkMoveGroupBrands, bulkMoveProducts, deleteBusinessUnit } from '@/services/catalogBulk';
import { commitFirstBuMigration, createBusinessUnitOrRequireMigration, initFirstBuMigration, previewFirstBuMigration } from '@/services/catalogFirstBuMigration';

const PAGE_SIZE = 8;
const EMPTY_FORM = { designation: '', tax_identifier: '', address: '', mobile_phone: '', landline_phone: '' };

type NodeType = 'root' | 'business_unit' | 'group_brand';

export const LaboratoriesPage = () => {
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalogHasPendingChanges, setCatalogHasPendingChanges] = useState(false);
  const [catalog, setCatalog] = useState<LaboratoryCatalogTree | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedNode, setSelectedNode] = useState<{ type: NodeType; id?: string } | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);

  const actionLabel = useMemo(() => (editingId ? 'Mettre à jour' : 'Créer la fiche'), [editingId]);

  const loadCatalog = async (labId: string) => {
    setCatalogLoading(true);
    try {
      const data = await getLaboratoryCatalogTree(labId);
      setCatalog(data);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Impossible de charger le catalogue laboratoire.');
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const data = await listLaboratories();
        setLaboratories(data);
        if (data[0]) setSelectedLabId(data[0].id);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Impossible de charger les laboratoires.');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => { if (selectedLabId && isCatalogModalOpen) void loadCatalog(selectedLabId); }, [selectedLabId, isCatalogModalOpen]);

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); };
  const openCreateModal = () => { resetForm(); setIsModalOpen(true); };
  const openEditModal = (laboratory: Laboratory) => {
    setEditingId(laboratory.id);
    setForm({ designation: laboratory.designation ?? '', tax_identifier: laboratory.tax_identifier ?? '', address: laboratory.address ?? '', mobile_phone: laboratory.mobile_phone ?? '', landline_phone: laboratory.landline_phone ?? '' });
    setIsModalOpen(true);
  };


  const openCatalogModal = (labId: string) => {
    setSelectedLabId(labId);
    setSearch('');
    setCatalogHasPendingChanges(false);
    setIsCatalogModalOpen(true);
  };

  const closeCatalogByCancel = () => {
    setCatalogHasPendingChanges(false);
    setIsCatalogModalOpen(false);
    setCatalog(null);
    setSearch('');
  };

  const closeCatalogBySave = () => {
    setCatalogHasPendingChanges(false);
    setIsCatalogModalOpen(false);
    setFeedback('Catalogue enregistré.');
  };
  const filteredLaboratories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return laboratories.filter((laboratory) => !q || [laboratory.designation ?? '', laboratory.tax_identifier ?? '', laboratory.mobile_phone ?? '', laboratory.landline_phone ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [laboratories, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredLaboratories.length / PAGE_SIZE));
  const paginatedLaboratories = useMemo(() => filteredLaboratories.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredLaboratories, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.designation.trim()) return setFeedback('La désignation est obligatoire.');
    setIsSaving(true); setFeedback(null);
    try {
      if (editingId) {
        const updated = await updateLaboratory(editingId, form);
        setLaboratories((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setFeedback('Fiche laboratoire mise à jour.');
      } else {
        const created = await createLaboratory(form);
        setLaboratories((current) => [...current, created].sort((a, b) => a.designation.localeCompare(b.designation)));
        setFeedback('Fiche laboratoire créée.');
      }
      setIsModalOpen(false); resetForm();
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Action impossible.'); } finally { setIsSaving(false); }
  };

  const handleCreateBU = async () => {
    if (!selectedLabId) return;
    const name = window.prompt('Nom de la BU');
    if (!name) return;
    try {
      const result = await createBusinessUnitOrRequireMigration(selectedLabId, name);
      if (result.status === 'migration_required') {
        const init = await initFirstBuMigration(selectedLabId, name);
        const plan = { products: init.inventory?.root_products?.map((p) => ({ id: p.id, target_type: 'business_unit' })) ?? [], group_brands: init.inventory?.root_group_brands?.map((b) => ({ id: b.id, target_type: 'business_unit' })) ?? [] };
        await previewFirstBuMigration(selectedLabId, init.migration_id, plan);
        if (window.confirm('Migration requise. Confirmer le commit du plan de migration initial ?')) {
          await commitFirstBuMigration(selectedLabId, init.migration_id, plan);
          setFeedback('Migration première BU effectuée avec succès.');
        }
      } else {
        setFeedback('BU créée avec succès.');
      }
      setCatalogHasPendingChanges(true);
      await loadCatalog(selectedLabId);
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Création BU impossible.'); }
  };

  const filtered = useMemo(() => {
    if (!catalog) return null;
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return {
      ...catalog,
      root_products: catalog.root_products.filter((p) => p.designation.toLowerCase().includes(q)),
      root_group_brands: catalog.root_group_brands.filter((b) => b.name.toLowerCase().includes(q) || b.products.some((p) => p.designation.toLowerCase().includes(q))),
      business_units: catalog.business_units.filter((bu) => bu.name.toLowerCase().includes(q) || bu.products.some((p) => p.designation.toLowerCase().includes(q)) || bu.group_brands.some((b) => b.name.toLowerCase().includes(q) || b.products.some((p) => p.designation.toLowerCase().includes(q)))),
    };
  }, [catalog, search]);

  return (<div className="grid"><Card><h1>Laboratoires</h1><p>Créer et gérer les fiches laboratoires, puis piloter le catalogue hiérarchique.</p>{feedback && <p style={{ marginTop: 12 }}>{feedback}</p>}</Card>
    <Card style={{ minHeight: "56vh", display: "flex", flexDirection: "column" }}><div className="toolbar"><h2>Fiches laboratoires</h2><Button onClick={openCreateModal}>+ Ajouter un laboratoire</Button></div>
      <Input placeholder="Rechercher par désignation, matricule fiscal ou téléphone" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setPage(1); }} style={{ marginTop: 12 }} />
      {isLoading && <p>Chargement...</p>}
      {!isLoading && paginatedLaboratories.length === 0 && <p>Aucun laboratoire trouvé.</p>}
      {!isLoading && paginatedLaboratories.length > 0 && <div style={{ overflow: 'auto', width: '100%', marginTop: 12, flex: 1 }}><Table><TableHead><TableRow><TableHeaderCell>Désignation</TableHeaderCell><TableHeaderCell>Matricule fiscal</TableHeaderCell><TableHeaderCell>Adresse</TableHeaderCell><TableHeaderCell>Mobile</TableHeaderCell><TableHeaderCell>Fixe</TableHeaderCell><TableHeaderCell /></TableRow></TableHead><TableBody>{paginatedLaboratories.map((laboratory) => <TableRow key={laboratory.id}><TableCell>{laboratory.designation}</TableCell><TableCell>{laboratory.tax_identifier || '-'}</TableCell><TableCell>{laboratory.address || '-'}</TableCell><TableCell>{laboratory.mobile_phone || '-'}</TableCell><TableCell>{laboratory.landline_phone || '-'}</TableCell><TableCell><ActionDropdown actions={[{ label: 'Voir le catalogue', onClick: () => openCatalogModal(laboratory.id) }, { label: 'Modifier', onClick: () => openEditModal(laboratory) }, { label: 'Supprimer', onClick: () => void deleteLaboratory(laboratory.id) }]} /></TableCell></TableRow>)}</TableBody></Table></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}><p>Page {page} / {totalPages}</p><div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button><Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</Button></div></div>
    </Card>
    {isModalOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 40 }}><Card><div className="toolbar"><h2>{editingId ? 'Modifier le laboratoire' : 'Ajouter un laboratoire'}</h2><Button variant="ghost" onClick={() => setIsModalOpen(false)}>Fermer</Button></div><form className="grid" onSubmit={handleSubmit}><Input placeholder="Désignation" value={form.designation} onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))} required /><Input placeholder="Matricule fiscal" value={form.tax_identifier} onChange={(event) => setForm((current) => ({ ...current, tax_identifier: event.target.value }))} /><Input placeholder="Adresse" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /><Input placeholder="Téléphone mobile" value={form.mobile_phone} onChange={(event) => setForm((current) => ({ ...current, mobile_phone: event.target.value }))} /><Input placeholder="Téléphone fixe" value={form.landline_phone} onChange={(event) => setForm((current) => ({ ...current, landline_phone: event.target.value }))} /><Button type="submit" disabled={isSaving}>{actionLabel}</Button></form></Card></div>}


    {isCatalogModalOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 45 }}><Card style={{ width: 'min(1100px, 94vw)', maxHeight: '90vh', overflow: 'auto' }}>
      <div className="toolbar"><h2>Catalogue laboratoire hiérarchique</h2><p>{catalogHasPendingChanges ? 'Modifications en cours' : 'Aucune modification en cours'}</p></div>
      <Input placeholder="Recherche locale (BU, brand, produit)" value={search} onChange={(e) => setSearch(e.target.value)} />
      {catalogLoading && <p>Chargement du catalogue…</p>}
      {filtered && <>
        <p>Compteurs: BU {filtered.business_units.length} • Brands {(filtered.root_group_brands.length + filtered.business_units.reduce((acc, bu) => acc + bu.group_brands.length, 0))} • Produits {(filtered.root_products.length + filtered.business_units.reduce((acc, bu) => acc + bu.products.length + bu.group_brands.reduce((a, b) => a + b.products.length, 0), 0))}</p>
        <div><Button onClick={() => { setSelectedNode({ type: 'root' }); void handleCreateBU(); }}>Créer BU</Button>{filtered.business_units.length === 0 && <><Button variant="secondary">Ajouter produit racine</Button><Button variant="secondary">Créer brand racine</Button></>}</div>
        {filtered.business_units.length === 0 && <p>Mode sans BU: racine → brands racine + produits racine.</p>}
        {filtered.business_units.length > 0 && <p>Mode avec BU: racine → BU → brands/produits.</p>}
      </>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button variant="ghost" type="button" onClick={closeCatalogByCancel}>Annuler</Button>
        <Button type="button" onClick={closeCatalogBySave}>Enregistrer</Button>
      </div>
    </Card></div>}

  </div>);
};
