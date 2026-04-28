import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const ReviewPage = () => (
  <div className="grid">
    <Card>
      <h1>Validation Backoffice</h1>
      <p>Transitions prévues: submitted → validated/rejected/corrected.</p>
    </Card>
    <Card>
      <table className="table">
        <thead><tr><th>BL</th><th>Pharmacie</th><th>Fournisseur</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          <tr>
            <td>BL-2026-0001</td><td>Pharmacie Centrale</td><td>MEDIGROS</td><td><Badge>submitted</Badge></td>
            <td className="actions"><Button>Valider</Button><Button variant="secondary">Demander correction</Button></td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>
);
