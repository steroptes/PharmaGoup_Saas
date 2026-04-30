import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ActionDropdown } from '@/components/ui/dropdown-menu';
import { Input, Select } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table';
import { listLaboratories, Laboratory } from '@/services/laboratories';
import {
  createManagedProduct,
  listManagedProducts,
  listVatRates,
  ManagedProduct,
  ProductNature,
  setManagedProductArchived,
  updateManagedProduct,
  VatRate,
} from '@/services/products';

const PAGE_SIZE = 8;
const EMPTY_FORM = { designation: '', nature: 'medicament' as ProductNature, pct_code: '', barcode: '', purchase_unit_price_ht: '', vat_rate_id: '', laboratory_id: '' };
const getFriendlyProductError = (error: unknown) => {
  const candidate = error as { message?: string; details?: string; hint?: string };
  const message = [candidate?.message, candidate?.details, candidate?.hint].filter(Boolean).join(' — ') || 'Action impossible.';
  if (message.includes('managed_products_pct_code_ci_unique') || message.includes('managed_products_pct_unique_not_null')) return 'Le code PCT existe déjà. Veuillez saisir un code PCT unique.';
  if (message.includes('managed_products_barcode_ci_unique') || message.includes('managed_products_barcode_key')) return 'Le code à barre existe déjà. Veuillez saisir un code à barre unique.';
  if (message.includes('root product is forbidden when laboratory has business units')) return "Ce laboratoire a des BU : l'ajout à la racine est bloqué par la règle SQL.";
  return message;
};

