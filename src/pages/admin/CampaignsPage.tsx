export const CampaignsPage = () => (
  <div className="grid">
    <section className="card">
      <h1>Campagnes de collecte</h1>
      <p>Créer, ouvrir, clôturer et filtrer le périmètre pharmacies/produits.</p>
    </section>
    <section className="card">
      <h2>Création rapide</h2>
      <div className="grid grid-2">
        <input className="input" placeholder="Nom campagne" />
        <input className="input" type="date" />
        <input className="input" type="date" />
        <select className="select"><option>Fournisseur</option></select>
      </div>
      <button className="btn" style={{ marginTop: 12 }}>Créer en brouillon</button>
    </section>
  </div>
);
