import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
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
const IMPORT_HEADERS = ['designation', 'nature', 'pct_code', 'barcode', 'purchase_unit_price_ht', 'vat_rate_label', 'laboratory_designation'];
type ImportRow = {
  designation: string;
  nature: ProductNature;
  pct_code: string;
  barcode: string;
  purchase_unit_price_ht: number;
  vat_rate_id: string;
  vat_rate_label: string;
  laboratory_id: string;
  laboratory_designation: string;
};

const getFriendlyProductError = (error: unknown) => {
  const candidate = error as { message?: string; details?: string; hint?: string };
  const message = [candidate?.message, candidate?.details, candidate?.hint].filter(Boolean).join(' — ') || 'Action impossible.';
  if (message.includes('managed_products_pct_code_ci_unique') || message.includes('managed_products_pct_unique_not_null')) return 'Le code PCT existe déjà. Veuillez saisir un code PCT unique.';
  if (message.includes('managed_products_barcode_ci_unique') || message.includes('managed_products_barcode_key')) return 'Le code à barre existe déjà. Veuillez saisir un code à barre unique.';
  if (message.includes('root product is forbidden when laboratory has business units')) return "Configuration SQL non alignée: appliquez les dernières migrations pour autoriser la création indépendante du catalogue.";
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
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleDownloadTemplate = () => {
    const sheet = XLSX.utils.json_to_sheet([Object.fromEntries(IMPORT_HEADERS.map((h) => [h, '']))], { header: IMPORT_HEADERS, skipHeader: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'produits');
    XLSX.writeFile(wb, 'modele_import_produits.xlsx');
  };

  const parseImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportErrors([]); setImportRows([]); setFeedback(null);
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
    if (!raw.length) {
      setImportErrors(['Le fichier est vide.']);
      setIsImportModalOpen(true);
      return;
    }

    const errors: string[] = [];
    const parsedRows: ImportRow[] = [];
    raw.forEach((row, index) => {
      const line = index + 2;
      const designation = String(row.designation || '').trim();
      const nature = String(row.nature || '').trim().toLowerCase();
      const pctCode = String(row.pct_code || '').trim();
      const barcode = String(row.barcode || '').trim();
      const price = Number(row.purchase_unit_price_ht);
      const vatRateLabel = String(row.vat_rate_label || '').trim();
      const laboratoryDesignation = String(row.laboratory_designation || '').trim();

      const vatRate = vatRates.find((v) => v.label.toLowerCase() === vatRateLabel.toLowerCase());
      const laboratory = laboratories.find((l) => l.designation.toLowerCase() === laboratoryDesignation.toLowerCase());

      if (!designation) errors.push(`Ligne ${line}: designation obligatoire.`);
      if (nature !== 'medicament' && nature !== 'para') errors.push(`Ligne ${line}: nature invalide (medicament|para).`);
      if (nature === 'medicament' && !pctCode) errors.push(`Ligne ${line}: pct_code obligatoire pour médicament.`);
      if (!Number.isFinite(price) || price < 0) errors.push(`Ligne ${line}: purchase_unit_price_ht invalide.`);
      if (!vatRate) errors.push(`Ligne ${line}: vat_rate_label introuvable (${vatRateLabel}).`);
      if (!laboratory) errors.push(`Ligne ${line}: laboratory_designation introuvable (${laboratoryDesignation}).`);

      if (!errors.some((e) => e.includes(`Ligne ${line}:`))) {
        parsedRows.push({ designation, nature: nature as ProductNature, pct_code: pctCode, barcode, purchase_unit_price_ht: price, vat_rate_id: vatRate!.id, vat_rate_label: vatRate!.label, laboratory_id: laboratory!.id, laboratory_designation: laboratory!.designation });
      }
    });

    const seenPct = new Map<string, number>();
    const seenBarcode = new Map<string, number>();
    parsedRows.forEach((row, idx) => {
      const line = idx + 2;
      if (row.pct_code) {
        const pct = row.pct_code.toLowerCase();
        if (seenPct.has(pct)) {
          errors.push(`Ligne ${line}: pct_code en doublon dans le fichier (déjà vu ligne ${seenPct.get(pct)}).`);
        } else {
          seenPct.set(pct, line);
        }
      }
      if (row.barcode) {
        const barcode = row.barcode.toLowerCase();
        if (seenBarcode.has(barcode)) {
          errors.push(`Ligne ${line}: barcode en doublon dans le fichier (déjà vu ligne ${seenBarcode.get(barcode)}).`);
        } else {
          seenBarcode.set(barcode, line);
        }
      }
    });

    const existingPct = new Set(products.map((p) => (p.pct_code || '').toLowerCase()).filter(Boolean));
    const existingBarcode = new Set(products.map((p) => p.barcode.toLowerCase()).filter(Boolean));
    parsedRows.forEach((row, idx) => {
      const line = idx + 2;
      if (row.pct_code && existingPct.has(row.pct_code.toLowerCase())) {
        errors.push(`Ligne ${line}: pct_code déjà existant dans le catalogue.`);
      }
      if (row.barcode && existingBarcode.has(row.barcode.toLowerCase())) {
        errors.push(`Ligne ${line}: barcode déjà existant dans le catalogue.`);
      }
    });

    setImportErrors(errors);
    setImportRows(parsedRows);
    setIsImportModalOpen(true);
    event.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!importRows.length || importErrors.length > 0) return;
    setIsImporting(true);
    try {
      const created: ManagedProduct[] = [];
      for (const row of importRows) {
        const product = await createManagedProduct({
          designation: row.designation,
          nature: row.nature,
          pct_code: row.pct_code,
          barcode: row.barcode,
          purchase_unit_price_ht: row.purchase_unit_price_ht,
          vat_rate_id: row.vat_rate_id,
          laboratory_id: row.laboratory_id,
        });
        created.push(product);
      }
      setProducts((current) => [...current, ...created].sort((a, b) => a.designation.localeCompare(b.designation)));
      setFeedback(`${created.length} produit(s) importé(s) avec succès.`);
      setIsImportModalOpen(false);
      setImportRows([]);
    } catch (error) {
      setImportErrors([getFriendlyProductError(error)]);
    } finally {
      setIsImporting(false);
    }
  };

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
      <div className="toolbar"><h2>Catalogue</h2><div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" onClick={handleDownloadTemplate}>Télécharger le modèle Excel</Button><Button variant="secondary" onClick={() => fileInputRef.current?.click()}>Importer</Button><Button onClick={openCreateModal}>+ Ajouter un produit</Button></div></div>
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={(e) => void parseImportFile(e)} style={{ display: 'none' }} />
      {importErrors.length > 0 && <div style={{ marginTop: 8, color: '#b42318' }}>{importErrors.map((err) => <p key={err}>{err}</p>)}</div>}
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
    {isImportModalOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 45 }}><Card style={{ width: 'min(1100px, 96vw)', maxHeight: '88vh', overflow: 'auto' }}><div className="toolbar"><h2>Prévisualisation de l’import</h2><Button variant="ghost" onClick={() => setIsImportModalOpen(false)}>Fermer</Button></div><p>{importRows.length} ligne(s) chargée(s) pour import.</p>{importErrors.length > 0 && <div style={{ color: '#b42318', marginTop: 8 }}><p>Corrigez les erreurs suivantes avant de valider :</p>{importErrors.map((err) => <p key={err}>{err}</p>)}</div>}<div style={{ overflow: 'auto', marginTop: 12 }}><Table><TableHead><TableRow><TableHeaderCell>Désignation</TableHeaderCell><TableHeaderCell>Nature</TableHeaderCell><TableHeaderCell>PCT</TableHeaderCell><TableHeaderCell>Code barre</TableHeaderCell><TableHeaderCell>PUA HT</TableHeaderCell><TableHeaderCell>TVA</TableHeaderCell><TableHeaderCell>Laboratoire</TableHeaderCell></TableRow></TableHead><TableBody>{importRows.map((row, idx) => <TableRow key={`${row.designation}-${idx}`}><TableCell>{row.designation}</TableCell><TableCell>{row.nature}</TableCell><TableCell>{row.pct_code || '-'}</TableCell><TableCell>{row.barcode || '(auto)'}</TableCell><TableCell>{row.purchase_unit_price_ht}</TableCell><TableCell>{row.vat_rate_label}</TableCell><TableCell>{row.laboratory_designation}</TableCell></TableRow>)}</TableBody></Table></div><div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button variant="secondary" onClick={() => setIsImportModalOpen(false)}>Annuler</Button><Button onClick={() => void handleConfirmImport()} disabled={isImporting || importErrors.length > 0 || importRows.length === 0}>{isImporting ? 'Import en cours...' : 'Valider et créer'}</Button></div></Card></div>}
    {isModalOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 40 }}><Card><div className="toolbar"><h2>{editingId ? 'Modifier le produit' : 'Ajouter un produit'}</h2><Button variant="ghost" onClick={() => setIsModalOpen(false)}>Fermer</Button></div><form className="grid" onSubmit={handleSubmit}><Input placeholder="Désignation" value={form.designation} onChange={(e) => setForm((c) => ({ ...c, designation: e.target.value }))} required /><Select value={form.nature} onChange={(e) => setForm((c) => ({ ...c, nature: e.target.value as ProductNature }))}><option value="medicament">Médicament</option><option value="para">Para</option></Select><Input placeholder="Code PCT (obligatoire pour médicament)" value={form.pct_code} onChange={(e) => setForm((c) => ({ ...c, pct_code: e.target.value }))} /><Input placeholder="Code barre (vide = PCT ou génération auto)" value={form.barcode} onChange={(e) => setForm((c) => ({ ...c, barcode: e.target.value }))} /><Input type="number" min="0" step="0.001" placeholder="PUA HT" value={form.purchase_unit_price_ht} onChange={(e) => setForm((c) => ({ ...c, purchase_unit_price_ht: e.target.value }))} required /><Select value={form.vat_rate_id} onChange={(e) => setForm((c) => ({ ...c, vat_rate_id: e.target.value }))} required><option value="" disabled>Sélectionner un taux TVA</option>{vatRates.map((r) => <option key={r.id} value={r.id}>{r.label} ({r.rate}%)</option>)}</Select><Select value={form.laboratory_id} onChange={(e) => setForm((c) => ({ ...c, laboratory_id: e.target.value }))} required><option value="" disabled>Sélectionner un laboratoire</option>{laboratories.map((l) => <option key={l.id} value={l.id}>{l.designation}</option>)}</Select>{fieldError && <p style={{ color: '#b42318' }}>{fieldError}</p>}<Button type="submit" disabled={isSaving}>{actionLabel}</Button></form></Card></div>}
  </div>;
};
