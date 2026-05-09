# Campagnes de collecte

## Règles
- Soumission BL uniquement si campagne `open`.
- Date système comprise entre `start_date` et `end_date`.
- Fournisseur BL = fournisseur campagne.
- Pharmacie obligatoirement participante, avec participation `accepted`.
- Si périmètre produit restreint, signaler les lignes hors périmètre.

## Écran admin (état actuel)
- Création campagne brouillon.
- Définition fournisseur + dates.
- Paramétrage des phases (`purchase_intentions`, `purchase_orders`, `delivery_notes`) avec fenêtres optionnelles.
- Sélection participants (pharmacies).
- Sélection produits et arrangement campagne (racine / BU / GROUP / produit).
- Configuration des conditions et bonifications.
- Changement de statut `draft` / `open` / `closed` / `archived`.

## Parcours pharmacie (état actuel)
- Portail des campagnes ouvertes.
- Décision `Participer` / `Décliner`.
- Saisie par phase pour intentions et BC (brouillon ou soumission).
- Upload BL avec OCR d'aide, correction manuelle puis soumission.

## Revue admin des soumissions (intentions / BC)
- Consultation des soumissions par phase.
- Actions de revue: `Demander rectification` ou `Accepter`.
- Suivi des rectifications (campagne / BU / GROUP / produit).
