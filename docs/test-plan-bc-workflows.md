# Plan De Test - Flux Campagnes / Intentions / BC

## 1) Objectif
Valider de bout en bout:
- le paramétrage admin des campagnes et des règles BC,
- la soumission participant (intentions + BC),
- le cycle rectification / acceptation / fige / défige,
- le passage de commande (admin/participant selon mode),
- la génération PDF BC et la traçabilité des envois.

---

## 2) Environnements et comptes
## 2.1 Comptes
- Admin: `A1`
- Participants: `P1`, `P2`, `P3`

## 2.2 Données de base
- 3 fournisseurs actifs: `F1`, `F2`, `F3`
- Produits mixte `MEDICAMENT` + `PARA`
- Produits avec TVA 0%, 7%, 19% (si possible)

## 2.3 Mapping participants/fournisseurs
- `P1`: partenaires `F1`, `F2`
- `P2`: partenaires `F2`
- `P3`: partenaires `F3` uniquement

---

## 3) Jeux de campagnes de test
Créer 3 campagnes:

1. `C1_ADMIN_ONLY`
- BC activé
- `order_placement_mode = admin_only`
- fournisseurs autorisés: `F1`, `F2`

2. `C2_PARTICIPANT_ONLY`
- BC activé
- `order_placement_mode = participant_only`
- fournisseurs autorisés: `F1`, `F2`

3. `C3_PARTICIPANT_CHOICE`
- BC activé
- `order_placement_mode = participant_choice`
- fournisseurs autorisés: `F1`, `F2`

---

## 4) Cas de test fonctionnels (checklist)

## 4.1 Paramétrage campagne (admin)
- [ ] TC-ADM-001: BC activé + aucun fournisseur autorisé -> blocage sauvegarde.
- [ ] TC-ADM-002: BC activé + participant sans fournisseur compatible (ex: `P3`) -> blocage sauvegarde + message explicite.
- [ ] TC-ADM-003: campagne ouverte -> activation phases verrouillée, mais mode passage commande BC modifiable.
- [ ] TC-ADM-004: mode BC modifié (admin_only -> participant_only -> participant_choice) -> impact visible côté participant.

## 4.2 Soumission BC (participant)
- [ ] TC-PT-001: soumission BC sans fournisseur -> bloquée.
- [ ] TC-PT-002: soumission BC avec plus d’un fournisseur -> bloquée (fournisseur unique exigé).
- [ ] TC-PT-003: fournisseur non autorisé campagne -> bloquée.
- [ ] TC-PT-004: fournisseur autorisé + partenaire participant -> soumission réussie.

## 4.3 Flux intentions -> BC
- [ ] TC-FLW-001: intentions acceptées -> préremplissage BC correct.
- [ ] TC-FLW-002: mode sans intentions planifiées -> pas d’IA/écart affiché.
- [ ] TC-FLW-003: bouton "réinitialiser depuis intentions" fonctionne (quand applicable).

## 4.4 Rectification / acceptation
- [ ] TC-REV-001: admin demande rectification -> visible côté participant.
- [ ] TC-REV-002: participant resoumet sans changement -> bloqué.
- [ ] TC-REV-003: admin ne peut pas accepter tant qu’il y a rectifications non résolues.
- [ ] TC-REV-004: rectifications restent monitorables après resoumission.

## 4.5 Fige / défige
- [ ] TC-LOCK-001: accepté = formulaire lecture seule participant.
- [ ] TC-LOCK-002: défige possible par admin selon règles.
- [ ] TC-LOCK-003: défige intentions interdit si BC déjà engagé (soumis/rectif/accepté).

## 4.6 Passage commande - droits par mode
- [ ] TC-MODE-001 (`admin_only`): participant ne voit pas boutons envoi; admin peut passer commande.
- [ ] TC-MODE-002 (`participant_only`): admin ne voit pas boutons envoi; participant peut passer commande après acceptation.
- [ ] TC-MODE-003 (`participant_choice` + délégation = oui): admin peut passer commande.
- [ ] TC-MODE-004 (`participant_choice` + délégation = non): participant garde la main, admin bloqué.
- [ ] TC-MODE-005: fournisseur concerné obligatoire avant impression/envoi.

## 4.7 Marquage admin "commande passée"
- [ ] TC-ADM-DSP-001: admin peut marquer commande passée avec canal (email/sms/whatsapp).
- [ ] TC-ADM-DSP-002: date/heure et canal apparaissent dans le BC imprimé.

## 4.8 PDF BC
- [ ] TC-PDF-001: format facture lisible (entête participant, labo/fournisseur, tableau produits, totaux).
- [ ] TC-PDF-002: colonnes centrées (Code, Désignation, Quantité/Prix/TVA/ST TTC selon règles UI).
- [ ] TC-PDF-003: zébrage lignes gris/blanc.
- [ ] TC-PDF-004: pagination multi-pages correcte.
- [ ] TC-PDF-005: codes produits: `pct_code` pour medicament, `barcode` pour para.
- [ ] TC-PDF-006: pas de `?` dans les séparateurs de milliers.

## 4.9 Traçabilité et historique
- [ ] TC-AUD-001: historique envois alimenté (acteur, canal, fournisseur, date).
- [ ] TC-AUD-002: statut "commande passée" visible côté concerné.
- [ ] TC-AUD-003: admin informé des actions participant (mode participant).

---

## 5) Vérifications base de données (spot checks)
Exemples de checks SQL (adapter les IDs):

```sql
-- Soumission BC + fournisseur choisi
select s.id, s.status, s.delegate_order_to_admin, ss.supplier_id
from public.campaign_phase_submissions s
left join public.campaign_phase_submission_suppliers ss on ss.submission_id = s.id
where s.campaign_id = '...'
  and s.phase_key = 'purchase_orders'
  and s.pharmacy_id = '...';

-- Historique dispatch
select submission_id, supplier_id, actor_role, channel, status, created_at
from public.purchase_order_dispatches
where submission_id = '...'
order by created_at desc;
```

---

## 6) Méthode de gestion des réclamations (anti-dispersion)
## 6.1 Template ticket obligatoire
- ID
- Contexte campagne/pharmacie
- Étapes de reproduction
- Résultat actuel
- Résultat attendu
- Gravité: `Bloquant` / `Majeur` / `Mineur`
- Pièces: capture + logs + IDs (`campaign_id`, `submission_id`)

## 6.2 Triage quotidien (15 min)
- Prioriser par:
  1. intégrité données,
  2. blocage métier,
  3. volume impacté.
- Limite WIP:
  - max 2 tickets Bloquants simultanés,
  - max 3 tickets Majeurs simultanés.

## 6.3 Workflow ticket
`Nouveau` -> `Reproduit` -> `En correction` -> `En recette` -> `Clos`

Règles:
- Pas de `Clos` sans preuve de test.
- Pas de correction sans cas de test ajouté à cette checklist.

## 6.4 SLA conseillé
- Bloquant: correction < 24h
- Majeur: correction < 72h
- Mineur: prochain sprint

---

## 7) Rapport de recette (modèle rapide)
À la fin de la campagne de tests:
- Nombre de cas: `X`
- Réussis: `Y`
- Échecs: `Z`
- Bloquants ouverts: `N`
- Décision GO/NO-GO

---

## 8) Conseils d’exécution
- Tester chaque mode (`admin_only`, `participant_only`, `participant_choice`) séparément.
- Toujours tester au moins 1 scénario avec rectification.
- Toujours tester un PDF avec > 1 page produits.
- Ne pas mélanger campagnes de test: 1 objectif métier par campagne.
