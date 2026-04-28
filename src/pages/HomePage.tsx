export const HomePage = () => (
  <div className="grid">
    <section className="card">
      <h1>Portail de groupage pharmaceutique</h1>
      <p>Plateforme MVP pour gérer les campagnes, BL, OCR, validation et groupage.</p>
    </section>
    <section className="grid grid-2">
      <article className="card"><h3>Pharmacie</h3><p>Téléversement et correction BL.</p></article>
      <article className="card"><h3>Backoffice</h3><p>Validation, campagnes et export CSV/XLSX.</p></article>
    </section>
  </div>
);
