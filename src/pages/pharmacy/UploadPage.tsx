import { useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { extractDeliveryNoteFromFile } from '@/services/ocr/tesseractExtractor';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ExtractedDeliveryNote } from '@/types/domain';

export const UploadPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const campaignIdFromQuery = searchParams.get('campaignId');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ExtractedDeliveryNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowed.includes(file.type)) {
      setResult(null);
      setError(
        'OCR navigateur: utilisez une image JPG/JPEG/PNG (les PDF doivent être convertis en image avant OCR).',
      );
      return;
    }

    setLoading(true);
    setError(null);
    setUploadedFile(file);

    try {
      const extracted = await extractDeliveryNoteFromFile(file);
      setResult(extracted);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec OCR. Vérifiez le fichier ou réessayez.';
      setError(message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const goToCorrection = () => {
    if (!result || !uploadedFile) return;

    navigate('/pharmacy/correction', {
      state: {
        extracted: result,
        file: uploadedFile,
        campaignId: campaignIdFromQuery,
      },
    });
  };

  return (
    <div className="grid">
      <Card>
        <h1>Téléverser un BL</h1>
        <p>OCR d'aide uniquement. Corrigez toujours avant soumission.</p>
        <p>Formats OCR supportés: JPG, JPEG, PNG (convertir les PDF avant import).</p>
        <Input type="file" accept=".jpg,.jpeg,.png" onChange={onFileChange} />
      </Card>

      {loading && <section className="alert">Extraction OCR en cours…</section>}
      {error && <section className="alert">{error}</section>}

      {result && (
        <Card>
          <h2>Résultat OCR</h2>
          <p>Confiance: {result.confidence?.toFixed(2) ?? 'N/A'}%</p>
          <p>
            Entête détectée: fournisseur <b>{result.supplierName ?? 'N/A'}</b>, BL <b>{result.blNumber ?? 'N/A'}</b>,
            date <b>{result.blDate ?? 'N/A'}</b>.
          </p>
          <p>{result.lines.length} ligne(s) produit détectée(s).</p>
          <div className="actions">
            <Button onClick={goToCorrection}>Corriger et valider les données</Button>
          </div>
          <details>
            <summary>Voir le JSON brut OCR</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </Card>
      )}
    </div>
  );
};
