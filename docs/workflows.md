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
3. Le lien reçu ouvre `/auth/reset-password`.
4. L'utilisateur définit un nouveau mot de passe via `supabase.auth.updateUser`.
5. L'utilisateur peut se connecter avec le nouveau mot de passe.

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
