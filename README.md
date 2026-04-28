# PharmaGroup SaaS — MVP

MVP React + Supabase pour le groupage de bons de livraison pharmaceutiques.

## Stack
- React + TypeScript + Vite
- Supabase (Auth, Postgres, RLS, Storage)
- UI orientée shadcn/ui (composants sobres, productivité)
- OCR gratuit avec Tesseract.js (aide à la saisie)

## Démarrage
1. Copier `.env.example` vers `.env.local` et renseigner les clés Supabase.
2. Installer les dépendances:
   ```bash
   npm install
   ```
3. Lancer l'application:
   ```bash
   npm run dev
   ```

## Livraison MVP (phases)
- Phase 1: Auth, rôles, schéma SQL, RLS, référentiels.
- Phase 2: campagnes, participants, produits ciblés.
- Phase 3: upload BL + OCR + correction.
- Phase 4: soumission, validation admin, audit logs.
- Phase 5: groupage, export CSV/XLSX, durcissement doc.

## Documentation
- `docs/architecture.md`
- `docs/database.md`
- `docs/security.md`
- `docs/ocr.md`
- `docs/workflows.md`
- `docs/campaigns.md`
- `docs/export.md`

## SQL Supabase
Le schéma complet + politiques RLS sont dans:
- `supabase/migrations/20260428090000_init.sql`
