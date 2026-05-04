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
