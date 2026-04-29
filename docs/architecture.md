# Architecture

## Vue d'ensemble
- **Frontend React**: dashboards admin/pharmacie, écrans upload/correction/validation/groupage.
- **Supabase Postgres**: modèle métier (pharmacies, fournisseurs, campagnes, BL, lignes, audit).
- **Supabase Auth**: rôles `admin` et `pharmacy_user` via table `profiles`.
- **Supabase Storage**: stockage sécurisé des fichiers originaux BL.
- **Services OCR**: extracteur Tesseract modulaire (`services/ocr`).

## Module Auth frontend
- `AuthProvider` centralise session Supabase + chargement du profil `profiles`.
- Pages de signup séparées (`/auth/register/admin`, `/auth/register/pharmacy`) pour création guidée des comptes.
- `AppRouter` protège les routes par session, email confirmé et rôle.
- Les pages `admin/*` et `pharmacy/*` sont isolées par garde `RequireRole`.
- `roleHomePath()` standardise la redirection post-login:
  - admin -> `/admin/campaigns`
  - pharmacy_user -> `/pharmacy/upload`

## Dossiers
- `src/components`: composants réutilisables UI/layout.
- `src/context`: provider et état global Auth Supabase.
- `src/pages`: pages métier admin/pharmacie + auth.
- `src/services`: services OCR et logique applicative.
- `src/lib`: clients techniques (Supabase).
- `src/types`: types partagés.
- `supabase/migrations`: schéma SQL + RLS.

## Couche SQL d'inscription
- Trigger `handle_new_user_signup()` sur `auth.users` pour créer automatiquement `profiles`.
- Support natif des métadonnées `role`, `full_name`, `pharmacy_name` envoyées par `signUp`.

## Évolutivité
- OCR découplé par `templates/` fournisseur (ex: prophasud, medigros).
- RLS centralisée dans Postgres pour sécurité multi-tenant.
- Export CSV/XLSX indépendant du rendu écran.

## Sprint 1 — Catalogue hiérarchique laboratoire
- Nouveau sous-domaine catalogue hiérarchique: `laboratories -> business_units -> group_brands -> managed_products`.
- Les règles d'intégrité sont validées en base via trigger `validate_catalog_hierarchy()`.
- La lecture arborescente est exposée via RPC SQL `get_laboratory_catalog_tree(target_laboratory_id uuid)`.

## Sprint 2 — Architecture bulk catalogue
- Les opérations bulk catalogue passent par des RPC SQL transactionnelles (source de vérité côté DB).
- Les services frontend `src/services/catalogBulk.ts` exposent les contrats API bulk.
- La cohérence est garantie par combinaison:
  - validations métier dans chaque RPC,
  - trigger existant `validate_catalog_hierarchy()` (Sprint 1),
  - audit minimal dans `catalog_bulk_audit_logs`.
- Les mouvements invalides (cross-lab, destination incohérente, mode invalide) sont bloqués avant mutation.
