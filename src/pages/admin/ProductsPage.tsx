import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { listLaboratories, Laboratory } from '@/services/laboratories';
import {
  createManagedProduct,
  deleteManagedProduct,
  listManagedProducts,
  listVatRates,
  ManagedProduct,
  ProductNature,
  updateManagedProduct,
  VatRate,
} from '@/services/products';

const EMPTY_FORM = {
  designation: '',
  nature: 'medicament' as ProductNature,
  pct_code: '',
  barcode: '',
  purchase_unit_price_ht: '',
  vat_rate_id: '',
  laboratory_id: '',
};

export const ProductsPage = () => {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [vatRates, setVatRates] = useState<VatRate[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const actionLabel = useMemo(() => (editingId ? 'Mettre à jour' : 'Créer la fiche'), [editingId]);

  useEffect(() => {
    const load = async () => {
      try {
        const [productsData, laboratoriesData, vatRatesData] = await Promise.all([
          listManagedProducts(),
          listLaboratories(),
          listVatRates(),
        ]);
        setProducts(productsData);
        setLaboratories(laboratoriesData);
        setVatRates(vatRatesData);

        setForm((current) => ({
          ...current,
          vat_rate_id: current.vat_rate_id || vatRatesData[0]?.id || '',
          laboratory_id: current.laboratory_id || laboratoriesData[0]?.id || '',
        }));
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Impossible de charger les produits.');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const resetForm = () => {
    setForm({
      ...EMPTY_FORM,
      vat_rate_id: vatRates[0]?.id || '',
      laboratory_id: laboratories[0]?.id || '',
    });
    setEditingId(null);
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
    if (validationError) {
      setFeedback(validationError);
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const payload = {
        designation: form.designation,
        nature: form.nature,
        pct_code: form.pct_code,
        barcode: form.barcode,
        purchase_unit_price_ht: Number(form.purchase_unit_price_ht),
        vat_rate_id: form.vat_rate_id,
        laboratory_id: form.laboratory_id,
      };

      if (editingId) {
        const updated = await updateManagedProduct(editingId, payload);
        setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setFeedback('Fiche produit mise à jour.');
      } else {
        const created = await createManagedProduct(payload);
        setProducts((current) => [...current, created].sort((a, b) => a.designation.localeCompare(b.designation)));
        setFeedback('Fiche produit créée.');
      }
      resetForm();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Action impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (product: ManagedProduct) => {
    setEditingId(product.id);
    setForm({
      designation: product.designation,
      nature: product.nature,
      pct_code: product.pct_code ?? '',
      barcode: product.barcode,
      purchase_unit_price_ht: String(product.purchase_unit_price_ht),
      vat_rate_id: product.vat_rate_id,
      laboratory_id: product.laboratory_id,
    });
  };

  return (
    <div className="grid">
      <Card>
        <h1>Produits</h1>
        <p>Créer une fiche produit avec nature, codification, PUA HT, TVA et laboratoire.</p>
      </Card>

      <Card>
        <h2>{editingId ? 'Modifier un produit' : 'Créer un produit'}</h2>
        <form className="grid" onSubmit={handleSubmit}>
          <Input placeholder="Désignation" value={form.designation} onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))} required />
          <Select value={form.nature} onChange={(event) => setForm((current) => ({ ...current, nature: event.target.value as ProductNature }))}>
            <option value="medicament">Médicament</option>
            <option value="para">Para</option>
          </Select>
          <Input placeholder="Code PCT (obligatoire pour médicament)" value={form.pct_code} onChange={(event) => setForm((current) => ({ ...current, pct_code: event.target.value }))} />
          <Input placeholder="Code barre (vide = PCT ou génération auto)" value={form.barcode} onChange={(event) => setForm((current) => ({ ...current, barcode: event.target.value }))} />
          <Input type="number" min="0" step="0.001" placeholder="PUA HT" value={form.purchase_unit_price_ht} onChange={(event) => setForm((current) => ({ ...current, purchase_unit_price_ht: event.target.value }))} required />

          <Select value={form.vat_rate_id} onChange={(event) => setForm((current) => ({ ...current, vat_rate_id: event.target.value }))} required>
            <option value="" disabled>Sélectionner un taux TVA</option>
            {vatRates.map((rate) => (
              <option key={rate.id} value={rate.id}>{rate.label} ({rate.rate}%)</option>
            ))}
          </Select>

          <Select value={form.laboratory_id} onChange={(event) => setForm((current) => ({ ...current, laboratory_id: event.target.value }))} required>
            <option value="" disabled>Sélectionner un laboratoire</option>
            {laboratories.map((laboratory) => (
              <option key={laboratory.id} value={laboratory.id}>{laboratory.designation}</option>
            ))}
          </Select>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" disabled={isSaving}>{actionLabel}</Button>
            {editingId && <Button variant="ghost" type="button" onClick={resetForm}>Annuler</Button>}
          </div>
        </form>
        {feedback && <p>{feedback}</p>}
      </Card>

      <Card>
        <h2>Fiches existantes</h2>
        {isLoading && <p>Chargement...</p>}
        {!isLoading && products.length === 0 && <p>Aucun produit enregistré.</p>}
        <div className="grid">
          {products.map((product) => (
            <Card key={product.id}>
              <h3>{product.designation}</h3>
              <p>Nature: {product.nature}</p>
              <p>PCT: {product.pct_code || '-'}</p>
              <p>Code barre: {product.barcode}</p>
              <p>PUA HT: {product.purchase_unit_price_ht}</p>
              <p>TVA: {product.vat_rate?.label || '-'}</p>
              <p>Laboratoire: {product.laboratory?.designation || '-'}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" type="button" onClick={() => startEdit(product)}>Modifier</Button>
                <Button variant="danger" type="button" onClick={() => void deleteManagedProduct(product.id).then(() => setProducts((current) => current.filter((item) => item.id !== product.id)))}>Supprimer</Button>
              </div>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );
};
