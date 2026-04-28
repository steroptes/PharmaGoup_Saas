import { Card } from '@/components/ui/card';

export const HomePage = () => (
  <div className="grid">
    <Card>
      <h1>Portail de groupage pharmaceutique</h1>
      <p>Plateforme MVP pour gérer les campagnes, BL, OCR, validation et groupage.</p>
    </Card>
    <section className="grid grid-2">
      <Card>
        <h3>Pharmacie</h3>
        <p>Téléversement, OCR et correction des BL.</p>
      </Card>
      <Card>
        <h3>Backoffice</h3>
        <p>Validation des BL, gestion des campagnes et export consolidé.</p>
      </Card>
    </section>
  </div>
);
