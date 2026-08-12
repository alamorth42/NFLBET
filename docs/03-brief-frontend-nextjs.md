# NFL BET — Brief technique Front-end (Next.js)

> Destinataire : développeur front Next.js. Tu construis toute l'UI. Le back (Cloud Functions GCP + Firestore + Firebase Auth) est développé en parallèle. Ce document définit ce que tu consommes, comment, et l'architecture front attendue.
>
> Contexte métier complet : voir `01-architecture-technique.md`. Design : voir `02-prompt-design.md`.

---

## 1. Périmètre & principes

- **Le front n'écrit jamais de score.** Tout le calcul est serveur. Le front :
  - **lit** Firestore en direct (temps réel) : classement, config semaine, matchs, bonus, grilles révélées, scores publiés ;
  - **écrit** via l'**API REST** du back (créer ligue, soumettre grille, actions admin) et, pour le seul cas des **brouillons de grille**, éventuellement en écriture directe Firestore autorisée par les security rules (à confirmer avec le back — par défaut, passe par l'API).
- **Mobile-first.** La grille de pronos doit être excellente sur mobile.
- **Multi-ligue** : l'utilisateur peut appartenir à plusieurs ligues ; l'URL porte le contexte (`/l/[leagueId]/…`).
- **Rôles** : `PLAYER` vs `ADMIN/OWNER` (commissaire). Les écrans admin sont gardés côté route + côté API.

## 2. Stack front attendue

| Sujet | Choix conseillé |
|---|---|
| Framework | Next.js **App Router**, TypeScript strict |
| Auth | **Firebase Auth** (SDK client) — Google + email/lien magique |
| Data temps réel | **Firestore SDK client** (onSnapshot) pour les lectures live |
| Écritures métier | **fetch** vers l'API back avec `Authorization: Bearer <Firebase ID token>` |
| State serveur | **TanStack Query** (cache des GET API) ; Firestore listeners pour le live |
| Formulaires | **React Hook Form** + **Zod** (les schémas de réponse bonus sont fournis, cf. §6) |
| UI | Design system issu de `02-prompt-design.md` (Tailwind + composants maison recommandés) |
| Dates/TZ | **date-fns-tz** — afficher dans `league.timezone`, stocker/recevoir en UTC |

> **Auth flow** : après login Firebase, récupérer l'ID token (`getIdToken()`), le joindre à chaque appel API. Rafraîchir avant expiration. Le back valide token + rôle.

## 3. Arborescence des routes (App Router)

```
/                              → landing / redirection selon auth
/login                         → auth Firebase
/onboarding                    → créer ou rejoindre une ligue (code d'invitation)
/l                             → sélecteur de ligue (si plusieurs)
/l/[leagueId]                  → dashboard joueur (semaine en cours)
/l/[leagueId]/week/[w]         → grille de pronostics (remplir/soumettre)
/l/[leagueId]/week/[w]/results → révélation & résultats de la semaine
/l/[leagueId]/standings        → classement (général / semaine / période)
/l/[leagueId]/rules            → règles & barème de la ligue (lecture)
/l/[leagueId]/admin            → console admin (ADMIN/OWNER only)
/l/[leagueId]/admin/week/[w]   → config semaine : matchs, bonus, résultats, scoring
/join/[inviteCode]             → accepter une invitation
```

## 4. Écrans & comportements clés

### 4.1 Dashboard `/l/[leagueId]`
- Lit la **semaine courante** (`weeks` où `state ∈ {OPEN,LOCKED,SCORING,PUBLISHED}` la plus récente).
- Affiche : état + **compte à rebours** vers `deadlineAt`, mon rang (`standings/{uid}`), CTA contextuel :
  - `OPEN` → « Remplir ma grille » (badge « X/N matchs » si brouillon existant).
  - `LOCKED/SCORING` → « Grille verrouillée, résultats à venir ».
  - `PUBLISHED` → « Voir les résultats ».
- Aperçu des bonus de la semaine (titres depuis `bonuses`).

### 4.2 Grille de pronostics `/l/[leagueId]/week/[w]` — **écran central**
- Chargée seulement si `week.state == OPEN` (sinon rediriger vers results).
- Charger : `matches` de la semaine, `bonuses` actifs, mon `entry` existant (brouillon).
- **Section matchs** : une carte par match, choix du vainqueur (tap). Barre de progression.
- **Section bonus** : rendre un **widget par type de bonus** (voir §6). Le `type` du bonus détermine le composant et le schéma Zod de validation.
- **Autosave brouillon** (debounced) puis **Soumettre** (`PUT entries/:w`). Après deadline, l'API refuse (afficher « en retard, -3 »).
- Empêcher la soumission si des matchs obligatoires manquent ; les bonus `optional:true` peuvent rester vides.

