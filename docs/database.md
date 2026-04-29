# Modèle de données

Tables principales (RLS activé):
- `profiles`
- `pharmacies`
- `suppliers`
- `products`
- `campaigns`
- `campaign_participants`
- `campaign_products`
- `delivery_notes`
- `delivery_note_lines`
- `audit_logs`

## Contraintes métier clés
- `profiles`: pharmacy obligatoire si `role = pharmacy_user`.
- `campaigns`: `end_date >= start_date`.
- `delivery_note_lines`: `quantity > 0`, `p_phar > 0`.
- Trigger `validate_delivery_note_before_write`:
  - campagne ouverte,
  - date active,
  - fournisseur cohérent,
  - pharmacie participante.

## Provisioning Auth
- Trigger `handle_new_user_signup()` sur `auth.users` (migration dédiée).
- Utilise `raw_user_meta_data` pour hydrater `profiles` (`full_name`, `role`).
- Si rôle `pharmacy_user`, crée une `pharmacies` puis rattache `profiles.pharmacy_id`.

## Traçabilité
- Fichier original (`delivery_notes.file_url`).
- Confiance OCR (`ocr_confidence`, `line_confidence`).
- Historique d’action (`audit_logs`).
- Statuts BL (`draft` → `validated/rejected`).


## Notes migration
- La migration `20260428090000_init.sql` doit créer les tables avant les fonctions helpers (`current_user_role`, `current_user_pharmacy_id`) pour éviter l'erreur `42P01` sur `public.profiles`.

## Sprint 1 livré — Schéma catalogue hiérarchique
### Nouvelles structures
- `business_units(id, laboratory_id, name, created_at)`.
- `group_brands(id, laboratory_id, business_unit_id, name, created_at)`.
- `managed_products` enrichie avec `business_unit_id` et `group_brand_id`.

### Contraintes et règles implémentées
- Trigger `validate_catalog_hierarchy()` sur `group_brands` et `managed_products`.
- Interdiction produit/group-brand racine si BU existantes.
- Interdiction parentage multiple d'un produit.
- Contrôle de cohérence inter-laboratoire des FK métier (BU/GroupBrand du même labo).

### Endpoint lecture
- Fonction RPC `get_laboratory_catalog_tree` retournant un JSON hiérarchique exploitable UI.

## Sprint 2 — Bulk operations catalogue
### Nouvelles structures
- `catalog_bulk_audit_logs`: journal minimum des bulk actions (acteur, opération, labo, payload JSON).
- Index ajoutés:
  - `idx_group_brands_laboratory_bu`
  - `idx_managed_products_laboratory_parent`
  - `idx_catalog_bulk_audit_logs_laboratory`

### Nouvelles fonctions RPC
- `catalog_products_bulk_move(...)`.
- `catalog_products_bulk_delete(...)`.
- `catalog_group_brands_bulk_move(...)`.
- `catalog_group_brands_bulk_delete(...)`.
- `delete_business_unit(p_business_unit_id uuid)` avec garde-fou BU non vide.

### Contrats d'erreurs métier
Les fonctions lèvent des exceptions à préfixes stables: `CATALOG_BULK_*` et `BUSINESS_UNIT_*` pour faciliter le mapping API/frontend.

## Sprint 3 — Migration obligatoire 1ère BU
- Nouvelle table `catalog_first_bu_migrations` pour piloter l'assistant backend (session, statut, signatures de revalidation, acteur, timestamps).
- Nouveaux RPC:
  - `create_business_unit_or_require_migration(...)`
  - `catalog_first_bu_migration_init(...)`
  - `catalog_first_bu_migration_preview(...)`
  - `catalog_first_bu_migration_commit(...)`
  - `catalog_first_bu_migration_cancel(...)`
- Garanties:
  - commit atomique (transaction SQL).
  - revalidation anti-concurrence par signatures racine.
  - journalisation dans `catalog_bulk_audit_logs`.
