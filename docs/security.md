# Sécurité et RLS

## Principes
- Modèle multi-tenant par pharmacie.
- Contrôles en base (RLS + triggers), pas seulement côté frontend.
- Fichiers BL dans bucket privé Supabase Storage.
- Routes frontend protégées par session, email confirmé et rôle.

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

## Auth frontend (Supabase)
- Pages d'inscription dédiées pour les rôles `admin` et `pharmacy_user`.
- `AuthProvider` synchronise l'état de session Supabase et le profil métier.
- `RequireAuth` bloque l'accès si l'utilisateur n'est pas connecté ou sans email confirmé.
- `RequireRole` empêche l'accès inter-rôles (admin vs pharmacy_user).
- `GuestOnly` protège les pages auth contre les sessions déjà actives.

## Provisioning automatique à l'inscription
> Cette couche doit être déployée en base (migration Supabase) sinon les profils ne seront pas créés.
- Trigger `handle_new_user_signup()` sur `auth.users`.
- Création automatique du `profile` selon `raw_user_meta_data.role`.
- Pour `pharmacy_user`, création automatique d'une ligne `pharmacies` et liaison `profiles.pharmacy_id`.

## Vérification email
- Page dédiée `/auth/verify-email`.
- Renvoi d'email via `supabase.auth.resend({ type: 'signup' })`.
- Redirection de vérification vers l'application (`emailRedirectTo`).

## Récupération mot de passe
- Demande via `/auth/forgot-password`.
- Mise à jour via `/auth/reset-password` avec `supabase.auth.updateUser`.

## Storage
- Bucket recommandé: `delivery-notes` en privé.
- Politiques storage à ajouter côté Supabase dashboard:
  - upload: pharmacy_user sur son préfixe (`pharmacy_id/`).
  - lecture: admin global + pharmacie concernée.