export const ProductsPage = () => {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [vatRates, setVatRates] = useState<VatRate[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [laboratoryFilter, setLaboratoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const actionLabel = useMemo(() => (editingId ? 'Mettre à jour' : 'Créer le produit'), [editingId]);

  useEffect(() => {
    const load = async () => {
      try {
        const [productsData, laboratoriesData, vatRatesData] = await Promise.all([listManagedProducts(), listLaboratories(), listVatRates()]);
        setProducts(productsData);
        setLaboratories(laboratoriesData);
        setVatRates(vatRatesData);
        setForm((current) => ({ ...current, vat_rate_id: current.vat_rate_id || vatRatesData[0]?.id || '', laboratory_id: current.laboratory_id || laboratoriesData[0]?.id || '' }));
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Impossible de charger les produits.');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => (laboratoryFilter === 'all' || p.laboratory_id === laboratoryFilter) && (!q || [p.designation, p.pct_code || '', p.barcode].some((v) => v.toLowerCase().includes(q))));
  }, [products, laboratoryFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const paginatedProducts = useMemo(() => filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredProducts, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const resetForm = () => { setForm({ ...EMPTY_FORM, vat_rate_id: vatRates[0]?.id || '', laboratory_id: laboratories[0]?.id || '' }); setEditingId(null); setFieldError(null); };
  const openCreateModal = () => { resetForm(); setIsModalOpen(true); };
  const openEditModal = (p: ManagedProduct) => { setEditingId(p.id); setForm({ designation: p.designation, nature: p.nature, pct_code: p.pct_code ?? '', barcode: p.barcode, purchase_unit_price_ht: String(p.purchase_unit_price_ht), vat_rate_id: p.vat_rate_id, laboratory_id: p.laboratory_id }); setFieldError(null); setIsModalOpen(true); };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.designation.trim()) return setFieldError('La désignation est obligatoire.');
    if (!form.vat_rate_id) return setFieldError('Le taux de TVA est obligatoire.');
    if (!form.laboratory_id) return setFieldError('Le laboratoire est obligatoire.');
    if (!form.purchase_unit_price_ht || Number(form.purchase_unit_price_ht) < 0) return setFieldError('Le PUA HT est obligatoire.');
    if (form.nature === 'medicament' && !form.pct_code.trim()) return setFieldError('Le code PCT est obligatoire pour un médicament.');

    setIsSaving(true); setFieldError(null); setFeedback(null);
    try {
      const payload = { designation: form.designation, nature: form.nature, pct_code: form.pct_code, barcode: form.barcode, purchase_unit_price_ht: Number(form.purchase_unit_price_ht), vat_rate_id: form.vat_rate_id, laboratory_id: form.laboratory_id };
      if (editingId) {
        const updated = await updateManagedProduct(editingId, payload);
        setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setFeedback('Fiche produit mise à jour.');
      } else {
        const created = await createManagedProduct(payload);
        setProducts((current) => [...current, created].sort((a, b) => a.designation.localeCompare(b.designation)));
        setFeedback('Fiche produit créée.');
      }
      setIsModalOpen(false); resetForm();
    } catch (error) { setFieldError(getFriendlyProductError(error)); } finally { setIsSaving(false); }
  };

  const toggleArchive = async (product: ManagedProduct) => {
    try {
      const updated = await setManagedProductArchived(product.id, product.is_active);
      setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setFeedback(updated.is_active ? 'Produit réactivé.' : 'Produit archivé.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Archivage impossible.'); }
  };

  return <div className="grid">{/* shortened intentionally */}
    <Card><h1>Produits</h1><p>Tableau des produits avec actions d’archivage et d’édition.</p>{feedback && <p style={{ marginTop: 12 }}>{feedback}</p>}</Card>
    <Card style={{ minHeight: "72vh", display: "flex", flexDirection: "column" }}>
      <div className="toolbar"><h2>Catalogue</h2><Button onClick={openCreateModal}>+ Ajouter un produit</Button></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12, marginTop: 12 }}>
        <Input placeholder="Rechercher par désignation, code PCT ou code à barre" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} />
        <Select value={laboratoryFilter} onChange={(e) => { setLaboratoryFilter(e.target.value); setPage(1); }}><option value="all">Tous les laboratoires</option>{laboratories.map((l) => <option key={l.id} value={l.id}>{l.designation}</option>)}</Select>
      </div>
      {isLoading && <p>Chargement...</p>}
      {!isLoading && paginatedProducts.length === 0 && <p>Aucun produit trouvé.</p>}
      {!isLoading && paginatedProducts.length > 0 && <div style={{ overflow: 'auto', width: '100%', marginTop: 12, flex: 1 }}>
        <Table>
          <TableHead><TableRow><TableHeaderCell>Désignation</TableHeaderCell><TableHeaderCell>Nature</TableHeaderCell><TableHeaderCell>PCT</TableHeaderCell><TableHeaderCell>Code barre</TableHeaderCell><TableHeaderCell>PUA HT</TableHeaderCell><TableHeaderCell>TVA</TableHeaderCell><TableHeaderCell>Laboratoire</TableHeaderCell><TableHeaderCell>Statut</TableHeaderCell><TableHeaderCell /></TableRow></TableHead>
          <TableBody>
            {paginatedProducts.map((p) => <TableRow key={p.id}><TableCell>{p.designation}</TableCell><TableCell>{p.nature}</TableCell><TableCell>{p.pct_code || '-'}</TableCell><TableCell>{p.barcode}</TableCell><TableCell>{p.purchase_unit_price_ht}</TableCell><TableCell>{p.vat_rate?.label || '-'}</TableCell><TableCell>{p.laboratory?.designation || '-'}</TableCell><TableCell>{p.is_active ? 'Actif' : 'Archivé'}</TableCell><TableCell><ActionDropdown actions={[{ label: 'Modifier', onClick: () => openEditModal(p) }, { label: p.is_active ? 'Archiver' : 'Réactiver', onClick: () => void toggleArchive(p) }, { label: 'Supprimer (bientôt)', onClick: () => undefined, disabled: true }]} /></TableCell></TableRow>)}
          </TableBody>
        </Table>
      </div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
        <p>Page {page} / {totalPages}</p>
        <div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button><Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</Button></div>
      </div>
    </Card>
    {isModalOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 40 }}><Card><div className="toolbar"><h2>{editingId ? 'Modifier le produit' : 'Ajouter un produit'}</h2><Button variant="ghost" onClick={() => setIsModalOpen(false)}>Fermer</Button></div><form className="grid" onSubmit={handleSubmit}><Input placeholder="Désignation" value={form.designation} onChange={(e) => setForm((c) => ({ ...c, designation: e.target.value }))} required /><Select value={form.nature} onChange={(e) => setForm((c) => ({ ...c, nature: e.target.value as ProductNature }))}><option value="medicament">Médicament</option><option value="para">Para</option></Select><Input placeholder="Code PCT (obligatoire pour médicament)" value={form.pct_code} onChange={(e) => setForm((c) => ({ ...c, pct_code: e.target.value }))} /><Input placeholder="Code barre (vide = PCT ou génération auto)" value={form.barcode} onChange={(e) => setForm((c) => ({ ...c, barcode: e.target.value }))} /><Input type="number" min="0" step="0.001" placeholder="PUA HT" value={form.purchase_unit_price_ht} onChange={(e) => setForm((c) => ({ ...c, purchase_unit_price_ht: e.target.value }))} required /><Select value={form.vat_rate_id} onChange={(e) => setForm((c) => ({ ...c, vat_rate_id: e.target.value }))} required><option value="" disabled>Sélectionner un taux TVA</option>{vatRates.map((r) => <option key={r.id} value={r.id}>{r.label} ({r.rate}%)</option>)}</Select><Select value={form.laboratory_id} onChange={(e) => setForm((c) => ({ ...c, laboratory_id: e.target.value }))} required><option value="" disabled>Sélectionner un laboratoire</option>{laboratories.map((l) => <option key={l.id} value={l.id}>{l.designation}</option>)}</Select>{fieldError && <p style={{ color: '#b42318' }}>{fieldError}</p>}<Button type="submit" disabled={isSaving}>{actionLabel}</Button></form></Card></div>}
  </div>;
};
