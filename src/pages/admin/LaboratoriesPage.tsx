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
import { listVatRates, ProductNature, VatRate } from '@/services/products';
import { supabase } from '@/lib/supabase';

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
  const [catalogActionModal, setCatalogActionModal] = useState<null | 'create_bu' | 'create_root_brand' | 'create_root_product'>(null);
  const [catalogActionValue, setCatalogActionValue] = useState('');
  const [productForm, setProductForm] = useState({ designation: '', nature: 'medicament' as ProductNature, pct_code: '', barcode: '', purchase_unit_price_ht: '', vat_rate_id: '' });
  const [vatRates, setVatRates] = useState<VatRate[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogView, setCatalogView] = useState<{ type: 'root' | 'business_unit' | 'group_brand'; id?: string; label: string }>({ type: 'root', label: 'Racine du laboratoire' });
  const [openRoot, setOpenRoot] = useState(true);
  const [openBu, setOpenBu] = useState(true);
  const [openBrands, setOpenBrands] = useState<Record<string, boolean>>({});

  const actionLabel = useMemo(() => (editingId ? 'Mettre à jour' : 'Créer la fiche'), [editingId]);

  const loadCatalog = async (labId: string) => {
    setCatalogLoading(true);
    try {
      const data = await getLaboratoryCatalogTree(labId);
      setCatalog(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de charger le catalogue laboratoire.';
      setCatalogError(message);
      setFeedback(message);
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
    void listVatRates().then((data) => setVatRates(data)).catch(() => undefined);
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
    setCatalogError(null);
    setCatalogView({ type: 'root', label: 'Racine du laboratoire' });
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

  const submitCreateBU = async () => {
    if (!selectedLabId || !catalogActionValue.trim()) return;
    try {
      const result = await createBusinessUnitOrRequireMigration(selectedLabId, catalogActionValue.trim());
      if (result.status === 'migration_required') {
        const init = await initFirstBuMigration(selectedLabId, catalogActionValue.trim());
        const plan = { products: init.inventory?.root_products?.map((p) => ({ id: p.id, target_type: 'business_unit' })) ?? [], group_brands: init.inventory?.root_group_brands?.map((b) => ({ id: b.id, target_type: 'business_unit' })) ?? [] };
        await previewFirstBuMigration(selectedLabId, init.migration_id, plan);
        setCatalogError('Création bloquée: ce laboratoire possède déjà des éléments à la racine (brands/produits). Veuillez les réorganiser avant de créer la première BU.');
        return;
      } else {
        setFeedback('BU créée avec succès.');
      }
      setCatalogHasPendingChanges(true);
      setCatalogActionModal(null);
      setCatalogActionValue('');
      await loadCatalog(selectedLabId);
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Création BU impossible.'); }
  };

  const submitCreateRootBrand = async () => {
    if (!selectedLabId || !catalogActionValue.trim()) return;
    if (filtered?.business_units.length && catalogView.type === 'root') return setCatalogError('Mode avec BU: sélectionnez d’abord une BU pour créer un brand.');
    const targetBuId = catalogView.type === 'business_unit' ? catalogView.id ?? null : null;
    const { error } = await supabase.from('group_brands').insert({ laboratory_id: selectedLabId, name: catalogActionValue.trim(), business_unit_id: targetBuId });
    if (error) return setFeedback(error.message);
    setCatalogHasPendingChanges(true);
    setCatalogActionModal(null);
    setCatalogActionValue('');
    setFeedback('Brand racine créé.');
    await loadCatalog(selectedLabId);
  };

  const submitCreateRootProduct = async () => {
    if (!selectedLabId) return;
    if (filtered?.business_units.length && catalogView.type === 'root') return setCatalogError('Mode avec BU: la création à la racine est interdite. Sélectionnez une BU ou un brand.');
    if (!productForm.designation.trim() || !productForm.vat_rate_id || !productForm.purchase_unit_price_ht) return setFeedback('Complétez les champs obligatoires du produit.');
    try {
      const payload: Record<string, unknown> = { designation: productForm.designation.trim(), nature: productForm.nature, pct_code: productForm.pct_code || null, barcode: productForm.barcode || null, purchase_unit_price_ht: Number(productForm.purchase_unit_price_ht), vat_rate_id: productForm.vat_rate_id, laboratory_id: selectedLabId, is_active: true, business_unit_id: null, group_brand_id: null };
      if (catalogView.type === 'business_unit' && catalogView.id) payload.business_unit_id = catalogView.id;
      if (catalogView.type === 'group_brand' && catalogView.id) payload.group_brand_id = catalogView.id;
      const { error } = await supabase.from('managed_products').insert(payload);
      if (error) throw error;
      setCatalogHasPendingChanges(true);
      setCatalogActionModal(null);
      setProductForm({ designation: '', nature: 'medicament', pct_code: '', barcode: '', purchase_unit_price_ht: '', vat_rate_id: vatRates[0]?.id || '' });
      setFeedback('Produit racine créé.');
      await loadCatalog(selectedLabId);
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Création produit impossible.'); }
  };



  const removeProduct = async (productId: string) => {
    if (!selectedLabId) return;
    try {
      await bulkDeleteProducts({ laboratoryId: selectedLabId, productIds: [productId] });
      setCatalogHasPendingChanges(true);
      await loadCatalog(selectedLabId);
    } catch (error) { setCatalogError(error instanceof Error ? error.message : 'Suppression produit impossible.'); }
  };

  const removeBrand = async (brandId: string) => {
    if (!selectedLabId) return;
    try {
      await bulkDeleteGroupBrands({ laboratoryId: selectedLabId, groupBrandIds: [brandId], mode: 'delete_with_products' });
      setCatalogHasPendingChanges(true);
      await loadCatalog(selectedLabId);
    } catch (error) { setCatalogError(error instanceof Error ? error.message : 'Suppression brand impossible.'); }
  };

  const removeBU = async (buId: string) => {
    if (!selectedLabId) return;
    try {
      await deleteBusinessUnit(buId);
      setCatalogHasPendingChanges(true);
      await loadCatalog(selectedLabId);
    } catch (error) { setCatalogError(error instanceof Error ? error.message : 'Suppression BU impossible.'); }
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


  const activeBusinessUnit = useMemo(() => (catalogView.type === 'business_unit' ? filtered?.business_units.find((bu) => bu.id === catalogView.id) : null), [catalogView, filtered]);
  const activeBrand = useMemo(() => {
    if (catalogView.type !== 'group_brand') return null;
    const rootBrand = filtered?.root_group_brands.find((brand) => brand.id === catalogView.id);
    if (rootBrand) return rootBrand;
    for (const bu of filtered?.business_units ?? []) {
      const b = bu.group_brands.find((brand) => brand.id === catalogView.id);
      if (b) return b;
    }
    return null;
  }, [catalogView, filtered]);

  return (<div className="grid"><Card><h1>Laboratoires</h1><p>Créer et gérer les fiches laboratoires, puis piloter le catalogue hiérarchique.</p>{feedback && <p style={{ marginTop: 12 }}>{feedback}</p>}</Card>
    <Card style={{ minHeight: "56vh", display: "flex", flexDirection: "column" }}><div className="toolbar"><h2>Fiches laboratoires</h2><Button onClick={openCreateModal}>+ Ajouter un laboratoire</Button></div>
      <Input placeholder="Rechercher par désignation, matricule fiscal ou téléphone" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setPage(1); }} style={{ marginTop: 12 }} />
      {isLoading && <p>Chargement...</p>}
      {!isLoading && paginatedLaboratories.length === 0 && <p>Aucun laboratoire trouvé.</p>}
      {!isLoading && paginatedLaboratories.length > 0 && <div style={{ overflow: 'auto', width: '100%', marginTop: 12, flex: 1 }}><Table><TableHead><TableRow><TableHeaderCell>Désignation</TableHeaderCell><TableHeaderCell>Matricule fiscal</TableHeaderCell><TableHeaderCell>Adresse</TableHeaderCell><TableHeaderCell>Mobile</TableHeaderCell><TableHeaderCell>Fixe</TableHeaderCell><TableHeaderCell /></TableRow></TableHead><TableBody>{paginatedLaboratories.map((laboratory) => <TableRow key={laboratory.id}><TableCell>{laboratory.designation}</TableCell><TableCell>{laboratory.tax_identifier || '-'}</TableCell><TableCell>{laboratory.address || '-'}</TableCell><TableCell>{laboratory.mobile_phone || '-'}</TableCell><TableCell>{laboratory.landline_phone || '-'}</TableCell><TableCell><ActionDropdown actions={[{ label: 'Voir le catalogue', onClick: () => openCatalogModal(laboratory.id) }, { label: 'Modifier', onClick: () => openEditModal(laboratory) }, { label: 'Retirer', onClick: () => void deleteLaboratory(laboratory.id) }]} /></TableCell></TableRow>)}</TableBody></Table></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}><p>Page {page} / {totalPages}</p><div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button><Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</Button></div></div>
    </Card>
    {isModalOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 40 }}><Card><div className="toolbar"><h2>{editingId ? 'Modifier le laboratoire' : 'Ajouter un laboratoire'}</h2><Button variant="ghost" onClick={() => setIsModalOpen(false)}>Fermer</Button></div><form className="grid" onSubmit={handleSubmit}><Input placeholder="Désignation" value={form.designation} onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))} required /><Input placeholder="Matricule fiscal" value={form.tax_identifier} onChange={(event) => setForm((current) => ({ ...current, tax_identifier: event.target.value }))} /><Input placeholder="Adresse" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /><Input placeholder="Téléphone mobile" value={form.mobile_phone} onChange={(event) => setForm((current) => ({ ...current, mobile_phone: event.target.value }))} /><Input placeholder="Téléphone fixe" value={form.landline_phone} onChange={(event) => setForm((current) => ({ ...current, landline_phone: event.target.value }))} /><Button type="submit" disabled={isSaving}>{actionLabel}</Button></form></Card></div>}


    {isCatalogModalOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 45 }}><Card style={{ width: 'min(980px, 92vw)', maxHeight: '88vh', overflow: 'auto', padding: 12 }}>
      <div className="toolbar"><h2>Catalogue laboratoire hiérarchique</h2><p>{catalogHasPendingChanges ? 'Modifications en cours' : 'Aucune modification en cours'}</p></div>
      <Input placeholder="Recherche locale (BU, brand, produit)" value={search} onChange={(e) => setSearch(e.target.value)} />
      {catalogLoading && <p>Chargement du catalogue…</p>}
      {catalogError && <div style={{ marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b' }}><strong>Erreur de gestion du catalogue:</strong> {catalogError}</div>}
      {filtered && <>
        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: filtered.business_units.length === 0 ? '#fff7ed' : '#ecfeff', border: '1px solid #e5e7eb' }}><strong>ℹ️ {filtered.business_units.length === 0 ? 'Mode sans BU' : 'Mode avec BU'}</strong><p style={{ marginTop: 4 }}>{filtered.business_units.length === 0 ? 'Le catalogue est géré à la racine (produits et brands).' : 'Sélectionnez une BU dans la barre de menu puis déroulez les accordéons pour gérer les produits.'}</p></div>
        <Card style={{ marginTop: 10, padding: 12, border: '1px solid #e2e8f0', borderRadius: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>
            <Button variant={catalogView.type === 'root' ? 'secondary' : 'ghost'} onClick={() => setCatalogView({ type: 'root', label: 'Racine du laboratoire' })}>Catalogue</Button>
            {filtered.business_units.map((bu) => <Button key={bu.id} variant={catalogView.id === bu.id ? 'secondary' : 'ghost'} onClick={() => setCatalogView({ type: 'business_unit', id: bu.id, label: bu.name })}>{bu.name}</Button>)}
          </div>

          {catalogView.type === 'root' && <div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, background: '#fff' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: 0 }}>Racine — Brands & Produits</h3><button type="button" onClick={() => setOpenRoot((v) => !v)} style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>{openRoot ? '⌄' : '›'}</button></div>{openRoot && <>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}><Button onClick={() => setCatalogActionModal('create_bu')}>Créer une unité (BU)</Button><Button variant="secondary" onClick={() => { setCatalogView({ type: 'root', label: 'Racine du laboratoire' }); setCatalogActionModal('create_root_brand'); }}>Nouvelle marque (racine)</Button><Button variant="secondary" onClick={() => { setCatalogView({ type: 'root', label: 'Racine du laboratoire' }); setCatalogActionModal('create_root_product'); }}>Nouveau produit (racine)</Button></div>
            {filtered.root_products.length > 0 && <div style={{ overflow: 'auto', marginTop: 8 }}><Table><TableHead><TableRow><TableHeaderCell>Produit</TableHeaderCell><TableHeaderCell>Nature</TableHeaderCell><TableHeaderCell /></TableRow></TableHead><TableBody>{filtered.root_products.map((product) => <TableRow key={product.id}><TableCell>{product.designation}</TableCell><TableCell>{product.nature}</TableCell><TableCell><Button variant="danger" onClick={() => void removeProduct(product.id)}>Retirer</Button></TableCell></TableRow>)}</TableBody></Table></div>}
            {filtered.root_group_brands.map((brand) => <details key={brand.id} style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}><summary style={{ cursor: 'pointer', listStyle: 'none' }}>Brand: {brand.name} <Button variant="danger" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void removeBrand(brand.id); }}>Retirer</Button></summary><div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}><Button variant="ghost" onClick={() => { setCatalogView({ type: 'group_brand', id: brand.id, label: brand.name }); setCatalogActionModal('create_root_product'); }}>Nouveau produit dans cette marque</Button></div>{brand.products.length > 0 && <div style={{ overflow: 'auto', marginTop: 8 }}><Table><TableHead><TableRow><TableHeaderCell>Produit</TableHeaderCell><TableHeaderCell>Nature</TableHeaderCell><TableHeaderCell /></TableRow></TableHead><TableBody>{brand.products.map((product) => <TableRow key={product.id}><TableCell>{product.designation}</TableCell><TableCell>{product.nature}</TableCell><TableCell><Button variant="danger" onClick={() => void removeProduct(product.id)}>Retirer</Button></TableCell></TableRow>)}</TableBody></Table></div>}</details>)}
          </>}</div>}

          {catalogView.type === 'business_unit' && activeBusinessUnit && <div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, background: '#fff' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><button type="button" onClick={() => setOpenBu((v) => !v)} style={{ background: 'transparent', border: 'none', fontWeight: 600, cursor: 'pointer' }}>{openBu ? '▾' : '▸'} BU: {activeBusinessUnit.name}</button><Button variant="danger" onClick={() => void removeBU(activeBusinessUnit.id)}>Retirer cette unité</Button></div>{openBu && <>
            {activeBusinessUnit.products.length > 0 && <div style={{ overflow: 'auto', marginTop: 8 }}><Table><TableHead><TableRow><TableHeaderCell>Produit BU</TableHeaderCell><TableHeaderCell>Nature</TableHeaderCell><TableHeaderCell /></TableRow></TableHead><TableBody>{activeBusinessUnit.products.map((product) => <TableRow key={product.id}><TableCell>{product.designation}</TableCell><TableCell>{product.nature}</TableCell><TableCell><Button variant="danger" onClick={() => void removeProduct(product.id)}>Retirer</Button></TableCell></TableRow>)}</TableBody></Table></div>}
            {activeBusinessUnit.group_brands.map((brand) => <details key={brand.id} style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}><summary style={{ cursor: 'pointer', listStyle: 'none' }}>Brand: {brand.name} <Button variant="danger" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void removeBrand(brand.id); }}>Retirer</Button></summary><div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}><Button variant="ghost" onClick={() => { setCatalogView({ type: 'group_brand', id: brand.id, label: brand.name }); setCatalogActionModal('create_root_product'); }}>Nouveau produit dans cette marque</Button></div>{brand.products.length > 0 && <div style={{ overflow: 'auto', marginTop: 8 }}><Table><TableHead><TableRow><TableHeaderCell>Produit</TableHeaderCell><TableHeaderCell>Nature</TableHeaderCell><TableHeaderCell /></TableRow></TableHead><TableBody>{brand.products.map((product) => <TableRow key={product.id}><TableCell>{product.designation}</TableCell><TableCell>{product.nature}</TableCell><TableCell><Button variant="danger" onClick={() => void removeProduct(product.id)}>Retirer</Button></TableCell></TableRow>)}</TableBody></Table></div>}</details>)}
          </>}</div>}
        </Card>
      </>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button variant="ghost" type="button" onClick={closeCatalogByCancel}>Annuler</Button>
        <Button type="button" onClick={closeCatalogBySave}>Enregistrer</Button>
      </div>
    </Card></div>}

    {catalogActionModal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 50 }}><Card style={{ width: 'min(640px, 94vw)' }}>
      <div className="toolbar"><h2>{catalogActionModal === 'create_bu' ? 'Créer une BU' : catalogActionModal === 'create_root_brand' ? 'Créer un brand racine' : 'Ajouter un produit racine'}</h2><Button variant="ghost" onClick={() => setCatalogActionModal(null)}>Fermer</Button></div>
      {catalogActionModal !== 'create_root_product' && <div className="grid"><Input placeholder={catalogActionModal === 'create_bu' ? 'Nom de la BU' : 'Nom du brand'} value={catalogActionValue} onChange={(e) => setCatalogActionValue(e.target.value)} /><div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}><Button variant="ghost" onClick={() => setCatalogActionModal(null)}>Annuler</Button><Button onClick={() => void (catalogActionModal === 'create_bu' ? submitCreateBU() : submitCreateRootBrand())}>Enregistrer</Button></div></div>}
      {catalogActionModal === 'create_root_product' && <div className="grid"><Input placeholder="Désignation" value={productForm.designation} onChange={(e) => setProductForm((c) => ({ ...c, designation: e.target.value }))} /><Input placeholder="Code PCT (obligatoire pour médicament)" value={productForm.pct_code} onChange={(e) => setProductForm((c) => ({ ...c, pct_code: e.target.value }))} /><Input placeholder="Code barre" value={productForm.barcode} onChange={(e) => setProductForm((c) => ({ ...c, barcode: e.target.value }))} /><Input type="number" min="0" step="0.001" placeholder="PUA HT" value={productForm.purchase_unit_price_ht} onChange={(e) => setProductForm((c) => ({ ...c, purchase_unit_price_ht: e.target.value }))} /><select value={productForm.nature} onChange={(e) => setProductForm((c) => ({ ...c, nature: e.target.value as ProductNature }))}><option value="medicament">Médicament</option><option value="para">Para</option></select><select value={productForm.vat_rate_id} onChange={(e) => setProductForm((c) => ({ ...c, vat_rate_id: e.target.value }))}><option value="" disabled>Sélectionner un taux TVA</option>{vatRates.map((r) => <option key={r.id} value={r.id}>{r.label} ({r.rate}%)</option>)}</select><div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}><Button variant="ghost" onClick={() => setCatalogActionModal(null)}>Annuler</Button><Button onClick={() => void submitCreateRootProduct()}>Enregistrer</Button></div></div>}
    </Card></div>}

  </div>);
};