### 4.3 Résultats `/l/[leagueId]/week/[w]/results`
- Visible si `state ∈ {LOCKED,PUBLISHED}`.
- **Tableau des pronos** : lignes = matchs, colonnes = joueurs, ✅/❌ selon `match.result` + `entry.gamePicks`. Les grilles ne sont lisibles qu'après lock (les security rules le garantissent — ne pas tenter de lire avant).
- Mettre en avant : **Game of the Week** (`week.gotwMatchId`), **Perfect Weeks** (`scores.perfectWeek`), breakdown des **bonus** (`scores.bonusBreakdown`) et **pénalités**.

### 4.4 Classement `/l/[leagueId]/standings`
- Lecture live de `standings/*` triée par `totalPoints`. Podium + liste dense, evolution ▲▼ via `perWeek`.
- Filtres : général / cette semaine (`scores` de la semaine) / période.

### 4.5 Console Admin — **saisie 100 % manuelle en v1 (pas de synchro auto)**
- Gardée par rôle (lire `members/{uid}.role`).
- Actions = appels API (§5). En v1, l'admin saisit tout à la main ; soigne la rapidité de saisie. Sous-écrans :
  - **Configurer la semaine** : ajouter les matchs (saisie ligne à ligne **ou coller-en-bloc**), puis paramétrer le(s) bonus depuis le **catalogue de moteurs** (`GET /config/engines` renvoie types + schémas de config à rendre en **formulaire dynamique**). Bouton « Ouvrir ».
  - **Saisir les résultats** : score domicile/extérieur par match → le back déduit le vainqueur.
  - **Saisir les stats du bonus (écran clé)** : après le lock, appeler **`GET /…/weeks/:w/stat-todo`** qui renvoie **exactement** la liste des cases à remplir (entité + `statKey` + libellé), calculée à partir des grilles soumises. Rendre un formulaire minimal (une poignée de champs) + checklist de progression. Soumettre via `PUT /…/weeks/:w/stats-override`.
  - **Piloter** : machine à états (À venir → Ouverte → Verrouillée → Publiée), boutons « Verrouiller » et « Calculer les scores » (recalculable après correction).
- Le connecteur provider (synchro auto) est **hors périmètre v1** côté front : ne pas prévoir d'écran de sync, seulement la saisie manuelle.

## 5. Contrat API (ce que tu appelles)

Base URL fournie par le back (ex. `https://api-….run.app`). Toujours `Authorization: Bearer <idToken>`. Réponses JSON `{ data }` ou `{ error }`.

| Méthode | Route | Body (extrait) | Usage front |
|---|---|---|---|
| POST | `/leagues` | `{ name, timezone }` | Onboarding créer ligue |
| POST | `/leagues/:lid/invites/:code/accept` | `{ displayName }` | Rejoindre |
| PUT | `/leagues/:lid/seasons/:sid/entries/:w` | `{ gamePicks, bonusAnswers }` | **Soumettre la grille** |
| GET | `/config/engines` | — | Rendu dynamique des formulaires de config admin |
| POST | `/leagues/:lid/seasons/:sid/weeks/:w/bonuses` | `{ type, title, config, optional }` | Admin : ajouter un bonus |
| PUT | `/…/matches/:mid/result` | `{ homeScore, awayScore }` | Admin : saisir résultat |
| GET | `/…/weeks/:w/stat-todo` | — | Admin : cases de stats à remplir (mode manuel v1) |
| PUT | `/…/weeks/:w/stats-override` | `{ stats: [...] }` | Admin : saisir les stats du bonus |
| POST | `/…/weeks/:w/lock` | — | Admin : verrouiller |
| POST | `/…/weeks/:w/score` | — | Admin : calculer scores |

> Le back renvoie des erreurs métier typées (`WEEK_LOCKED`, `PAST_DEADLINE`, `INVALID_BONUS_ANSWER`, `FORBIDDEN`) → mappe-les vers des messages UI clairs.

## 6. Schémas des réponses bonus (payload `bonusAnswers[bonusId]`)

> Le `type` du bonus (dans le doc `bonuses/{id}`) détermine le widget **et** le schéma. Valide côté front en Zod (le back re-valide). Voici les schémas de saisie par type.

```ts
// 5. TEAM_WAGER (Melvyn / Quitte ou Double)
{ teamId?: string }                       // optionnel si config.optional

// 7. PLAYER_STAT_PICKS (Trust Your WR, Choose Your Champ, Dumpster, National TE Day)
//   - entity PLAYER :
{ players: string[] }                     // playerIds, longueur ∈ [selMin, selMax]
//   - entity MATCH_TE (National TE Day) :
{ matches: string[] }                     // matchIds, exactement 3

// 8. STAT_LEADERBOARD (RB Death Match Duos)
{ players: string[] }                     // exactement selectionCount (2)

// 9. MATCH_THE_LEADER (Kickerz)
{ playerId: string }

// 10. TEAM_STAT_QUESTIONS (Puntos)
{ answers: Record<string /*questionId*/, string /*teamId*/> }

// 12. DUO_COMPETITION (Destins Liés)
{ participate: boolean }

// 13. LINKED_PARLAY (Thanksgiving Combine)
{ picks: Record<string /*matchId*/, string /*teamId*/> }

// 14. CUMULATIVE_COMBO (Combinaison Parfaite)
{ items: Record<string /*itemId*/, { QB_HOME: "YES"|"NO", QB_AWAY: "YES"|"NO" }> }
```

