# Campaign Participation Workflow

## Objectif
Formaliser le processus de participation utilisateur a une campagne ouverte, avec controle des phases, validation des conditions et revue admin.

## Flux pharmacie
1. Campagne ouverte visible dans le portail.
2. Decision utilisateur: `Participer` ou `Decliner`.
3. Si participation acceptee:
- progression par phase selon l'ordre active dans la campagne.
- formulaire phase (`purchase_intentions` / `purchase_orders`) organise selon l'arrangement campagne (racine, BU, GROUP, produit).
- verification en temps reel des conditions (produit, GROUP, BU, campagne) sans ecriture backend pendant la saisie.
4. Enregistrement:
- brouillon possible.
- soumission seulement si conditions bloquantes respectees.
- uniquement les lignes avec quantite > 0 sont persistees.
5. Si le statut devient `accepted`, la soumission est verrouillee pour la phase.

## Flux admin
1. Liste des soumissions par phase et campagne.
2. Consultation du detail produit/quantites/montants.
3. Actions de revue:
- `Demander rectification` -> statut `needs_correction` (+ note optionnelle).
- `Accepter` -> statut `accepted` (+ note optionnelle).

## Statuts
- `draft`
- `submitted`
- `needs_correction`
- `accepted`

## Notes produit
- Les intentions d'achat acceptees deviennent la reference de la phase.
- L'ajout de produits complementaires doit passer par un flux dedie (hors perimetre de cette livraison).
