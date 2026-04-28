import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';

export const CampaignsPage = () => (
  <div className="grid">
    <Card>
      <h1>Campagnes de collecte</h1>
      <p>Créer, ouvrir, clôturer et filtrer le périmètre pharmacies/produits.</p>
    </Card>
    <Card>
      <h2>Création rapide</h2>
      <div className="grid grid-2">
        <Input placeholder="Nom campagne" />
        <Input type="date" />
        <Input type="date" />
        <Select><option>Fournisseur</option></Select>
      </div>
      <Button style={{ marginTop: 12 }}>Créer en brouillon</Button>
    </Card>
  </div>
);