> Les types **2 PERFECT_WEEK, 3 GAME_OF_THE_WEEK, 4 PERIOD_LEADER, 6 UPSET, 11 POOL_COMPETITION** sont **dérivés** (pas de saisie joueur) : rien à afficher dans le formulaire, mais à **restituer** dans l'écran résultats.

### Widgets à construire (mapping type → composant)
| Type bonus | Widget |
|---|---|
| `TEAM_WAGER` | Sélecteur d'1 équipe + note « pari risqué » |
| `PLAYER_STAT_PICKS` (PLAYER) | Autocomplete joueurs, chips (Prénom NOM + team), min/max |
| `PLAYER_STAT_PICKS` (MATCH_TE) | Sélection de 3 matchs (checkboxes limitées) |
| `STAT_LEADERBOARD` | Autocomplete joueurs, exactement N |
| `MATCH_THE_LEADER` | Autocomplete 1 joueur |
| `TEAM_STAT_QUESTIONS` | N questions, 1 sélecteur d'équipe chacune |
| `DUO_COMPETITION` | Toggle « je participe » |
| `LINKED_PARLAY` | Mini-grille de K matchs |
| `CUMULATIVE_COMBO` | Par match : 2 toggles OUI/NON, items ordonnés |

## 7. Lecture directe Firestore (temps réel)

Collections lues en `onSnapshot` (pas via API) :
- `leagues/{lid}/seasons/{sid}/weeks/{w}` — état + deadlines.
- `…/matches` (filtré par `week`) — cartes + résultats.
- `…/bonuses` (filtré par `week`) — config à afficher.
- `…/standings/*` — classement.
- `…/scores/{uid}_W..` — mes scores / résultats publiés.
- `…/entries/*` — **seulement** après lock (les rules bloquent avant). Mon propre `entry` : lisible en `OPEN`.
- `catalog/teams`, `catalog/players` — référentiels (autocomplete, logos). Peuvent être préchargés/caches.

> Prévois un helper `useLeaguePath(leagueId, seasonId)` et des hooks typés (`useWeek`, `useMatches`, `useStandings`, `useMyEntry`). Type toutes les collections avec des converters Firestore.

## 8. Détails UX importants (issus des règles)

- **Grilles cachées avant lock** : ne jamais afficher les pronos des autres tant que `state == OPEN`. C'est aussi verrouillé côté sécurité — ne pas contourner.
- **Compte à rebours deadline** visible partout pendant `OPEN` ; passer l'UI en lecture seule dès la deadline.
- **Bonus « secret »** : rappeler dans l'UI qu'annoncer un bonus dans le chat avant révélation = -3 (simple texte d'avertissement).
- **Format joueur imposé** : dans les autocompletes, toujours afficher **Prénom + NOM + TEAM** (les règles l'exigent pour lever les ambiguïtés).
- **États semaine** : refléter fidèlement `UPCOMING/OPEN/LOCKED/SCORING/PUBLISHED` (badges + CTA).
- **Retard** : si `entry.state == LATE`, afficher la pénalité -3 dans les résultats.
- **Optionnel vs obligatoire** : les matchs sont tous obligatoires ; certains bonus sont optionnels (`config.optional`), ne pas bloquer la soumission dessus.

## 9. Découpage de livraison front (aligné back)

1. Auth + onboarding + sélecteur de ligue + garde de rôle.
2. Dashboard + lecture semaine/matchs/standings (live).
3. **Grille de pronos** (matchs seuls) + soumission + états semaine.
4. Écran résultats (matchs) + classement complet.
5. **Widgets bonus** (les 9 widgets §6) — itérer type par type.
6. Console admin (config semaine, catalogue bonus via `/config/engines`, saisie résultats, scoring).

## 10. Ce dont tu as besoin du back pour démarrer
- Base URL de l'API + spec OpenAPI (ou au moins les payloads/erreurs des routes §5).
- Config Firebase (projet, clés web) + règles de sécurité en place (pour tester les lectures live).
- Un **jeu de données de démo** : 1 ligue, 1 saison, 1 semaine `OPEN` avec matchs + 2-3 bonus de types différents, + 1 semaine `PUBLISHED` avec scores → pour développer les écrans grille et résultats en parallèle du back.
- Le référentiel `catalog/teams` et `catalog/players` (au moins partiel) pour les autocompletes.
```
