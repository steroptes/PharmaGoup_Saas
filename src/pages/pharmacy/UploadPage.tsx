import { useState, type ChangeEvent } from 'react';
import { extractDeliveryNoteFromFile } from '@/services/ocr/tesseractExtractor';
import type { ExtractedDeliveryNote } from '@/types/domain';

export const UploadPage = () => {
  const [result, setResult] = useState<ExtractedDeliveryNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowed.includes(file.type)) {
      setError('Formats supportés: PDF, JPG, JPEG, PNG');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const extracted = await extractDeliveryNoteFromFile(file);
      setResult(extracted);
    } catch {
      setError('Échec OCR. Vérifiez le fichier ou réessayez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid">
      <section className="card">
        <h1>Téléverser un BL</h1>
        <p>OCR d'aide uniquement. Corrigez toujours avant soumission.</p>
        <input className="input" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={onFileChange} />
      </section>

      {loading && <section className="alert">Extraction OCR en cours…</section>}
      {error && <section className="alert">{error}</section>}

      {result && (
        <section className="card">
          <h2>Résultat OCR brut</h2>
          <p>Confiance: {result.confidence?.toFixed(2) ?? 'N/A'}%</p>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </section>
      )}
    </div>
  );
};
