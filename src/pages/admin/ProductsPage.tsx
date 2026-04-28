import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Archive, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
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

const EMPTY_FORM = {
  designation: '', nature: 'medicament' as ProductNature, pct_code: '', barcode: '',
  purchase_unit_price_ht: '', vat_rate_id: '', laboratory_id: '',
};

const getFriendlyProductError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Action impossible.';
  if (message.includes('managed_products_pct_code_ci_unique') || message.includes('managed_products_pct_unique_not_null')) {
    return 'Le code PCT existe déjà. Veuillez saisir un code PCT unique.';
  }
  if (message.includes('managed_products_barcode_ci_unique') || message.includes('managed_products_barcode_key')) {
    return 'Le code à barre existe déjà. Veuillez saisir un code à barre unique.';
  }
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
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesLaboratory = laboratoryFilter === 'all' || product.laboratory_id === laboratoryFilter;
      if (!matchesLaboratory) return false;
      if (!normalizedQuery) return true;
      return [product.designation, product.pct_code || '', product.barcode].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [products, laboratoryFilter, searchQuery]);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, vat_rate_id: vatRates[0]?.id || '', laboratory_id: laboratories[0]?.id || '' });
    setEditingId(null);
    setFieldError(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (product: ManagedProduct) => {
    setEditingId(product.id);
    setForm({ designation: product.designation, nature: product.nature, pct_code: product.pct_code ?? '', barcode: product.barcode, purchase_unit_price_ht: String(product.purchase_unit_price_ht), vat_rate_id: product.vat_rate_id, laboratory_id: product.laboratory_id });
    setFieldError(null);
    setIsModalOpen(true);
  };

  const validate = () => {
    if (!form.designation.trim()) return 'La désignation est obligatoire.';
    if (!form.vat_rate_id) return 'Le taux de TVA est obligatoire.';
    if (!form.laboratory_id) return 'Le laboratoire est obligatoire.';
    if (!form.purchase_unit_price_ht || Number(form.purchase_unit_price_ht) < 0) return 'Le PUA HT est obligatoire.';
    if (form.nature === 'medicament' && !form.pct_code.trim()) return 'Le code PCT est obligatoire pour un médicament.';
    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) return setFieldError(validationError);

    setIsSaving(true);
    setFieldError(null);
    setFeedback(null);

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
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      setFieldError(getFriendlyProductError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleArchive = async (product: ManagedProduct) => {
    try {
      const updated = await setManagedProductArchived(product.id, product.is_active);
      setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setFeedback(updated.is_active ? 'Produit réactivé.' : 'Produit archivé.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Archivage impossible.');
    }
  };

  return (
    <div className="grid">
      <Card>
        <h1>Produits</h1>
        <p>Tableau des produits avec actions d’archivage et d’édition.</p>
        {feedback && <p style={{ marginTop: 12 }}>{feedback}</p>}
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
          <h2>Catalogue</h2>
          <Button onClick={openCreateModal}>+ Ajouter un produit</Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12, marginTop: 12 }}>
          <Input placeholder="Rechercher par désignation, code PCT ou code à barre" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
          <Select value={laboratoryFilter} onChange={(event) => setLaboratoryFilter(event.target.value)}>
            <option value="all">Tous les laboratoires</option>
            {laboratories.map((laboratory) => <option key={laboratory.id} value={laboratory.id}>{laboratory.designation}</option>)}
          </Select>
        </div>

        {isLoading && <p>Chargement...</p>}
        {!isLoading && filteredProducts.length === 0 && <p>Aucun produit trouvé.</p>}
        {!isLoading && filteredProducts.length > 0 && (
          <div style={{ overflowX: 'auto', width: '100%', marginTop: 12 }}>
            <table style={{ width: '100%', minWidth: '1200px', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Désignation</th><th style={{ textAlign: 'center' }}>Nature</th><th style={{ textAlign: 'center' }}>PCT</th><th style={{ textAlign: 'center' }}>Code barre</th><th style={{ textAlign: 'center' }}>PUA HT</th><th style={{ textAlign: 'center' }}>TVA</th><th style={{ textAlign: 'center' }}>Laboratoire</th><th style={{ textAlign: 'center' }}>Statut</th><th style={{ textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td style={{ textAlign: 'center' }}>{product.designation}</td>
                    <td style={{ textAlign: 'center' }}>{product.nature}</td>
                    <td style={{ textAlign: 'center' }}>{product.pct_code || '-'}</td>
                    <td style={{ textAlign: 'center' }}>{product.barcode}</td>
                    <td style={{ textAlign: 'center' }}>{product.purchase_unit_price_ht}</td>
                    <td style={{ textAlign: 'center' }}>{product.vat_rate?.label || '-'}</td>
                    <td style={{ textAlign: 'center' }}>{product.laboratory?.designation || '-'}</td>
                    <td style={{ textAlign: 'center' }}>{product.is_active ? 'Actif' : 'Archivé'}</td>
                    <td style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <Button variant="secondary" type="button" onClick={() => openEditModal(product)} aria-label="Modifier">
                        <Pencil size={16} />
                      </Button>
                      <Button variant="ghost" type="button" onClick={() => void toggleArchive(product)} aria-label={product.is_active ? 'Archiver' : 'Réactiver'}>
                        <Archive size={16} />
                      </Button>
                      <Button variant="danger" type="button" disabled aria-label="Supprimer (bientôt)">
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 40 }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>{editingId ? 'Modifier le produit' : 'Ajouter un produit'}</h2>
              <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Fermer</Button>
            </div>
            <form className="grid" onSubmit={handleSubmit}>
              <Input placeholder="Désignation" value={form.designation} onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))} required />
              <Select value={form.nature} onChange={(event) => setForm((current) => ({ ...current, nature: event.target.value as ProductNature }))}><option value="medicament">Médicament</option><option value="para">Para</option></Select>
              <Input placeholder="Code PCT (obligatoire pour médicament)" value={form.pct_code} onChange={(event) => setForm((current) => ({ ...current, pct_code: event.target.value }))} />
              <Input placeholder="Code barre (vide = PCT ou génération auto)" value={form.barcode} onChange={(event) => setForm((current) => ({ ...current, barcode: event.target.value }))} />
              <Input type="number" min="0" step="0.001" placeholder="PUA HT" value={form.purchase_unit_price_ht} onChange={(event) => setForm((current) => ({ ...current, purchase_unit_price_ht: event.target.value }))} required />
              <Select value={form.vat_rate_id} onChange={(event) => setForm((current) => ({ ...current, vat_rate_id: event.target.value }))} required>
                <option value="" disabled>Sélectionner un taux TVA</option>{vatRates.map((rate) => <option key={rate.id} value={rate.id}>{rate.label} ({rate.rate}%)</option>)}
              </Select>
              <Select value={form.laboratory_id} onChange={(event) => setForm((current) => ({ ...current, laboratory_id: event.target.value }))} required>
                <option value="" disabled>Sélectionner un laboratoire</option>{laboratories.map((laboratory) => <option key={laboratory.id} value={laboratory.id}>{laboratory.designation}</option>)}
              </Select>
              {fieldError && <p style={{ color: '#b42318' }}>{fieldError}</p>}
              <Button type="submit" disabled={isSaving}>{actionLabel}</Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};
