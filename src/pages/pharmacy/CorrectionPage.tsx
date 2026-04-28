import { useMemo, useState } from 'react';
import type { DeliveryNoteLineInput } from '@/types/domain';

const EMPTY_LINE: DeliveryNoteLineInput = {
  product_code: '',
  designation: '',
  quantity: 1,
  p_phar: 0,
  subtotal: 0,
};

export const CorrectionPage = () => {
  const [lines, setLines] = useState<DeliveryNoteLineInput[]>([EMPTY_LINE]);

  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (index: number) => setLines((prev) => prev.filter((_, i) => i !== index));

  const updateLine = (index: number, key: keyof DeliveryNoteLineInput, value: string) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = {
          ...line,
          [key]: key === 'quantity' || key === 'p_phar' ? Number(value || 0) : value,
        } as DeliveryNoteLineInput;
        return { ...next, subtotal: Number((next.quantity * next.p_phar).toFixed(2)) };
      }),
    );
  };

  const totalLines = useMemo(
    () => lines.reduce((acc, line) => acc + line.subtotal, 0),
    [lines],
  );

  return (
    <div className="grid">
      <section className="card">
        <h1>Correction post-OCR</h1>
        <p>ST calculé automatiquement: quantité × P.Phar.</p>
      </section>

      <section className="card">
        <div className="toolbar">
          <h2>Lignes produits</h2>
          <button className="btn secondary" onClick={addLine}>Ajouter ligne</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Code</th><th>Désignation</th><th>Qté</th><th>P.Phar</th><th>ST</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td><input className="input" value={line.product_code} onChange={(e) => updateLine(index, 'product_code', e.target.value)} /></td>
                <td><input className="input" value={line.designation} onChange={(e) => updateLine(index, 'designation', e.target.value)} /></td>
                <td><input className="input" type="number" value={line.quantity} onChange={(e) => updateLine(index, 'quantity', e.target.value)} /></td>
                <td><input className="input" type="number" value={line.p_phar} onChange={(e) => updateLine(index, 'p_phar', e.target.value)} /></td>
                <td>{line.subtotal.toFixed(2)}</td>
                <td><button className="btn" onClick={() => removeLine(index)}>Supprimer</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p><b>Total HT lignes:</b> {totalLines.toFixed(2)}</p>
        <div className="actions">
          <button className="btn secondary">Enregistrer brouillon</button>
          <button className="btn">Soumettre le BL</button>
        </div>
      </section>
    </div>
  );
};
