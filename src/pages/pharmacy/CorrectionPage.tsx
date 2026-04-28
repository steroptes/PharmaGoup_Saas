import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  fetchCampaignsForPharmacy,
  fetchSuppliers,
  submitDeliveryNote,
  type CampaignOption,
  type SupplierOption,
} from '@/services/deliveryNotes';
import type { DeliveryNoteLineInput, ExtractedDeliveryNote } from '@/types/domain';

const EMPTY_LINE: DeliveryNoteLineInput = {
  product_code: '',
  designation: '',
  quantity: 1,
  p_phar: 0,
  subtotal: 0,
};

const buildDefaultHeader = (extracted?: ExtractedDeliveryNote | null): ExtractedDeliveryNote => ({
  supplierName: extracted?.supplierName,
  blNumber: extracted?.blNumber,
  blDate: extracted?.blDate,
  totalHT: extracted?.totalHT,
  totalTVA: extracted?.totalTVA,
  totalTTC: extracted?.totalTTC,
  confidence: extracted?.confidence,
  lines: extracted?.lines ?? [],
  rawText: extracted?.rawText,
});

export const CorrectionPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, profile } = useAuth();

  const locationState = location.state as { extracted?: ExtractedDeliveryNote; file?: File } | null;

  const [file, setFile] = useState<File | null>(locationState?.file ?? null);
  const [header, setHeader] = useState<ExtractedDeliveryNote>(buildDefaultHeader(locationState?.extracted));
  const [lines, setLines] = useState<DeliveryNoteLineInput[]>(
    locationState?.extracted?.lines?.length ? locationState.extracted.lines : [{ ...EMPTY_LINE }],
  );
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    void fetchSuppliers()
      .then((items) => {
        setSuppliers(items);
        if (!header.supplierName) return;
        const matched = items.find((supplier) =>
          supplier.name.toLowerCase().includes(header.supplierName?.toLowerCase() ?? ''),
        );
        if (matched) {
          setSelectedSupplierId(matched.id);
        }
      })
      .catch((err) => {
        setFeedback(err instanceof Error ? err.message : 'Impossible de charger les fournisseurs');
      });
  }, []);

  useEffect(() => {
    if (!profile?.pharmacy_id || !selectedSupplierId) {
      setCampaigns([]);
      setSelectedCampaignId('');
      return;
    }

    void fetchCampaignsForPharmacy(profile.pharmacy_id, selectedSupplierId)
      .then((items) => {
        setCampaigns(items);
        if (items.length === 1) {
          setSelectedCampaignId(items[0].id);
        }
      })
      .catch((err) => {
        setFeedback(err instanceof Error ? err.message : 'Impossible de charger les campagnes');
      });
  }, [profile?.pharmacy_id, selectedSupplierId]);

  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);

  const removeLine = (index: number) => {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateLine = (index: number, key: keyof DeliveryNoteLineInput, value: string) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = {
          ...line,
          [key]: key === 'quantity' || key === 'p_phar' || key === 'p_pub' ? Number(value || 0) : value,
        } as DeliveryNoteLineInput;
        return { ...next, subtotal: Number((next.quantity * next.p_phar).toFixed(2)) };
      }),
    );
  };

  const totalLines = useMemo(() => lines.reduce((acc, line) => acc + line.subtotal, 0), [lines]);

  const submit = async () => {
    if (!session?.user?.id || !profile?.pharmacy_id) {
      setFeedback('Session invalide. Reconnectez-vous.');
      return;
    }

    if (!selectedSupplierId || !selectedCampaignId) {
      setFeedback('Sélectionnez le fournisseur et la campagne avant validation.');
      return;
    }

    if (!file) {
      setFeedback('Fichier BL absent. Reprenez depuis la page de téléversement.');
      return;
    }

    const validLines = lines.filter((line) => line.product_code && line.designation && line.quantity > 0 && line.p_phar > 0);

    if (!validLines.length) {
      setFeedback('Ajoutez au moins une ligne produit valide avant soumission.');
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const deliveryNoteId = await submitDeliveryNote({
        uploadedBy: session.user.id,
        pharmacyId: profile.pharmacy_id,
        supplierId: selectedSupplierId,
        campaignId: selectedCampaignId,
        file,
        note: {
          ...header,
          totalHT: header.totalHT ?? totalLines,
          lines: validLines,
        },
        lines: validLines,
      });

      setFeedback(`BL ${deliveryNoteId} enregistré avec succès et soumis pour validation.`);
      setTimeout(() => navigate('/pharmacy/upload'), 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec de soumission du BL';
      setFeedback(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid">
      <section className="card">
        <h1>Correction post-OCR</h1>
        <p>Corrigez l'entête et les lignes détectées, puis validez l'enregistrement en base.</p>
      </section>

      {feedback && <section className="alert">{feedback}</section>}

      <section className="card grid">
        <h2>Entête BL</h2>
        <div className="grid-2">
          <label>
            N° BL
            <input
              className="input"
              value={header.blNumber ?? ''}
              onChange={(e) => setHeader((prev) => ({ ...prev, blNumber: e.target.value }))}
            />
          </label>

          <label>
            Date BL
            <input
              className="input"
              type="date"
              value={header.blDate ?? ''}
              onChange={(e) => setHeader((prev) => ({ ...prev, blDate: e.target.value }))}
            />
          </label>

          <label>
            Fournisseur OCR
            <input
              className="input"
              value={header.supplierName ?? ''}
              onChange={(e) => setHeader((prev) => ({ ...prev, supplierName: e.target.value }))}
            />
          </label>

          <label>
            Fournisseur (base)
            <select
              className="select"
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
            >
              <option value="">Choisir un fournisseur</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </label>

          <label>
            Campagne ouverte
            <select
              className="select"
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
            >
              <option value="">Choisir une campagne</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
              ))}
            </select>
          </label>

          <label>
            Total HT
            <input
              className="input"
              type="number"
              value={header.totalHT ?? 0}
              onChange={(e) => setHeader((prev) => ({ ...prev, totalHT: Number(e.target.value || 0) }))}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <div className="toolbar">
          <h2>Lignes produits</h2>
          <button className="btn secondary" onClick={addLine}>Ajouter ligne</button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Désignation</th>
              <th>Qté</th>
              <th>P.Phar</th>
              <th>ST</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td><input className="input" value={line.product_code} onChange={(e) => updateLine(index, 'product_code', e.target.value)} /></td>
                <td><input className="input" value={line.designation} onChange={(e) => updateLine(index, 'designation', e.target.value)} /></td>
                <td><input className="input" type="number" min="0" step="0.01" value={line.quantity} onChange={(e) => updateLine(index, 'quantity', e.target.value)} /></td>
                <td><input className="input" type="number" min="0" step="0.01" value={line.p_phar} onChange={(e) => updateLine(index, 'p_phar', e.target.value)} /></td>
                <td>{line.subtotal.toFixed(2)}</td>
                <td><button className="btn" onClick={() => removeLine(index)}>Supprimer</button></td>
              </tr>
            ))}
          </tbody>
        </table>

        <p><b>Total HT lignes:</b> {totalLines.toFixed(2)}</p>
        <div className="actions">
          <button className="btn secondary" onClick={() => navigate('/pharmacy/upload')}>Revenir au téléversement</button>
          <button className="btn" onClick={submit} disabled={saving}>{saving ? 'Enregistrement...' : 'Valider et enregistrer le BL'}</button>
        </div>
      </section>
    </div>
  );
};
