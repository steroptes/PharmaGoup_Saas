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
  deleteManagedProduct ,
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
const IMPORT_COLUMNS = [
  { key: 'designation', label: 'Désignation', description: 'Nom commercial du produit (obligatoire).' },
  { key: 'nature', label: 'Nature', description: 'Valeur attendue: medicament ou para.' },
  { key: 'pct_code', label: 'Code PCT', description: 'Obligatoire si Nature = medicament.' },
  { key: 'barcode', label: 'Code barre', description: 'Code barre produit. Peut être vide (génération auto).' },
  { key: 'purchase_unit_price_ht', label: 'PUA HT', description: 'Prix unitaire d’achat HT (nombre >= 0).' },
  { key: 'vat_rate_label', label: 'Taux TVA', description: 'Libellé exact d’un taux TVA existant (ex: TVA 7%).' },
  { key: 'laboratory_designation', label: 'Laboratoire', description: 'Désignation exacte d’un laboratoire existant.' },
] as const;
const IMPORT_HEADERS = IMPORT_COLUMNS.map((column) => column.key);
const IMPORT_HEADER_LABELS = Object.fromEntries(IMPORT_COLUMNS.map((column) => [column.key, column.label])) as Record<string, string>;
type ImportRow = {
  row_number: number;
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
type ImportAnomalyRow = {
  row_number: number;
  designation: string;
  nature: string;
  pct_code: string;
  barcode: string;
  purchase_unit_price_ht: string;
  vat_rate_label: string;
  laboratory_designation: string;
  errors: string[];
};
type EditableAnomalyField = 'designation' | 'nature' | 'pct_code' | 'barcode' | 'purchase_unit_price_ht' | 'vat_rate_label' | 'laboratory_designation';
type ToastMessage = { id: string; title: string; lines: string[] };

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
  // Compat guard: referenced by older selection callbacks still mounted in some client bundles.
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [anomalyRows, setAnomalyRows] = useState<ImportAnomalyRow[]>([]);
  const [activeImportTab, setActiveImportTab] = useState<'entries' | 'anomalies'>('entries');
  const [editingCell, setEditingCell] = useState<{ row: number; field: EditableAnomalyField } | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showErrorToast = (title: string, lines: string[]) => {
    if (!lines.length) return;
    const toast = { id: `${title}-${Date.now()}-${Math.random()}`, title, lines };
    setToasts((current) => [...current, toast]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id));
    }, 7000);
  };
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

  useEffect(() => {
    if (!importErrors.length) return;
    const grouped = new Map<string, string[]>();
    importErrors.forEach((error) => {
      const match = error.match(/^Ligne\s+(\d+):\s*(.*)$/i);
      if (!match) return;
      const key = `Ligne ${match[1]}`;
      grouped.set(key, [...(grouped.get(key) ?? []), match[2]]);
    });
    const nextToasts = Array.from(grouped.entries()).map(([title, lines]) => ({ id: `${title}-${Date.now()}`, title, lines }));
    setToasts(nextToasts);
    const timer = setTimeout(() => setToasts([]), 6000);
    return () => clearTimeout(timer);
  }, [importErrors]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => (laboratoryFilter === 'all' || p.laboratory_id === laboratoryFilter) && (!q || [p.designation, p.pct_code || '', p.barcode].some((v) => v.toLowerCase().includes(q))));
  }, [products, laboratoryFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const paginatedProducts = useMemo(() => filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredProducts, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setSelectedProductIds((current) => current.filter((id) => products.some((p) => p.id === id)));
  }, [products]);

  const resetForm = () => { setForm({ ...EMPTY_FORM, vat_rate_id: vatRates[0]?.id || '', laboratory_id: laboratories[0]?.id || '' }); setEditingId(null); setFieldError(null); };
  const openCreateModal = () => { resetForm(); setIsModalOpen(true); };
  const openEditModal = (p: ManagedProduct) => { setEditingId(p.id); setForm({ designation: p.designation, nature: p.nature, pct_code: p.pct_code ?? '', barcode: p.barcode, purchase_unit_price_ht: String(p.purchase_unit_price_ht), vat_rate_id: p.vat_rate_id, laboratory_id: p.laboratory_id }); setFieldError(null); setIsModalOpen(true); };

  const handleDownloadTemplate = () => {
    const userHeaders = IMPORT_COLUMNS.map((column) => column.label);
    const sheet = XLSX.utils.json_to_sheet([Object.fromEntries(userHeaders.map((h) => [h, '']))], { header: userHeaders, skipHeader: false });
    const helpSheet = XLSX.utils.json_to_sheet(IMPORT_COLUMNS.map((column) => ({
      'Colonne (Excel)': column.label,
      'Clé technique (code)': column.key,
      'Description': column.description,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'produits');
    XLSX.utils.book_append_sheet(wb, helpSheet, 'description_champs');
    XLSX.writeFile(wb, 'modele_import_produits.xlsx');
  };

  const parseImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportErrors([]); setImportRows([]); setFeedback(null);
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const rawWithFrenchHeaders = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
    const raw = rawWithFrenchHeaders.map((row) => {
      const mapped: Record<string, unknown> = {};
      IMPORT_HEADERS.forEach((key) => {
        mapped[key] = row[IMPORT_HEADER_LABELS[key]] ?? row[key] ?? '';
      });
      return mapped;
    });
    if (!raw.length) {
      setImportErrors(['Le fichier est vide.']);
      setIsImportModalOpen(true);
      return;
    }

    const errors: string[] = [];
    const parsedRows: ImportRow[] = [];
    const anomalies: ImportAnomalyRow[] = [];
    const rowErrors = new Map<number, string[]>();
    const pushRowError = (line: number, message: string) => {
      errors.push(`Ligne ${line}: ${message}`);
      rowErrors.set(line, [...(rowErrors.get(line) ?? []), message]);
    };
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

      if (!designation) pushRowError(line, 'designation obligatoire.');
      if (nature !== 'medicament' && nature !== 'para') pushRowError(line, 'nature invalide (medicament|para).');
      if (nature === 'medicament' && !pctCode) pushRowError(line, 'pct_code obligatoire pour médicament.');
      if (!Number.isFinite(price) || price < 0) pushRowError(line, 'purchase_unit_price_ht invalide.');
      if (!vatRate) pushRowError(line, `vat_rate_label introuvable (${vatRateLabel}).`);
      if (!laboratory) pushRowError(line, `laboratory_designation introuvable (${laboratoryDesignation}).`);

      const lineErrors = rowErrors.get(line) ?? [];
      if (!lineErrors.length) {
        parsedRows.push({ row_number: line, designation, nature: nature as ProductNature, pct_code: pctCode, barcode, purchase_unit_price_ht: price, vat_rate_id: vatRate!.id, vat_rate_label: vatRate!.label, laboratory_id: laboratory!.id, laboratory_designation: laboratory!.designation });
      } else {
        anomalies.push({ row_number: line, designation, nature, pct_code: pctCode, barcode, purchase_unit_price_ht: String(row.purchase_unit_price_ht || ''), vat_rate_label: vatRateLabel, laboratory_designation: laboratoryDesignation, errors: lineErrors });
      }
    });

    const seenPct = new Map<string, number>();
    const seenBarcode = new Map<string, number>();
    parsedRows.forEach((row, idx) => {
      const line = idx + 2;
      if (row.pct_code) {
        const pct = row.pct_code.toLowerCase();
        if (seenPct.has(pct)) {
          pushRowError(line, `pct_code en doublon dans le fichier (déjà vu ligne ${seenPct.get(pct)}).`);
        } else {
          seenPct.set(pct, line);
        }
      }
      if (row.barcode) {
        const barcode = row.barcode.toLowerCase();
        if (seenBarcode.has(barcode)) {
          pushRowError(line, `barcode en doublon dans le fichier (déjà vu ligne ${seenBarcode.get(barcode)}).`);
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
        pushRowError(line, 'pct_code déjà existant dans le catalogue.');
      }
      if (row.barcode && existingBarcode.has(row.barcode.toLowerCase())) {
        pushRowError(line, 'barcode déjà existant dans le catalogue.');
      }
    });

    const validRows = parsedRows.filter((row) => !rowErrors.has(row.row_number));
    const duplicateAnomalies = parsedRows
      .filter((row) => rowErrors.has(row.row_number))
      .map((row) => ({
        row_number: row.row_number,
        designation: row.designation,
        nature: row.nature,
        pct_code: row.pct_code,
        barcode: row.barcode,
        purchase_unit_price_ht: String(row.purchase_unit_price_ht),
        vat_rate_label: row.vat_rate_label,
        laboratory_designation: row.laboratory_designation,
        errors: rowErrors.get(row.row_number) ?? [],
      }));

    setImportErrors(errors);
    setImportRows(validRows);
    setAnomalyRows([...anomalies, ...duplicateAnomalies].sort((a, b) => a.row_number - b.row_number));
    setActiveImportTab((anomalies.length + duplicateAnomalies.length) ? 'anomalies' : 'entries');
    setIsImportModalOpen(true);
    event.target.value = '';
  };

  const revalidateAnomalyRow = (row: ImportAnomalyRow) => {
    const errs: string[] = [];
    const nature = row.nature.trim().toLowerCase();
    const pctCode = row.pct_code.trim();
    const barcode = row.barcode.trim();
    const vatRate = vatRates.find((v) => v.label.toLowerCase() === row.vat_rate_label.trim().toLowerCase());
    const laboratory = laboratories.find((l) => l.designation.toLowerCase() === row.laboratory_designation.trim().toLowerCase());
    const price = Number(row.purchase_unit_price_ht);
    if (!row.designation.trim()) errs.push('designation obligatoire');
    if (nature !== 'medicament' && nature !== 'para') errs.push('nature invalide');
    if (nature === 'medicament' && !pctCode) errs.push('pct_code obligatoire');
    if (!Number.isFinite(price) || price < 0) errs.push('purchase_unit_price_ht invalide');
    if (!vatRate) errs.push('vat_rate_label introuvable');
    if (!laboratory) errs.push('laboratory_designation introuvable');
    if (pctCode && products.some((p) => (p.pct_code || '').toLowerCase() === pctCode.toLowerCase())) errs.push('pct_code déjà existant');
    if (barcode && products.some((p) => p.barcode.toLowerCase() === barcode.toLowerCase())) errs.push('barcode déjà existant');
    if (errs.length) return { ...row, errors: errs };
    const valid: ImportRow = { row_number: row.row_number, designation: row.designation.trim(), nature: nature as ProductNature, pct_code: pctCode, barcode, purchase_unit_price_ht: price, vat_rate_id: vatRate!.id, vat_rate_label: vatRate!.label, laboratory_id: laboratory!.id, laboratory_designation: laboratory!.designation };
    setImportRows((current) => [...current, valid].sort((a, b) => a.row_number - b.row_number));
    setAnomalyRows((current) => {
      const next = current.filter((a) => a.row_number !== row.row_number);
      if (!next.length) setImportErrors([]);
      return next;
    });
    return null;
  };
  const setAnomalyField = (rowNumber: number, field: EditableAnomalyField, value: string) => {
    setAnomalyRows((current) => current.map((r) => r.row_number === rowNumber ? { ...r, [field]: value } : r));
  };

  const handleConfirmImport = async () => {
    if (!importRows.length || anomalyRows.length > 0) return;
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


  const deleteOneProduct = async (product: ManagedProduct) => {
    if (!window.confirm(`Supprimer le produit "${product.designation}" ?`)) return;
    try {
      await deleteManagedProduct(product.id);
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setFeedback('Produit supprimé.');
    } catch (error) {
      setFeedback(getFriendlyProductError(error));
    }
  };

  const deleteSelectedProducts = async () => {
    if (!selectedProductIds.length) return;
    if (!window.confirm(`Supprimer ${selectedProductIds.length} produit(s) sélectionné(s) ?`)) return;

    const selectedProducts = products.filter((item) => selectedProductIds.includes(item.id));
    const deletedIds: string[] = [];
    const deletionErrors: string[] = [];

    await Promise.all(selectedProducts.map(async (product) => {
      try {
        await deleteManagedProduct(product.id);
        deletedIds.push(product.id);
      } catch (error) {
        deletionErrors.push(`${product.designation}: ${getFriendlyProductError(error)}`);
      }
    }));

    if (deletedIds.length) {
      setProducts((current) => current.filter((item) => !deletedIds.includes(item.id)));
      setFeedback(`${deletedIds.length} produit(s) supprimé(s).`);
    }

    if (deletionErrors.length) {
      showErrorToast('Erreurs de suppression', deletionErrors);
      if (!deletedIds.length) setFeedback('Aucun produit supprimé.');
    }

    setSelectedProductIds((current) => current.filter((id) => !deletedIds.includes(id)));
  };
  const toggleArchive = async (product: ManagedProduct) => {
    try {
      const updated = await setManagedProductArchived(product.id, product.is_active);
      setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setFeedback(updated.is_active ? 'Produit réactivé.' : 'Produit archivé.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Archivage impossible.'); }
  };

  return <div className="grid" data-selected-count={selectedProductIds.length}>{/* shortened intentionally */}
    <Card><h1>Produits</h1><p>Tableau des produits avec actions d’archivage et d’édition.</p>{feedback && <p style={{ marginTop: 12 }}>{feedback}</p>}</Card>
    <Card style={{ minHeight: "72vh", display: "flex", flexDirection: "column" }}>
      <div className="toolbar"><h2>Index</h2><div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" onClick={handleDownloadTemplate}>Télécharger le modèle Excel</Button><Button variant="secondary" onClick={() => fileInputRef.current?.click()}>Importer</Button><Button variant="secondary" disabled={!selectedProductIds.length} onClick={() => void deleteSelectedProducts()}>Supprimer la sélection ({selectedProductIds.length})</Button><Button onClick={openCreateModal}>+ Ajouter un produit</Button></div></div>
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={(e) => void parseImportFile(e)} style={{ display: 'none' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12, marginTop: 12 }}>
        <Input placeholder="Rechercher par désignation, code PCT ou code à barre" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} />
        <Select value={laboratoryFilter} onChange={(e) => { setLaboratoryFilter(e.target.value); setPage(1); }}><option value="all">Tous les laboratoires</option>{laboratories.map((l) => <option key={l.id} value={l.id}>{l.designation}</option>)}</Select>
      </div>
      {isLoading && <p>Chargement...</p>}
      {!isLoading && paginatedProducts.length === 0 && <p>Aucun produit trouvé.</p>}
      {!isLoading && paginatedProducts.length > 0 && <div style={{ overflow: 'auto', width: '100%', marginTop: 12, flex: 1 }}>
        <Table>
          <TableHead><TableRow><TableHeaderCell style={{ width: 32 }}><input type="checkbox" checked={paginatedProducts.length > 0 && paginatedProducts.every((p) => selectedProductIds.includes(p.id))} onChange={(e) => {
            setSelectedProductIds((current) => {
              if (e.target.checked) return Array.from(new Set([...current, ...paginatedProducts.map((p) => p.id)]));
              return current.filter((id) => !paginatedProducts.some((p) => p.id === id));
            });
          }} /></TableHeaderCell><TableHeaderCell>Désignation</TableHeaderCell><TableHeaderCell>Nature</TableHeaderCell><TableHeaderCell>PCT</TableHeaderCell><TableHeaderCell>Code barre</TableHeaderCell><TableHeaderCell>PUA HT</TableHeaderCell><TableHeaderCell>TVA</TableHeaderCell><TableHeaderCell>Laboratoire</TableHeaderCell><TableHeaderCell>Statut</TableHeaderCell><TableHeaderCell /></TableRow></TableHead>
          <TableBody>
            {paginatedProducts.map((p) => <TableRow key={p.id}><TableCell><input type="checkbox" checked={selectedProductIds.includes(p.id)} onChange={(e) => setSelectedProductIds((current) => e.target.checked ? [...current, p.id] : current.filter((id) => id !== p.id))} /></TableCell><TableCell>{p.designation}</TableCell><TableCell>{p.nature}</TableCell><TableCell>{p.pct_code || '-'}</TableCell><TableCell>{p.barcode}</TableCell><TableCell>{p.purchase_unit_price_ht}</TableCell><TableCell>{p.vat_rate?.label || '-'}</TableCell><TableCell>{p.laboratory?.designation || '-'}</TableCell><TableCell>{p.is_active ? 'Actif' : 'Archivé'}</TableCell><TableCell><ActionDropdown actions={[{ label: 'Modifier', onClick: () => openEditModal(p) }, { label: p.is_active ? 'Archiver' : 'Réactiver', onClick: () => void toggleArchive(p) }, { label: 'Supprimer', onClick: () => void deleteOneProduct(p) }]} /></TableCell></TableRow>)}
          </TableBody>
        </Table>
      </div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
        <p>Page {page} / {totalPages}</p>
        <div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button><Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</Button></div>
      </div>
    </Card>
    {isImportModalOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 45 }}><Card style={{ width: 'min(1200px, 96vw)', maxHeight: '88vh', overflow: 'auto' }}><div className="toolbar"><h2>Prévisualisation de l’import</h2><Button variant="ghost" onClick={() => setIsImportModalOpen(false)}>Fermer</Button></div><div style={{ display: 'flex', gap: 8, marginTop: 8 }}><Button variant="secondary" style={{ background: activeImportTab === 'entries' ? '#0f172a' : undefined, color: activeImportTab === 'entries' ? '#fff' : undefined }} onClick={() => setActiveImportTab('entries')}>Liste des entrées ({importRows.length})</Button><Button variant="secondary" style={{ background: activeImportTab === 'anomalies' ? '#0f172a' : undefined, color: activeImportTab === 'anomalies' ? '#fff' : undefined }} onClick={() => setActiveImportTab('anomalies')}>Anomalies ({anomalyRows.length})</Button></div>{activeImportTab === 'entries' && <div style={{ overflow: 'auto', marginTop: 12 }}><Table><TableHead><TableRow><TableHeaderCell>Ligne</TableHeaderCell><TableHeaderCell>Désignation</TableHeaderCell><TableHeaderCell>Nature</TableHeaderCell><TableHeaderCell>PCT</TableHeaderCell><TableHeaderCell>Code barre</TableHeaderCell><TableHeaderCell>PUA HT</TableHeaderCell><TableHeaderCell>TVA</TableHeaderCell><TableHeaderCell>Laboratoire</TableHeaderCell></TableRow></TableHead><TableBody>{importRows.map((row) => <TableRow key={`valid-${row.row_number}`}><TableCell>{row.row_number}</TableCell><TableCell>{row.designation}</TableCell><TableCell>{row.nature}</TableCell><TableCell>{row.pct_code || '-'}</TableCell><TableCell>{row.barcode || '(auto)'}</TableCell><TableCell>{row.purchase_unit_price_ht}</TableCell><TableCell>{row.vat_rate_label}</TableCell><TableCell>{row.laboratory_designation}</TableCell></TableRow>)}</TableBody></Table></div>}{activeImportTab === 'anomalies' && <div style={{ overflow: 'auto', marginTop: 12 }}><Table><TableHead><TableRow><TableHeaderCell>Ligne</TableHeaderCell><TableHeaderCell>Désignation</TableHeaderCell><TableHeaderCell>Nature</TableHeaderCell><TableHeaderCell>PCT</TableHeaderCell><TableHeaderCell>Code barre</TableHeaderCell><TableHeaderCell>PUA HT</TableHeaderCell><TableHeaderCell>TVA</TableHeaderCell><TableHeaderCell>Laboratoire</TableHeaderCell><TableHeaderCell>Erreurs</TableHeaderCell><TableHeaderCell /></TableRow></TableHead><TableBody>{anomalyRows.map((row) => <TableRow key={`anomaly-${row.row_number}`}><TableCell>{row.row_number}</TableCell>{(['designation', 'nature', 'pct_code', 'barcode', 'purchase_unit_price_ht', 'vat_rate_label', 'laboratory_designation'] as EditableAnomalyField[]).map((field) => <TableCell key={`${row.row_number}-${field}`}>{editingCell?.row === row.row_number && editingCell.field === field ? <Input autoFocus value={String(row[field])} onBlur={() => setEditingCell(null)} onChange={(e) => setAnomalyField(row.row_number, field, e.target.value)} /> : <button type="button" onClick={() => setEditingCell({ row: row.row_number, field })} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>{String(row[field]) || '-'}</button>}</TableCell>)}<TableCell><ul style={{ margin: 0, paddingLeft: 18, color: '#b42318' }}>{row.errors.map((err) => <li key={`${row.row_number}-${err}`}>{err}</li>)}</ul></TableCell><TableCell><Button variant="secondary" onClick={() => { const updated = revalidateAnomalyRow(row); if (updated) setAnomalyRows((c) => c.map((r) => r.row_number === row.row_number ? updated : r)); }}>Vérifier</Button></TableCell></TableRow>)}</TableBody></Table></div>}<div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button variant="secondary" onClick={() => setIsImportModalOpen(false)}>Annuler</Button><Button onClick={() => void handleConfirmImport()} disabled={isImporting || importRows.length === 0 || anomalyRows.length > 0}>{isImporting ? 'Import en cours...' : 'Valider et créer'}</Button></div></Card></div>}
    <div style={{ position: 'fixed', top: 20, right: 20, display: 'grid', gap: 10, zIndex: 60 }}>{toasts.map((toast) => <Card key={toast.id} style={{ width: 360, border: '1px solid #fda29b', background: '#fef3f2' }}><strong style={{ color: '#b42318' }}>{toast.title}</strong><ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#b42318' }}>{toast.lines.map((line) => <li key={`${toast.id}-${line}`}>{line}</li>)}</ul></Card>)}</div>
    {isModalOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 40 }}><Card><div className="toolbar"><h2>{editingId ? 'Modifier le produit' : 'Ajouter un produit'}</h2><Button variant="ghost" onClick={() => setIsModalOpen(false)}>Fermer</Button></div><form className="grid" onSubmit={handleSubmit}><Input placeholder="Désignation" value={form.designation} onChange={(e) => setForm((c) => ({ ...c, designation: e.target.value }))} required /><Select value={form.nature} onChange={(e) => setForm((c) => ({ ...c, nature: e.target.value as ProductNature }))}><option value="medicament">Médicament</option><option value="para">Para</option></Select><Input placeholder="Code PCT (obligatoire pour médicament)" value={form.pct_code} onChange={(e) => setForm((c) => ({ ...c, pct_code: e.target.value }))} /><Input placeholder="Code barre (vide = PCT ou génération auto)" value={form.barcode} onChange={(e) => setForm((c) => ({ ...c, barcode: e.target.value }))} /><Input type="number" min="0" step="0.001" placeholder="PUA HT" value={form.purchase_unit_price_ht} onChange={(e) => setForm((c) => ({ ...c, purchase_unit_price_ht: e.target.value }))} required /><Select value={form.vat_rate_id} onChange={(e) => setForm((c) => ({ ...c, vat_rate_id: e.target.value }))} required><option value="" disabled>Sélectionner un taux TVA</option>{vatRates.map((r) => <option key={r.id} value={r.id}>{r.label} ({r.rate}%)</option>)}</Select><Select value={form.laboratory_id} onChange={(e) => setForm((c) => ({ ...c, laboratory_id: e.target.value }))} required><option value="" disabled>Sélectionner un laboratoire</option>{laboratories.map((l) => <option key={l.id} value={l.id}>{l.designation}</option>)}</Select>{fieldError && <p style={{ color: '#b42318' }}>{fieldError}</p>}<Button type="submit" disabled={isSaving}>{actionLabel}</Button></form></Card></div>}
  </div>;
};
