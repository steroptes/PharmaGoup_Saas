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

const EMPTY_FORM = {
  designation: '',
  tax_identifier: '',
  address: '',
  mobile_phone: '',
  landline_phone: '',
};

export const LaboratoriesPage = () => {
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const actionLabel = useMemo(() => (editingId ? 'Mettre à jour' : 'Créer la fiche'), [editingId]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await listLaboratories();
        setLaboratories(data);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Impossible de charger les laboratoires.');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.designation.trim()) {
      setFeedback('La désignation est obligatoire.');
      return;
    }

    setIsSaving(true);
    setFeedback(null);

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
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Action impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (laboratory: Laboratory) => {
    setEditingId(laboratory.id);
    setForm({
      designation: laboratory.designation ?? '',
      tax_identifier: laboratory.tax_identifier ?? '',
      address: laboratory.address ?? '',
      mobile_phone: laboratory.mobile_phone ?? '',
      landline_phone: laboratory.landline_phone ?? '',
    });
  };

  const handleDelete = async (id: string) => {
    setFeedback(null);
    try {
      await deleteLaboratory(id);
      setLaboratories((current) => current.filter((item) => item.id !== id));
      if (editingId === id) resetForm();
      setFeedback('Fiche laboratoire supprimée.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Suppression impossible.');
    }
  };

  return (
    <div className="grid">
      <Card>
        <h1>Laboratoires</h1>
        <p>Créer et gérer les fiches laboratoires (désignation, MF, adresse, téléphones).</p>
      </Card>

      <Card>
        <h2>{editingId ? 'Modifier un laboratoire' : 'Créer un laboratoire'}</h2>
        <form className="grid" onSubmit={handleSubmit}>
          <Input
            placeholder="Désignation"
            value={form.designation}
            onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))}
            required
          />
          <Input
            placeholder="Matricule fiscal"
            value={form.tax_identifier}
            onChange={(event) => setForm((current) => ({ ...current, tax_identifier: event.target.value }))}
          />
          <Input
            placeholder="Adresse"
            value={form.address}
            onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
          />
          <Input
            placeholder="Téléphone mobile"
            value={form.mobile_phone}
            onChange={(event) => setForm((current) => ({ ...current, mobile_phone: event.target.value }))}
          />
          <Input
            placeholder="Téléphone fixe"
            value={form.landline_phone}
            onChange={(event) => setForm((current) => ({ ...current, landline_phone: event.target.value }))}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" disabled={isSaving}>{actionLabel}</Button>
            {editingId && (
              <Button variant="ghost" type="button" onClick={resetForm}>Annuler</Button>
            )}
          </div>
        </form>
        {feedback && <p>{feedback}</p>}
      </Card>

      <Card>
        <h2>Fiches existantes</h2>
        {isLoading && <p>Chargement...</p>}
        {!isLoading && laboratories.length === 0 && <p>Aucun laboratoire enregistré.</p>}
        <div className="grid">
          {laboratories.map((laboratory) => (
            <Card key={laboratory.id}>
              <h3>{laboratory.designation}</h3>
              <p>MF: {laboratory.tax_identifier || '-'}</p>
              <p>Adresse: {laboratory.address || '-'}</p>
              <p>Mobile: {laboratory.mobile_phone || '-'}</p>
              <p>Fixe: {laboratory.landline_phone || '-'}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" type="button" onClick={() => startEdit(laboratory)}>Modifier</Button>
                <Button variant="danger" type="button" onClick={() => void handleDelete(laboratory.id)}>Supprimer</Button>
              </div>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );
};
