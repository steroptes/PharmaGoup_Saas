import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

const EMPTY_FORM = { designation: '', tax_identifier: '', address: '', mobile_phone: '', landline_phone: '' };

type NodeType = 'root' | 'business_unit' | 'group_brand';

export const LaboratoriesPage = () => {
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);
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

  useEffect(() => { if (selectedLabId) void loadCatalog(selectedLabId); }, [selectedLabId]);

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); };

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
      resetForm();
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

  return (<div className="grid"><Card><h1>Laboratoires</h1><p>Créer et gérer les fiches laboratoires, puis piloter le catalogue hiérarchique.</p></Card>
    <Card><h2>{editingId ? 'Modifier un laboratoire' : 'Créer un laboratoire'}</h2><form className="grid" onSubmit={handleSubmit}><Input placeholder="Désignation" value={form.designation} onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))} required /><Input placeholder="Matricule fiscal" value={form.tax_identifier} onChange={(event) => setForm((current) => ({ ...current, tax_identifier: event.target.value }))} /><Input placeholder="Adresse" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /><Input placeholder="Téléphone mobile" value={form.mobile_phone} onChange={(event) => setForm((current) => ({ ...current, mobile_phone: event.target.value }))} /><Input placeholder="Téléphone fixe" value={form.landline_phone} onChange={(event) => setForm((current) => ({ ...current, landline_phone: event.target.value }))} /><div style={{ display: 'flex', gap: 8 }}><Button type="submit" disabled={isSaving}>{actionLabel}</Button>{editingId && (<Button variant="ghost" type="button" onClick={resetForm}>Annuler</Button>)}</div></form>{feedback && <p>{feedback}</p>}</Card>
    <Card><h2>Fiches existantes</h2>{isLoading && <p>Chargement...</p>}<div className="grid">{laboratories.map((laboratory) => (<Card key={laboratory.id}><h3>{laboratory.designation}</h3><div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" type="button" onClick={() => setSelectedLabId(laboratory.id)}>Ouvrir catalogue</Button><Button variant="secondary" type="button" onClick={() => { setEditingId(laboratory.id); setForm({ designation: laboratory.designation ?? '', tax_identifier: laboratory.tax_identifier ?? '', address: laboratory.address ?? '', mobile_phone: laboratory.mobile_phone ?? '', landline_phone: laboratory.landline_phone ?? '' }); }}>Modifier</Button><Button variant="danger" type="button" onClick={() => void deleteLaboratory(laboratory.id)}>Supprimer</Button></div></Card>))}</div></Card>

    <Card>
      <h2>Catalogue laboratoire hiérarchique</h2>
      <Input placeholder="Recherche locale (BU, brand, produit)" value={search} onChange={(e) => setSearch(e.target.value)} />
      {catalogLoading && <p>Chargement du catalogue…</p>}
      {filtered && <>
        <p>Compteurs: BU {filtered.business_units.length} • Brands {(filtered.root_group_brands.length + filtered.business_units.reduce((acc, bu) => acc + bu.group_brands.length, 0))} • Produits {(filtered.root_products.length + filtered.business_units.reduce((acc, bu) => acc + bu.products.length + bu.group_brands.reduce((a, b) => a + b.products.length, 0), 0))}</p>
        <div><Button onClick={() => { setSelectedNode({ type: 'root' }); void handleCreateBU(); }}>Créer BU</Button>{filtered.business_units.length === 0 && <><Button variant="secondary">Ajouter produit racine</Button><Button variant="secondary">Créer brand racine</Button></>}</div>
        {filtered.business_units.length === 0 && <p>Mode sans BU: racine → brands racine + produits racine.</p>}
        {filtered.business_units.length > 0 && <p>Mode avec BU: racine → BU → brands/produits.</p>}
      </>}
    </Card>
  </div>);
};
