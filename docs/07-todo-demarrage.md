# NFL BET — To-do de démarrage (v1)

> Objectif : passer de « le code existe en local » à « une ligue peut jouer une vraie semaine ».
> Légende owner : **[Toi]** = back/fondateur · **[Dev]** = dev front · **[2]** = les deux.

---

## Étape 0 — Prérequis (30 min) · [Toi]
- [ ] Créer un **projet Firebase** (console.firebase.google.com) et passer en **plan Blaze** (obligatoire pour Functions v2 ; gratuit sous les quotas).
- [ ] Activer **Authentication** (providers : Google + e-mail/lien magique).
- [ ] Activer **Cloud Firestore** (mode natif, région `europe-west1`).
- [ ] Installer la CLI : `npm i -g firebase-tools` puis `firebase login`.
- [ ] Renseigner le `projectId` dans **`.firebaserc`** (remplacer `REMPLACER_PAR_TON_PROJECT_ID`).
- [ ] Récupérer la **config web Firebase** (clés) → à donner au dev front.

## Étape 1 — Déployer le back + les référentiels (1 h) · [Toi]
- [ ] `cd functions && npm install && npm run build` (déjà OK, à re-vérifier).
- [ ] Déployer les **security rules** : `firebase deploy --only firestore:rules`.
- [ ] Déployer l'**API** : `firebase deploy --only functions` → noter l'URL de prod.
- [ ] **Seed des équipes** : `npm run seed:teams` (32 équipes → `catalog/teams`).
- [ ] **Import des joueurs** : `npm run import:players -- ./scripts/players.csv`.
      - [ ] ⚠️ **Vérifier/mettre à jour le CSV** pour la saison 2026/27 (trades, rookies, retraites — le CSV reflète 2025).
- [ ] Test santé : appeler `GET /config/engines` avec un token → doit renvoyer le catalogue.

## Étape 2 — Vérifier la boucle de jeu via l'API (1-2 h) · [Toi]
> Dérouler le workflow hebdo avec Postman/Insomnia (importer `docs/openapi.yaml`). Utiliser 2-3 comptes de test.
- [ ] `POST /leagues` → créer une ligue de test (tu deviens OWNER).
- [ ] `POST /leagues/:lid/seasons` → créer la saison 2026/27.
- [ ] Faire rejoindre 2-3 joueurs de test (`POST /leagues/:lid/join`) + `POST .../participants`.
- [ ] `POST .../weeks/1/matches` → créer les ~16 matchs de la semaine.
- [ ] `POST .../weeks/1/bonuses` → activer 1-2 bonus (ex. `TEAM_WAGER`, `PLAYER_STAT_PICKS`).
- [ ] `POST .../weeks/1/open` (avec `deadlineAt`) → les joueurs peuvent soumettre.
- [ ] `PUT .../entries/1` pour chaque joueur test.
- [ ] `POST .../weeks/1/lock` → vérifier la **révélation** (grilles lisibles).
- [ ] `PUT .../matches/:mid/result` pour chaque match.
- [ ] `GET .../weeks/1/stat-todo` puis `PUT .../weeks/1/stats-override`.
- [ ] `POST .../weeks/1/score` → vérifier `scores` + `standings` corrects.
- [ ] **Tester un moteur de bonus** avec un exemple chiffré du règlement (ex. RB Death Match) et vérifier le calcul.

## Étape 3 — Front : fondations (2-3 j) · [Dev]
- [ ] Init projet **Next.js (App Router) + TypeScript** + Tailwind.
- [ ] Intégrer le **design system** (couleurs/typos du design : voir `docs/design-source.readable.html`).
- [ ] `lib/firebase.ts` (config web) + `lib/api.ts` (fetch + ID token) — snippets dans `docs/06 §1`.
- [ ] **Auth Firebase** : login Google/e-mail, récupération de l'ID token, garde de route.
- [ ] Sélecteur de ligue + garde de rôle (`members/{uid}.role`).
- [ ] **Hooks de lecture typés** (temps réel) : `useCurrentWeek`, `useMatches`, `useWeekBonuses`, `useMyEntry`, `useStandings` (Firestore `onSnapshot`).
- [ ] Précharger/cacher `catalog/teams` et `catalog/players` (autocomplete).

## Étape 4 — Front : écrans, par ordre de priorité (1-2 sem) · [Dev]
> Référence de câblage complète : `docs/06-design-to-api-map.md`.
- [ ] **Onboarding** (rejoindre/créer une ligue, pseudo).
- [ ] **Dashboard** (état semaine, compte à rebours, mon rang/points, aperçu bonus).
- [ ] **Grille de pronos** (LE cœur) :
  - [ ] liste des matchs + sélection du vainqueur + progression ;
  - [ ] **rendu DYNAMIQUE des bonus** : itérer sur `bonuses`, un widget par `type` (mapping `docs/03 §6`). **Ne pas coder les bonus en dur.**
  - [ ] soumission `PUT entries` + gestion des erreurs (`WEEK_LOCKED`, `INVALID_BONUS_ANSWER`, `INVALID_REFERENCE`).
- [ ] **Résultats / révélation** (tableau matchs×joueurs, Game of the Week, Perfect Week, détail des bonus).
- [ ] **Classement** (podium + liste, filtres).
- [ ] Retirer de l'UI ce qui n'existe pas en v1 : **cotes/spreads** et **records** (voir `docs/06 §7`).

## Étape 5 — Console admin (en parallèle) · [Dev] + [Toi]
- [ ] Écran **config semaine** : créer matchs (coller-en-bloc), activer/paramétrer bonus via `GET /config/engines`.
- [ ] Écran **résultats** : saisir les scores.
- [ ] Écran **stats du bonus** : `GET stat-todo` → formulaire minimal → `PUT stats-override`.
- [ ] Boutons **Verrouiller** / **Calculer les scores** + affichage de l'état de la semaine.

## Étape 6 — Répétition générale (1 semaine réelle) · [2]
- [ ] Faire jouer une **vraie semaine** avec quelques amis (bêta fermée).
- [ ] Vérifier deadlines/lock/révélation en conditions réelles (fuseau `Europe/Paris`).
- [ ] Contrôler le scoring contre un calcul manuel.
- [ ] Ajuster les libellés/règles de bonus dans les configs.

---

## Plus tard (v2, non bloquant)
- [ ] **Provider API-Sports** : jobs `onSchedule` (`syncSchedule/syncResults/syncPlayerStats`) qui écrivent avec `source: "PROVIDER"` — remplir `externalId` des joueurs.
- [ ] **Vrais codes d'invitation** (collection `invites`).
- [ ] **Brouillon** de grille (endpoint `draft` ou localStorage).
- [ ] Bonus restants du catalogue non encore configurés (poules, duos, leaderboards…).
- [ ] Multi-ligue en libre-service (création de ligue par n'importe quel user) + offres FREE/PRO.
- [ ] Trash talk / notifications.

---

## État actuel (déjà fait ✅)
- Docs : architecture, prompt design, brief front, câblage design→API, OpenAPI.
- Back scaffoldé et **compile** : API REST, scoring, 14 moteurs de bonus, mode manuel (`stat-todo`/`stats-override`).
- Référentiels : script équipes + import joueurs + CSV de 258 joueurs.
- Security rules + config Firebase prêtes.
