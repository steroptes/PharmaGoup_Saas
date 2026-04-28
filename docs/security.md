# Sécurité et RLS

## Principes
- Modèle multi-tenant par pharmacie.
- Contrôles en base (RLS + triggers), pas seulement côté frontend.
- Fichiers BL dans bucket privé Supabase Storage.

## Politiques RLS implémentées
1. **Admin full access**
   - `admin` a accès complet (`for all`) sur les tables métier.

2. **Pharmacy user scoped access**
   - Accès limité à sa pharmacie (`current_user_pharmacy_id()`).
   - Consultation uniquement des campagnes où la pharmacie participe.
   - Gestion de ses BL personnels tant qu’ils ne sont pas `validated`.
   - Interdiction implicite de modifier un BL validé.

3. **Delivery notes**
   - `pharmacy_user` peut créer/mettre à jour ses BL (`uploaded_by = auth.uid()`).
   - Blocage modification en statut `validated`.

4. **Exports**
   - À implémenter via RPC / Edge Function réservée admin.
   - Recommandation: vérifier `current_user_role() = 'admin'` avant génération.

## Storage
- Bucket recommandé: `delivery-notes` en privé.
- Politiques storage à ajouter côté Supabase dashboard:
  - upload: pharmacy_user sur son préfixe (`pharmacy_id/`).
  - lecture: admin global + pharmacie concernée.
