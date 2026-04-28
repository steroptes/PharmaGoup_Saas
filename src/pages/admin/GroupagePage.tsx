import * as XLSX from 'xlsx';

const exportCsv = () => {
  const rows = [
    ['code_produit', 'designation', 'quantite_totale', 'st_total'],
    ['PRD001', 'Produit test', '125', '2190.5'],
  ];
  const content = rows.map((r) => r.join(';')).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'groupage.csv';
  a.click();
  URL.revokeObjectURL(url);
};

const exportXlsx = () => {
  const wb = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([
    ['fournisseur', 'campagne', 'code', 'designation', 'qte', 'st_total'],
    ['MEDIGROS', 'Campagne Avril', 'PRD001', 'Produit test', 125, 2190.5],
  ]);
  XLSX.utils.book_append_sheet(wb, summary, 'Synthèse campagne');
  XLSX.writeFile(wb, 'groupage.xlsx');
};

export const GroupagePage = () => (
  <div className="grid">
    <section className="card">
      <h1>Groupage par fournisseur</h1>
      <p>Inclut uniquement les BL au statut validated.</p>
      <div className="actions">
        <button className="btn" onClick={exportCsv}>Exporter CSV</button>
        <button className="btn secondary" onClick={exportXlsx}>Exporter XLSX</button>
      </div>
    </section>
  </div>
);
