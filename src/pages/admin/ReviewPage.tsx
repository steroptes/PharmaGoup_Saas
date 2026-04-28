export const ReviewPage = () => (
  <div className="grid">
    <section className="card">
      <h1>Validation Backoffice</h1>
      <p>Transitions prévues: submitted → validated/rejected/corrected.</p>
    </section>
    <section className="card">
      <table className="table">
        <thead><tr><th>BL</th><th>Pharmacie</th><th>Fournisseur</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          <tr>
            <td>BL-2026-0001</td><td>Pharmacie Centrale</td><td>MEDIGROS</td><td><span className="badge">submitted</span></td>
            <td className="actions"><button className="btn">Valider</button><button className="btn secondary">Demander correction</button></td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
);
