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
