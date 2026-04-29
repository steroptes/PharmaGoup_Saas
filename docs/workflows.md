# Workflows

## Workflow création de compte
> Pré-requis: migration `20260428152000_auth_signup_bootstrap.sql` appliquée sur le projet Supabase.
1. L'utilisateur choisit `Créer un compte pharmacie` ou `Créer un compte admin` depuis `/auth/login`.
2. Le formulaire appelle `supabase.auth.signUp` avec métadonnées (`role`, `full_name`, `pharmacy_name`).
3. Un trigger SQL crée automatiquement le profil dans `public.profiles` et, pour pharmacie, une entrée `public.pharmacies`.
4. L'utilisateur confirme son email via `/auth/verify-email`, puis se connecte.

## Workflow authentification
1. L'utilisateur ouvre `/auth/login`.
2. Le système authentifie via `supabase.auth.signInWithPassword`.
3. Si l'email n'est pas confirmé, redirection vers `/auth/verify-email`.
4. Si l'email est confirmé, redirection selon rôle:
   - admin -> `/admin/campaigns`
   - pharmacy_user -> `/pharmacy/upload`

## Workflow vérification d'email
1. Depuis `/auth/verify-email`, l'utilisateur peut renvoyer un email de confirmation.
2. Le lien email renvoie vers l'application (redirect Supabase configuré).
3. Après confirmation, l'utilisateur se reconnecte et accède à son espace selon rôle.

## Workflow récupération mot de passe
1. L'utilisateur ouvre `/auth/forgot-password`.
2. Saisie email puis envoi du lien via `resetPasswordForEmail`.
3. Le lien reçu ouvre `/auth/reset-password` avec un hash Supabase de recovery (`type=recovery` + tokens).
4. L'utilisateur définit un nouveau mot de passe via `supabase.auth.updateUser`.
5. Même si l'utilisateur avait déjà une session active, l'application laisse afficher l'écran de reset tant que le lien de recovery est présent.

## Workflow pharmacie
1. Ouvrir campagne active.
2. Téléverser BL (PDF/JPG/JPEG/PNG).
3. Lancer OCR.
4. Corriger les données BL et lignes.
5. Enregistrer brouillon ou soumettre.

## Workflow backoffice
1. Créer campagne (draft).
2. Ajouter pharmacies participantes et périmètre produit.
3. Ouvrir campagne.
4. Revoir BL soumis.
5. Valider / Rejeter / Demander correction.

## Workflow groupage
1. Filtrer sur campagne.
2. Inclure uniquement BL `validated`.
3. Agréger quantités et ST (`quantity * p_phar`).
4. Export CSV/XLSX.

## Sprint 3 livré — Wizard migration 1ère BU

### Flux end-to-end
1. `POST /labs/{labId}/business-units` appelle `create_business_unit_or_require_migration`.
2. Si 1ère BU + contenu racine: réponse `migration_required` + inventaire (`root_products`, `root_group_brands`).
3. UI lance `POST /labs/{labId}/catalog/migrations/first-bu/init` (`catalog_first_bu_migration_init`) pour créer la BU cible et ouvrir une session de migration.
4. UI envoie le plan à `POST /.../preview` pour obtenir un résumé de mouvements.
5. UI valide via `POST /.../commit` (transaction atomique all-or-nothing).
6. Optionnel: `POST /.../cancel` supprime la BU créée pendant init et annule la session.

### Diagramme d'états
- **Avant**: `no_bu` + (`root_products|root_group_brands` possibles).
- **Pendant**: `migration_initialized` (session active, BU créée, plan en préparation).
- **Après succès**: `migration_committed` + `has_bu` + `root_products=0` + `root_group_brands=0`.
- **Après annulation**: `migration_cancelled` + retour à l'état avant init.

### Contrats API
- `POST /labs/{labId}/business-units`
  - `status=created` ou `status=migration_required`.
- `POST /labs/{labId}/catalog/migrations/first-bu/init`
  - Retourne `migration_id`, `business_unit_id`, inventaire figé.
- `POST /labs/{labId}/catalog/migrations/first-bu/preview`
  - Retourne `preview_ready`, compte des mouvements.
- `POST /labs/{labId}/catalog/migrations/first-bu/commit`
  - Retourne résumé détaillé (`moved_products`, `moved_group_brands`, `created_brands`).
- `POST /labs/{labId}/catalog/migrations/first-bu/cancel`
  - Retourne `cancelled`.

### Exemples payload/réponses
- Commit plan (exemple):
```json
{
  "products": [
    {"product_id": "...", "target_type": "business_unit"},
    {"product_id": "...", "target_type": "existing_brand", "target_group_brand_id": "..."}
  ],
  "group_brands": [
    {"group_brand_id": "...", "target_type": "business_unit"}
  ]
}
```
- Erreurs métier structurées:
  - `MIGRATION_INVALID_DESTINATION`
  - `MIGRATION_PRODUCT_NOT_FOUND` / `MIGRATION_BRAND_NOT_FOUND`
  - `MIGRATION_PLAN_STALE`
  - `MIGRATION_STRUCTURE_VIOLATION`

### Transaction & concurrence
- Commit implémenté en fonction SQL transactionnelle (rollback natif en cas d'exception).
- Revalidation stricte juste avant commit via signatures d'inventaire racine (`root_products_signature`, `root_group_brands_signature`).
- Session active unique par labo (`idx_catalog_first_bu_migrations_lab_active`).

### Limites connues / dette Sprint 4
- Le backend est prêt, mais l'orchestration UI wizard complète reste à implémenter (Sprint 4).
- Le preview valide le volume et l'état de session, mais la validation fine UX des plans est à enrichir côté interface.

## Sprint 4 livré – UI catalogue fiche laboratoire

### Parcours utilisateur
- Depuis **Admin > Laboratoires**, l'utilisateur ouvre un laboratoire puis consulte la section **Catalogue laboratoire hiérarchique**.
- Le catalogue supporte 2 modes: sans BU (racine avec brands/produits racine) et avec BU (racine > BU > brands/produits).
- Une recherche locale permet de filtrer par nom de BU/brand/produit.
- L'action **Créer BU** déclenche le flux first-BU. Si migration requise, la preview et le commit de migration sont enchaînés côté UI.

### Mapping UI ↔ API endpoints
- Lecture arborescence: `get_laboratory_catalog_tree`.
- Création BU: `create_business_unit_or_require_migration`.
- Wizard migration première BU: `catalog_first_bu_migration_init`, `catalog_first_bu_migration_preview`, `catalog_first_bu_migration_commit`.
- Actions bulk (branchées côté services): `catalog_products_bulk_move`, `catalog_products_bulk_delete`, `catalog_group_brands_bulk_move`, `catalog_group_brands_bulk_delete`.
- Suppression BU: `delete_business_unit`.

### Règles d’activation/désactivation des actions
- Si une BU existe, les actions racine produit/brand sont cachées.
- La création de BU est toujours visible à la racine.
- La migration first-BU n'est déclenchée que quand l'API retourne `migration_required`.

### Gestion des erreurs et confirmations
- Les erreurs API sont affichées dans la zone de feedback de la page.
- Le commit de migration est explicitement confirmé via une confirmation UI.

### Limites connues / améliorations futures
- Les composants dédiés (TreeNode, SelectionBar, MoveDialog, DeleteDialog, MigrationWizard) restent à extraire pour mutualisation.
- Les actions contextuelles détaillées par nœud et l’accessibilité clavier complète doivent être enrichies au sprint suivant.
- Captures d'écran non incluses dans cet environnement CLI.
