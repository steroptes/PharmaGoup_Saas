# OCR (MVP économique)

## Objectif
L'OCR est une **aide**: aucune validation automatique ne doit contourner l'écran de correction.

## Implémentation actuelle
- `services/ocr/tesseractExtractor.ts`
- `services/ocr/normalizers/amount.ts`
- `services/ocr/templates/prophasud.ts`
- `services/ocr/templates/medigros.ts`

## Limites importantes (avril 2026)
- Le flux OCR exécuté dans le navigateur via `tesseract.js` supporte de manière fiable les images (`JPG/JPEG/PNG`).
- Les PDF bruts ne sont pas décodés directement par ce moteur côté client dans l'application actuelle.
- En cas de PDF BL, convertir la page à traiter en image avant import OCR.

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
