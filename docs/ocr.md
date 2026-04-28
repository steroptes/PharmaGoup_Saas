# OCR (MVP économique)

## Objectif
L'OCR est une **aide**: aucune validation automatique ne doit contourner l'écran de correction.

## Implémentation actuelle
- `services/ocr/tesseractExtractor.ts`
- `services/ocr/normalizers/amount.ts`
- `services/ocr/templates/prophasud.ts`
- `services/ocr/templates/medigros.ts`

## Données extraites (tentatives)
- fournisseur
- numéro BL
- date BL
- total HT / TVA / TTC
- confiance globale OCR

## Évolutions recommandées
- Parsing lignes produit par heuristiques colonnes.
- Passage en Edge Functions pour homogénéité serveur.
- Fallback template spécifique fournisseur.
- Conservation du texte OCR brut en JSONB pour audit.
