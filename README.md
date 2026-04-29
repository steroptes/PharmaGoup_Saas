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

4. Appliquer les migrations Supabase (important pour le login/signup):
   - `20260428090000_init.sql`
   - `20260428152000_auth_signup_bootstrap.sql`


## Variables d'environnement Auth requises
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Authentification (nouveau)
Le frontend inclut désormais un module d'authentification complet basé sur Supabase:
- `/auth/login`: connexion email + mot de passe.
- Redirection automatique selon rôle:
  - `admin` -> `/admin/campaigns`
  - `pharmacy_user` -> `/pharmacy/upload`
- `/auth/verify-email`: renvoi du lien de vérification d'email.
- `/auth/forgot-password`: demande de récupération de mot de passe.
- `/auth/reset-password`: mise à jour du mot de passe depuis lien de récupération (même si une session est déjà active, le flux de recovery reste prioritaire).
- `/auth/register/pharmacy`: création de compte pharmacie.
- `/auth/register/admin`: création de compte administrateur.

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
- `supabase/migrations/20260428152000_auth_signup_bootstrap.sql`


## Création manuelle de comptes (fallback)
Si l'UI Supabase **Authentication > Add user** échoue (ex: log `sb_temp__... invalid`), utilisez le script local avec la clé `service_role`:

```bash
SUPABASE_URL="https://<project-ref>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" \
npm run create:user -- --email admin@example.com --password 'StrongPass123!' --role admin --full-name "Admin"
```

Pour un compte pharmacie:

```bash
SUPABASE_URL="https://<project-ref>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" \
npm run create:user -- --email pharma@example.com --password 'StrongPass123!' --role pharmacy_user --full-name "Pharmacien" --pharmacy-name "Pharmacie Atlas" --auto-confirm
```

## Dépannage connexion
- Si vous voyez `Invalid login credentials`, vérifiez d'abord email/mot de passe et la confirmation email.
- Si vous atteignez la limite d'envoi d'emails Supabase, créez l'utilisateur dans **Authentication > Users > Add user** avec **Auto Confirm User** activé, ou désactivez temporairement `Confirm email` dans les settings Auth pour les tests.
- Si les logs indiquent `sb_temp__... invalid` sur `/auth/v1/admin/users`, le token temporaire Dashboard est invalide/expiré: rechargez le Dashboard Supabase puis réessayez, ou utilisez la création via l'UI Auth standard.
- Si la console affiche des erreurs sur `/rest/v1/profiles`, exécutez la migration `20260428152000_auth_signup_bootstrap.sql` puis recréez les comptes de test.
- Si vous voyez `406 Not Acceptable` sur `/rest/v1/profiles`, cela signifie souvent que la ligne `public.profiles` de cet utilisateur est absente. Créez/complétez le profil puis reconnectez-vous.

- Si Supabase SQL Editor retourne `42P01: relation "public.profiles" does not exist`, utilisez la version corrigée de `20260428090000_init.sql` (helpers déplacés après création de `profiles`).

## Dépannage OCR
- Si l'OCR échoue sur un BL PDF avec des erreurs console de type `pixRead` / `Pdf reading is not supported`, convertir d'abord la page du BL en image (`.png` ou `.jpg`) puis relancer l'import OCR.
- Dans l'état actuel du MVP, le flux OCR navigateur est limité aux formats image (`JPG/JPEG/PNG`).

## Sprint 1 livré — Catalogue laboratoire hiérarchique
- **Périmètre**: fondations SQL (`business_units`, `group_brands`, rattachements produits), règles backend via triggers SQL, endpoint de lecture hiérarchique via RPC `get_laboratory_catalog_tree`, services frontend de consommation.
- **Décisions techniques**: validation structurelle du parent logique au niveau base (source de vérité), endpoint de lecture matérialisé en JSON hiérarchique côté SQL pour réduire la logique UI.
- **Limites connues**: Sprint 1 n'inclut pas les opérations de bulk move/delete ni assistant de migration des catalogues existants.
- **Exemple API**:
  ```json
  {
    "laboratory_id": "...",
    "business_units": [{"id":"...","name":"BU","products":[],"group_brands":[]}],
    "root_group_brands": [],
    "root_products": []
  }
  ```
- **Checklist règles**:
  - produit = un seul parent logique (racine labo OU BU OU group/brand)
  - si BU(s) existent: pas de produit racine
  - si BU(s) existent: pas de group/brand racine
  - group/brand relié à la BU du même labo
