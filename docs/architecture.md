# Architecture

## Vue d'ensemble
- **Frontend React**: dashboards admin/pharmacie, écrans upload/correction/validation/groupage.
- **Supabase Postgres**: modèle métier (pharmacies, fournisseurs, campagnes, BL, lignes, audit).
- **Supabase Auth**: rôles `admin` et `pharmacy_user` via table `profiles`.
- **Supabase Storage**: stockage sécurisé des fichiers originaux BL.
- **Services OCR**: extracteur Tesseract modulaire (`services/ocr`).

## Dossiers
- `src/components`: composants réutilisables UI/layout.
- `src/pages`: pages métier admin et pharmacie.
- `src/services`: services OCR et logique applicative.
- `src/lib`: clients techniques (Supabase).
- `src/types`: types partagés.
- `supabase/migrations`: schéma SQL + RLS.

## Évolutivité
- OCR découplé par `templates/` fournisseur (ex: prophasud, medigros).
- RLS centralisée dans Postgres pour sécurité multi-tenant.
- Export CSV/XLSX indépendant du rendu écran.
