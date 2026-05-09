# Backlog Optimisations - Arrangement Campagne

## Contexte
L'implémentation actuelle de bascule vers l'arrangement catalogue est volontairement simple et robuste (reset puis reconstruction). Elle est fonctionnelle, mais peut être optimisée plus tard pour réduire la charge Supabase et la latence.

## Optimisations prioritaires

### 1) Passer d'un reset total à une stratégie différentielle
- Objectif: éviter de supprimer/recréer toutes les BU/GROUP à chaque bascule.
- Approche:
  - Calculer un diff entre structure actuelle et structure cible catalogue:
    - `to_create`
    - `to_keep`
    - `to_delete`
  - Appliquer uniquement les changements nécessaires.
- Gains attendus:
  - Moins d'écritures SQL.
  - Moins de risque de contention/verrous.
  - Meilleure latence perçue.

### 2) Batch/Upsert des conteneurs
- Objectif: réduire le nombre d'aller-retour réseau.
- Approche:
  - Préparer des inserts groupés BU/GROUP.
  - Utiliser `upsert` avec clé de conflit adaptée lorsque possible.
- Gains attendus:
  - Diminution du nombre de requêtes.
  - Réduction du temps total d'exécution.

### 3) Suppression ciblée des orphelins
- Objectif: ne supprimer que les BU/GROUP réellement non utilisés.
- Approche:
  - Identifier les conteneurs sans produit après projection cible.
  - Supprimer uniquement ces éléments.
- Gains attendus:
  - Évite les suppressions/recréations inutiles.
  - Préserve mieux la stabilité des IDs quand pertinent.

### 4) Consolidation transactionnelle
- Objectif: garantir l'atomicité logique de la bascule.
- Approche:
  - Étudier un RPC/Function Supabase côté SQL pour encapsuler:
    - préparation,
    - diff,
    - application,
    - validation.
- Gains attendus:
  - Moins d'états intermédiaires.
  - Robustesse accrue en cas d'erreur partielle.

### 5) Réduction des reloads complets
- Objectif: réduire les relectures lourdes après opérations.
- Approche:
  - Éviter les `reload` globaux quand un patch local du state suffit.
  - Garder un `refresh` complet uniquement en fallback.
- Gains attendus:
  - Moins de lecture DB.
  - UI plus réactive.

### 6) Instrumentation performance
- Objectif: mesurer avant/après optimisation.
- Approche:
  - Tracer côté UI:
    - durée totale bascule,
    - nombre d'items traités.
  - Tracer côté service:
    - nombre de requêtes effectuées,
    - erreurs.
- Gains attendus:
  - Priorisation basée sur métriques réelles.

## Optimisations secondaires

### 7) Caching local des mappings de structure
- Réutiliser les correspondances BU/GROUP pendant la session admin.

### 8) Pagination/virtualisation si volumétrie élevée
- Améliorer l'ergonomie et limiter le coût DOM côté front.

### 9) Vérification d'index SQL
- Vérifier/ajouter les index utiles sur:
  - `campaign_id`
  - clés de rattachement BU/GROUP/produit.

## Critères de validation future
- Même résultat métier qu'aujourd'hui (aucune régression fonctionnelle).
- Moins de requêtes Supabase sur un scénario de bascule catalogue.
- Temps de traitement réduit sur campagnes volumineuses.
- Aucune incohérence observée sur les affectations produit -> BU/GROUP.

## Amélioration à venir - Messagerie de rectification (type chat)

### Objectif
Mettre en place un système de suivi conversationnel des rectifications entre admin et pharmacie (format thread/messages), avec blocage d'acceptation tant que les rectifications ouvertes ne sont pas résolues.

### Périmètre fonctionnel
- Ouvrir une demande de rectification sur une portée:
  - campagne
  - BU
  - GROUP
  - produit
- Échanger des messages sur chaque demande (historique horodaté).
- Marquer une demande comme:
  - `open`
  - `resolved`
  - `reopened`
- Empêcher l'admin d'accepter une soumission tant qu'il existe au moins une demande `open` ou `reopened`.
- Afficher côté pharmacie les alertes ciblées sur les sections/items concernés + accès au fil de discussion.

### Modèle de données proposé
- `correction_threads`
  - `id`, `submission_id`, `scope_type`, `campaign_business_unit_id`, `campaign_group_brand_id`, `product_id`
  - `title`, `status`, `created_by`, `assigned_to`, `created_at`, `updated_at`, `resolved_at`, `resolved_by`
- `correction_messages`
  - `id`, `thread_id`, `author_user_id`, `author_role`, `message`, `message_type`, `created_at`, `edited_at`
- `correction_thread_reads`
  - `thread_id`, `user_id`, `last_read_message_id`, `last_read_at`

### API / services front à prévoir
- `listCorrectionThreads(submissionId)`
- `createCorrectionThread(payload)`
- `listCorrectionMessages(threadId)`
- `sendCorrectionMessage(payload)`
- `markCorrectionThreadResolved(threadId)`
- `reopenCorrectionThread(threadId)`
- `markThreadRead(threadId, lastReadMessageId)`
- `canAcceptSubmission(submissionId)` (ou calcul local équivalent)

### Règles de sécurité (RLS)
- Admin: accès lecture/écriture sur les threads/messages des soumissions de son périmètre.
- Pharmacie: accès uniquement aux threads/messages de ses propres soumissions.
- Changement de statut (`resolved`, `reopened`): réservé admin.

### UX cible
- Admin:
  - liste des threads de rectification avec badge de statut et non-lus
  - vue chat par thread
  - actions `Marquer résolu` / `Réouvrir`
- Pharmacie:
  - badge d'alerte sur section/produit impacté
  - vue conversation par demande
  - réponse textuelle horodatée

### Plan d'implémentation recommandé
1. Migrations SQL + index + RLS.
2. Services TypeScript (threads/messages/reads).
3. UI admin (liste + chat + resolve/reopen).
4. UI pharmacie (alertes ciblées + chat de réponse).
5. Blocage d'acceptation basé sur statut des threads.
6. Realtime Supabase (optionnel mais recommandé).
