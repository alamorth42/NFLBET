# NFL BET — Document technique (Architecture & Back-end)

> Destinataire : toi (fondateur / back-end GCP Functions).
> Objectif : cadrer la construction du SaaS — modèle de données Firestore, moteur de bonus configurable, cycle de vie hebdomadaire, scoring, ingestion des résultats, sécurité et API.

---

## 0. Compréhension du jeu (résumé de référence)

Jeu de pronostics NFL entre amis, décliné en **ligues**.

- **Durée** : Week 1 → 18 (saison régulière, hors playoffs).
- **Base** : chaque participant pronostique le **vainqueur de tous les matchs** de la semaine. `1 pt` par bon prono.
- **Bonus** : couche de points supplémentaires, activée à partir de la Week 4 (variable selon la ligue). Très hétérogènes (voir §5).
- **Cycle** : mardi (classement + formulaire) → jeudi 12h (deadline d'envoi) → révélation des grilles → résultats → scoring.
- **Pénalités** : `-3 pts` si formulaire en retard ; `-3 pts` si un joueur divulgue un bonus dans le chat avant révélation.
- **Grilles cachées** : les pronos d'un joueur ne sont visibles des autres qu'après la **révélation** (lock de la semaine).
- **Argent : HORS PÉRIMÈTRE DU SAAS.** Pas de gestion de cagnotte, pas de paiement, pas de reversement (pas d'agrément). Le SaaS peut afficher un buy-in **à titre informatif** et la répartition théorique des gains, mais ne manipule aucun flux financier.

### Contraintes produit clés
1. **Maniabilité** : les règles (points, deadlines, pénalités) et surtout **les bonus** doivent être configurables par ligue, sans redéploiement.
2. **Multi-ligue (multi-tenant)** dès le départ : un owner crée sa ligue, invite des membres, configure ses règles.
3. **Déclinable** à d'autres sports/ligues à terme (le modèle ne doit pas être NFL-only dans sa structure, même si le catalogue de bonus est NFL au départ).

---

## 1. Stack & architecture générale

| Couche | Choix | Rôle |
|---|---|---|
| Front | **Next.js** (App Router) + TypeScript | UI joueurs & admin, hébergé sur Vercel ou Firebase Hosting |
| Auth | **Firebase Auth** | Email/lien magique + Google. Source des `uid` |
| Base | **Cloud Firestore** (mode natif) | Données temps réel (pronos, classements) |
| Back / logique | **Cloud Functions GCP** (2nd gen) ou **Cloud Run** | API métier, scoring, ingestion, jobs planifiés |
| Jobs | **Cloud Scheduler** + Pub/Sub | Lock des semaines, sync résultats, calcul classement |
| Fichiers | Firebase Storage (optionnel) | Avatars, logos de ligue |
| Data NFL | **Provider externe** (ESPN API / SportsData.io / api-sports) | Matchs, scores, stats joueurs (TD, yards, INT, FG) |

**Répartition du travail**
- **Front (dev Next.js)** : toute l'UI, consomme l'API REST du back + lit Firestore en direct (lecture temps réel du classement/pronos révélés). Voir `03-brief-frontend-nextjs.md`.
- **Back (toi)** : Cloud Functions exposant une **API REST**, règles de sécurité Firestore, moteur de scoring, ingestion provider. Le front n'écrit **jamais** de score : il écrit uniquement des brouillons/soumissions de pronos, tout le calcul est serveur.

### Principe d'architecture central
> **Firestore = source de vérité lisible ; Cloud Functions = seul écrivain des données sensibles (scores, statuts, résultats).**
> Le front lit beaucoup en direct (temps réel) mais écrit peu, et uniquement via l'API ou sur des documents que les security rules autorisent (ses propres brouillons de pronos avant lock).

---

## 2. Modèle multi-tenant

```
users/{uid}                         ← profil global (cross-ligues)
leagues/{leagueId}                  ← une ligue = un tenant
  members/{uid}                     ← appartenance + rôle
  invites/{inviteId}                ← invitations en attente
  seasons/{seasonId}                ← une saison (2025/26…)
    weeks/{weekId}                  ← W1..W18 + statut/état
    matches/{matchId}               ← matchs NFL de la saison
    bonuses/{bonusId}               ← instances de bonus configurées par semaine
    entries/{entryId}               ← 1 grille = 1 participant × 1 semaine
    scores/{scoreId}                ← résultat calculé par participant × semaine
    standings/{uid}                 ← cumul saison (classement)
catalog/                            ← données de référence partagées (read-only)
  teams/{teamId}                    ← 32 équipes NFL
  players/{playerId}                ← joueurs (pour l'autocomplete des bonus)
  playerStats/{season_week}/...     ← stats hebdo ingérées (voir §6)
```

Un `uid` peut appartenir à plusieurs ligues (via `members`). Le profil `users/{uid}` est global ; l'identité **dans une ligue** (pseudo, rôle) vit dans `members`.

---

## 3. Modèle de données Firestore (détaillé)

> Convention : `Timestamp` = Firestore Timestamp. Tous les montants monétaires sont **informatifs**. IDs en `camelCase`. Enums en `SNAKE_CASE`.

### 3.1 `users/{uid}`
```jsonc
{
  "displayName": "Maéric",
  "email": "maeric@…",
  "photoURL": "https://…",
  "leagueIds": ["lg_abc"],          // dénormalisé pour lister ses ligues
  "createdAt": Timestamp
}
```

### 3.2 `leagues/{leagueId}`
```jsonc
{
  "name": "NFL BET",
  "sport": "NFL",
  "ownerUid": "uid_1",
  "logoURL": null,
  "plan": "FREE",                    // FREE | PRO (monétisation future)
  "timezone": "Europe/Paris",
  "buyInInfo": {                     // PUREMENT INFORMATIF (pas de paiement)
    "enabled": true,
    "amount": 20, "currency": "EUR",
    "payoutSplit": [0.70, 0.20, 0.10]
  },
  "rules": {                         // config globale de la ligue (voir §4)
    "pointsPerCorrectPick": 1,
    "latePenalty": -3,
    "leakPenalty": -3,
    "lockPolicy": "FIRST_KICKOFF",   // FIRST_KICKOFF | FIXED_DEADLINE
    "deadline": { "dayOfWeek": 4, "hour": 12, "minute": 0 }, // jeudi 12h si FIXED
    "revealPolicy": "ON_LOCK"        // ON_LOCK | ON_ALL_SUBMITTED
  },
  "createdAt": Timestamp
}
```

### 3.3 `leagues/{leagueId}/members/{uid}`
```jsonc
{
  "displayName": "Maéric",           // pseudo dans CETTE ligue
  "role": "OWNER",                   // OWNER | ADMIN | PLAYER
  "status": "ACTIVE",                // INVITED | ACTIVE | REMOVED
  "joinedAt": Timestamp
}
```
> `OWNER`/`ADMIN` = commissaire : configure semaines/bonus, saisit résultats. `PLAYER` = participant.

### 3.4 `…/seasons/{seasonId}`
```jsonc
{
  "name": "2025/26",
  "startWeek": 1, "endWeek": 18,
  "status": "ACTIVE",                // DRAFT | ACTIVE | ARCHIVED
  "participants": ["uid_1","uid_2"], // inscrits à la saison
  "createdAt": Timestamp
}
```

### 3.5 `…/seasons/{seasonId}/weeks/{weekId}`  (weekId = `"W07"`)
```jsonc
{
  "number": 7,
  "state": "OPEN",                   // machine à états, voir §7
  "formOpenAt": Timestamp,           // mardi 12h
  "deadlineAt": Timestamp,           // jeudi 12h (ou 1er kickoff)
  "lockedAt": null,
  "publishedAt": null,
  "bonusIds": ["bn_cagefight_w7"],   // bonus actifs cette semaine
  "gotwMatchId": null                // match "Game of the Week" (auto/défini au lock)
}
```

### 3.6 `…/seasons/{seasonId}/matches/{matchId}`
```jsonc
{
  "week": 7,
  "homeTeamId": "KC", "awayTeamId": "BUF",
  "kickoffAt": Timestamp,
  "externalId": "espn_401…",         // clé provider pour la sync
  "status": "SCHEDULED",             // SCHEDULED | IN_PROGRESS | FINAL
  "result": {                        // rempli à la clôture
    "homeScore": 24, "awayScore": 21,
    "winnerTeamId": "KC",            // ou "TIE"
    "margin": 3
  }
}
```

### 3.7 `…/seasons/{seasonId}/entries/{entryId}`  (entryId = `"{uid}_W07"`)
> **Le document le plus important.** 1 grille par joueur et par semaine.
```jsonc
{
  "uid": "uid_1",
  "week": 7,
  "state": "SUBMITTED",              // DRAFT | SUBMITTED | LATE | LOCKED
  "submittedAt": Timestamp,
  "gamePicks": {                     // matchId -> teamId pronostiqué vainqueur
    "m_kc_buf": "KC",
    "m_dal_phi": "PHI"
  },
  "bonusAnswers": {                  // bonusId -> payload (schéma dépend du type, voir §5)
    "bn_cagefight_w7": { /* selon type */ }
  },
  "flags": {
    "leaked": false                  // divulgation bonus (-3), posé par admin
  }
}
```
> **Sécurité de la révélation** : tant que la semaine n'est pas `LOCKED/PUBLISHED`, un joueur ne peut lire QUE son propre `entry`. Les security rules l'imposent (§8). Après lock, tout le monde lit tout.

### 3.8 `…/seasons/{seasonId}/scores/{scoreId}`  (scoreId = `"{uid}_W07"`)
> **Écrit uniquement par le back** (Cloud Function de scoring).
```jsonc
{
  "uid": "uid_1", "week": 7,
  "gamePoints": 11,                  // bons pronos × pointsPerCorrectPick
  "correctPicks": 11, "totalPicks": 14,
  "perfectWeek": false,
  "bonusBreakdown": [                // traçabilité par bonus
    { "bonusId": "bn_cagefight_w7", "type": "POOL_COMPETITION", "points": 3, "detail": "1er de la poule B" }
  ],
  "penalties": [
    { "type": "LATE", "points": -3 }
  ],
  "weekTotal": 11,                   // gamePoints + bonus + penalties
  "computedAt": Timestamp
}
```

### 3.9 `…/seasons/{seasonId}/standings/{uid}`
> Cumul, recalculé après chaque scoring. Sert au classement temps réel.
```jsonc
{
  "uid": "uid_1",
  "displayName": "Maéric",
  "totalPoints": 78,
  "rank": 1,
  "perWeek": { "W01": 9, "W02": 7, /* … */ },
  "updatedAt": Timestamp
}
```

---

## 4. Configuration des règles (le « maniable »)

Deux niveaux de configuration, tous deux **modifiables par l'admin sans déploiement** :

1. **Règles globales de ligue** → `leagues/{id}.rules` (§3.2) : points par prono, pénalités, politique de lock/révélation, deadline.
2. **Bonus par semaine** → documents `bonuses/{bonusId}` instanciés depuis un **catalogue de moteurs** (§5).

Chaque bonus est une **instance** d'un **moteur** (`type`) + une **config** (`config`). L'admin compose le calendrier des bonus de sa saison en piochant dans le catalogue. C'est ce qui rend le jeu déclinable : une autre ligue peut activer d'autres bonus, changer les points, désactiver les stats joueurs, etc.

### 3.x `…/seasons/{seasonId}/bonuses/{bonusId}`
```jsonc
{
  "week": 7,
  "type": "POOL_COMPETITION",        // clé du moteur (voir catalogue §5)
  "title": "Cage Fight",
  "optional": false,                 // le joueur peut-il ne pas répondre ?
  "config": { "poolSize": 4, "firstPlacePoints": 3, "tieRule": "SHARED_ZERO" },
  "state": "ACTIVE",                 // DRAFT | ACTIVE | RESOLVED
  "runtime": {                       // données calculées au moment de la résolution
    "pools": { "A": ["uid_1","uid_2"], "B": ["uid_3","uid_4"] }
  },
  "resolvedAt": null
}
```

---

## 5. Le moteur de bonus (catalogue d'archétypes)

> **C'est le cœur du système.** Plutôt que coder chaque bonus « en dur », on définit un **catalogue de ~14 moteurs** paramétrables. Chaque moteur = (1) un **schéma de réponse** (ce que le joueur saisit), (2) un **schéma de config** (ce que l'admin règle), (3) une **fonction de résolution** `resolve(entries, config, results, stats) -> points par uid`.
>
> Tous les bonus des règles NFL BET 2025/26 et 2026/27 se ramènent à ces 14 moteurs. Ajouter un nouveau bonus = ajouter un moteur (rare) ou instancier un moteur existant avec une nouvelle config (courant).

### Vue d'ensemble

| # | Moteur (`type`) | Couvre (bonus du doc) | Saisie joueur | Inputs requis |
|---|---|---|---|---|
| 1 | `GAME_PICKS` | Base (tous les matchs) | 1 vainqueur / match | résultats matchs |
| 2 | `PERFECT_WEEK` | Perfect Week | — (méta, dérivé) | résultats matchs |
| 3 | `GAME_OF_THE_WEEK` | Game of the Week | — (dérivé des votes) | votes + résultats |
| 4 | `PERIOD_LEADER` | WW3 | — (dérivé du classement) | scores W1-3 |
| 5 | `TEAM_WAGER` | Melvyn, Quitte ou Double | 1 équipe (option.) | résultats + votes |
| 6 | `UPSET` | Upset | — (dérivé des picks base) | résultats + forme équipes |
| 7 | `PLAYER_STAT_PICKS` | QB Death Match/Trust Your WR, Choose Your Champ, Dumpster Battle, National TE Day | 1..N joueurs / matchs | stats joueurs |
| 8 | `STAT_LEADERBOARD` | RB Death Match Duos | K joueurs | stats joueurs |
| 9 | `MATCH_THE_LEADER` | Kickerz | 1 joueur nommé | stats joueurs (leaderboard) |
| 10 | `TEAM_STAT_QUESTIONS` | Puntos | 1 équipe / question | stats équipes |
| 11 | `POOL_COMPETITION` | Cage Fight | — (score hebdo) | scores hebdo |
| 12 | `DUO_COMPETITION` | Destins Liés | opt-in | scores hebdo |
| 13 | `LINKED_PARLAY` | Thanksgiving Combine | picks sur K items | résultats |
| 14 | `CUMULATIVE_COMBO` | Combinaison Parfaite | OUI/NON × items ordonnés | stats joueurs (INT) |

> **Mécaniques transverses réutilisables** (flags de config, pas des moteurs séparés) :
> - `dedupe: "ELIMINATE"` → une sélection choisie par ≥2 joueurs est éliminée pour tous (Death Match, Champ, Dumpster).
> - `uniquenessBonus` → sole picker vs shared picker (Melvyn, Quitte ou Double, Kickerz).
> - `cap` → plafond de points (souvent 3).
> - `allOrNothing` → une seule erreur = 0 (Trust Your WR, Thanksgiving).

### Détail des moteurs

#### 1. `GAME_PICKS` — pronostics de base
- **Config** : `{ pointsPerCorrect: 1 }`
- **Réponse** : `gamePicks: { matchId: teamId }` (dans l'`entry`, pas un bonus à part).
- **Résolution** : `+pointsPerCorrect` par match où `pick == result.winnerTeamId`.

#### 2. `PERFECT_WEEK` — semaine parfaite
- **Config** : `{ points: 10, includeGOTW: true, includeBonusQuestions: false }`
- **Résolution** : si `correctPicks == totalPicks` (matchs uniquement, hors questions bonus) → `+points`.

#### 3. `GAME_OF_THE_WEEK` — match le plus contesté
- **Config** : `{ points: 2, tieBreak: "MANUAL_VOTE" | "ADMIN" }`
- **Résolution** :
  1. Au lock, calculer pour chaque match le split des votes ; le GOTW = match dont le split est le plus proche de 50/50.
  2. Égalité → `tieBreak` (vote du groupe ou choix admin) ; stocker dans `weeks.gotwMatchId`.
  3. Joueurs ayant pické le vainqueur du GOTW → `+points`.
- **Input** : nécessite les votes agrégés (donc après lock).

#### 4. `PERIOD_LEADER` — leader sur une période (WW3)
- **Config** : `{ fromWeek: 1, toWeek: 3, points: 3, award: "LEADERS" }`
- **Résolution** : à la fin de `toWeek`, le(s) 1er(s) au cumul sur `[from,to]` → `+points`. Ex æquo tous récompensés.

#### 5. `TEAM_WAGER` — pari sur une équipe (Melvyn / Quitte ou Double)
- **Config** :
  ```jsonc
  { "optional": true,
    "soleWinPoints": 2, "sharedWinPoints": 0, "losePoints": 0 }
  ```
  - Melvyn = `{ sole:+2, shared:0, lose:0 }`
  - Quitte ou Double = `{ optional:true, sole:+2, shared:+1, lose:-1 }`
- **Réponse** : `{ teamId }` (ou vide si optionnel non joué).
- **Résolution** : si l'équipe gagne → sole vs shared selon le nb de joueurs l'ayant choisie ; si elle perd → `losePoints`.

#### 6. `UPSET` — surprise
- **Config** : `{ points: 2, betOnWinless: true, betAgainstUndefeated: true }`
- **Résolution** (dérivé des picks de base) : `+points` si le joueur a pické une équipe **sans victoire** qui gagne, OU pické **contre** une équipe **invaincue** qui perd. Nécessite l'état de forme (bilans) des équipes avant la semaine → dérivable de `standings` équipes ou du provider.

#### 7. `PLAYER_STAT_PICKS` — sélection de joueurs qui doivent performer
> Le moteur le plus polyvalent. Couvre WR/TD, Champ, Dumpster, National TE Day.
- **Config** :
  ```jsonc
  {
    "selectionMin": 1, "selectionMax": 3,
    "entity": "PLAYER" | "MATCH_TE",       // joueur nommé, ou "un TE de ce match"
    "statKey": "ANY_TD" | "RECEIVING_TD" | "PASSING_INT" | "TE_TD_IN_MATCH",
    "threshold": 1,
    "scoring": "GATED_EACH" | "COUNT_CAPPED",
    "pointsPerHit": 1, "cap": 3,
    "dedupe": "NONE" | "ELIMINATE",
    "twoPointConvCounts": false
  }
  ```
  - **Trust Your WR / QB Death Match (WR)** : `selection 1..3, statKey ANY_TD, threshold 1, scoring GATED_EACH (tous doivent scorer sinon 0), pointsPerHit 1, cap 3, dedupe NONE`.
  - **Choose Your Champ** : `selection 1, entity PLAYER (offensif hors QB), statKey ANY_TD, scoring COUNT_CAPPED (points = min(TD,3)), dedupe ELIMINATE`.
  - **Dumpster Battle** : `selection 1, entity PLAYER (QB), statKey PASSING_INT, scoring COUNT_CAPPED cap 3, dedupe ELIMINATE`.
  - **National TE Day** : `selection exactly 3 (min=max=3), entity MATCH_TE, statKey TE_TD_IN_MATCH, scoring GATED_EACH (les 3 matchs doivent avoir un TD de TE), points=3 global (all-or-nothing)`.
- **Résolution** : appliquer dedupe (élimination des sélections partagées) → évaluer la stat de chaque sélection restante → agréger selon `scoring` → plafonner à `cap`.

#### 8. `STAT_LEADERBOARD` — compétition sur cumul de stat (RB Death Match Duos)
- **Config** : `{ selectionCount: 2, statKey: "RUSHING_YARDS", dedupe: "ELIMINATE", aggregate: "SUM", award: { "1": 3 } }`
- **Réponse** : `{ players: [playerId, playerId] }`.
- **Résolution** : éliminer les joueurs choisis par ≥2 participants → sommer la stat des restants pour chaque participant → classer → attribuer `award` au(x) meilleur(s).

#### 9. `MATCH_THE_LEADER` — nommer le leader d'une stat (Kickerz)
- **Config** : `{ statKey: "FG_LONGEST", solePoints: 3, sharedPoints: 1, fallbackChain: true }`
- **Réponse** : `{ playerId }` (le joueur qu'on pense être le leader).
- **Résolution** : construire le leaderboard réel de la stat → si personne n'a nommé le n°1 et `fallbackChain`, descendre au n°2, etc. → le(s) joueur(s) ayant nommé la 1ʳᵉ ligne trouvée : `solePoints` si seul, `sharedPoints` si plusieurs.

#### 10. `TEAM_STAT_QUESTIONS` — questions par équipe (Puntos)
- **Config** :
  ```jsonc
  { "cap": 3, "questions": [
    { "id": "most_pts", "metric": "TEAM_POINTS_SCORED", "extreme": "MAX", "points": 1 },
    { "id": "least_conceded", "metric": "TEAM_POINTS_CONCEDED", "extreme": "MIN", "points": 1 },
    { "id": "smallest_win_margin", "metric": "WINNING_MARGIN", "extreme": "MIN_AMONG_WINNERS", "points": 1 }
  ]}
  ```
- **Réponse** : `{ answers: { most_pts: teamId, … } }`.
- **Résolution** : calculer le/les gagnant(s) de chaque métrique (plusieurs équipes possibles = bonne réponse) → `+points` par bonne réponse, plafonné à `cap`.

#### 11. `POOL_COMPETITION` — poules (Cage Fight)
- **Config** : `{ poolSize: 4, firstPlacePoints: 3, tieRule: "SHARED_ZERO" }`
- **Résolution** : répartir les participants en poules (stocké dans `runtime.pools`, tirage géré à la config) → dans chaque poule, comparer le **score hebdo** → 1er de poule `+firstPlacePoints`. `tieRule SHARED_ZERO` = si égalité de fiche avec un adversaire de la poule → 0.

#### 12. `DUO_COMPETITION` — duos (Destins Liés)
- **Config** : `{ optIn: true, drawAt: Timestamp, rankPoints: { "1": 3, "2": 1, "last": -1 } }`
- **Réponse** : `{ participate: true }` (semaine N-1) ; les duos sont tirés par l'admin.
- **Résolution** : additionner les scores hebdo des deux membres → classer les duos → appliquer `rankPoints` (chaque membre du duo reçoit les points).

#### 13. `LINKED_PARLAY` — parlay tout-ou-rien (Thanksgiving Combine)
- **Config** : `{ matchIds: [...], allCorrectPoints: 3 }` (ou `itemsCount` si sous-ensemble choisi par le joueur).
- **Réponse** : `{ picks: { matchId: teamId } }`.
- **Résolution** : tous corrects → `+allCorrectPoints`, sinon `0`.

#### 14. `CUMULATIVE_COMBO` — combos ordonnés cumulatifs (Combinaison Parfaite)
- **Config** :
  ```jsonc
  { "cap": 3, "ordered": true, "optionalItems": true,
    "items": [
      { "id": 1, "matchId": "m_ind_jax", "predicates": [
        { "subject": "QB_HOME", "statKey": "PASSING_INT", "op": ">=1", "answerType": "YES_NO" },
        { "subject": "QB_AWAY", "statKey": "PASSING_INT", "op": ">=1", "answerType": "YES_NO" } ] },
      { "id": 2, "matchId": "…" }, { "id": 3, "matchId": "…" }
    ] }
  ```
- **Réponse** : `{ items: { "1": { QB_HOME: "YES", QB_AWAY: "NO" }, … } }`.
- **Résolution** : un item est « bon » si **toutes** ses prédictions sont correctes. Points cumulatifs **dans l'ordre** : +1 si item1 bon, +2 si 1&2, +3 si 1&2&3 (s'arrête à la 1ʳᵉ rupture). Gère le **remplaçant** : si un QB titulaire ne joue pas, le back doit rattacher la stat au remplaçant (règle d'ingestion).

### Contrat commun d'un moteur (côté back)
```ts
interface BonusEngine<Cfg, Answer> {
  type: string;
  answerSchema: ZodSchema<Answer>;        // valide la saisie joueur
  configSchema: ZodSchema<Cfg>;           // valide la config admin
  requiredInputs: InputKind[];            // MATCH_RESULTS | PLAYER_STATS | TEAM_STATS | WEEK_SCORES | VOTES
  resolve(ctx: {
    config: Cfg;
    entries: Array<{ uid: string; answer: Answer }>;
    results: MatchResults;
    playerStats: PlayerStatsIndex;
    teamStats: TeamStatsIndex;
    weekScores: Record<string, number>;   // pour pool/duo
    votes: VoteAggregate;                  // pour GOTW/uniqueness
  }): Record<string /*uid*/, { points: number; detail: string }>;
}
```
> Le registre `engines: Record<type, BonusEngine>` est chargé par la Cloud Function de scoring. Ajouter un moteur = enregistrer une entrée. Instancier un bonus = créer un doc `bonuses/{id}` avec `type` + `config` validée par `configSchema`.

---

## 6. Ingestion des résultats & stats (provider + override admin)

**Cible : provider externe + correction manuelle admin.** En **v1**, on démarre en **100 % manuel** (voir §6.5) ; le provider est une brique **v2** non bloquante. Le modèle de données est identique dans les deux cas (`source: MANUAL | PROVIDER`).

### 6.1 Sources & clés
- Chaque `match` porte un `externalId` (clé provider) posé à la création du calendrier.
- Chaque `player` du `catalog` porte un `externalId`.

### 6.2 Jobs de synchronisation (Cloud Scheduler → Function)
- `syncSchedule` (pré-saison / hebdo) : crée/maj les `matches` de la semaine.
- `syncResults` (chaque nuit pendant la semaine NFL) : maj `matches.result` + `status FINAL`.
- `syncPlayerStats` (post-matchs) : écrit `catalog/playerStats/{season_week}/players/{playerId}` avec les stats normalisées.

### 6.3 Modèle de stats normalisé
```jsonc
// catalog/playerStats/{seasonId}_W07/players/{playerId}
{
  "playerId": "p_jefferson",
  "teamId": "MIN",
  "week": 7,
  "stats": {
    "ANY_TD": 1, "RECEIVING_TD": 1, "RUSHING_TD": 0,
    "RUSHING_YARDS": 12, "PASSING_INT": 0,
    "FG_MADE": [], "FG_LONGEST": null,
    "TWO_PT_CONV": 0
  },
  "source": "PROVIDER",              // PROVIDER | MANUAL
  "startedAtQB": true                // pour la règle "remplaçant"
}
```
> **Règle 2-pt conversions** : elles ne comptent jamais comme TD → le mapping provider→`ANY_TD` doit exclure les 2-pt.
> **Règle remplaçant** (Combinaison Parfaite) : le back détermine le QB ayant réellement lancé (`startedAtQB` / snaps) pour rattacher l'INT.

### 6.4 Override admin
- Une écran admin liste les stats utilisées par les bonus **actifs** de la semaine et permet de corriger une valeur → écrit `source: "MANUAL"`. Le scoring privilégie toujours `MANUAL` sur `PROVIDER`.
- Idem pour les scores de matchs (édition de `match.result`).

### 6.5 Mode manuel v1 (zéro provider) — **le mode de démarrage**

> Objectif : lancer sans aucun abonnement data. L'admin saisit tout à la main. **Aucun changement de modèle ni de moteurs** : on écrit simplement dans les mêmes collections avec `source: "MANUAL"`, et on n'active pas les jobs `syncSchedule/syncResults/syncPlayerStats`.

**Pourquoi c'est indolore :**
- Le **calendrier NFL est public et figé** → saisie/import une fois par semaine (ou en bloc en début de saison). Pas besoin de provider.
- Les **scores finaux** = ~16 vainqueurs à cocher par semaine.
- Les **stats joueurs** ne sont saisies **que pour les entités réellement sélectionnées** par les participants (il n'y a qu'un bonus actif par semaine). Ex. RB Death Match → seulement les rushing yards des RB effectivement pickés (5-8 valeurs), pas toute la ligue.

**Deux écrans admin suffisent (à prioriser en v1) :**

1. **Écran « Matchs & résultats de la semaine »**
   - Créer/importer les matchs : `homeTeamId`, `awayTeamId`, `kickoffAt` (saisie ligne à ligne ou coller-en-bloc). `externalId` reste `null`, `source: "MANUAL"`.
   - Après les matchs : saisir `homeScore`/`awayScore` → le back en dérive `winnerTeamId` et `margin`, passe le match en `FINAL`.

2. **Écran « Stats des bonus » (saisie ciblée)**
   - Le back calcule, à partir des `entries` **soumises** de la semaine, la **liste des entités référencées** par le bonus actif (playerIds, matchIds, teamIds effectivement choisis).
   - L'écran n'affiche **que ces entités** avec le(s) champ(s) de stat dont le moteur a besoin (`requiredInputs` + `statKey` de la config du bonus). L'admin remplit une poignée de valeurs, lues sur n'importe quel box score gratuit (ESPN, NFL.com).
   - Écrit dans `catalog/playerStats/{season_week}` (ou l'équivalent team) avec `source: "MANUAL"`.

   > Le back doit exposer un endpoint utilitaire `GET /…/weeks/:w/stat-todo` qui renvoie exactement les cases à remplir (entité + statKey + libellé), pour que l'écran soit auto-généré selon le bonus actif. Ça borne le travail et évite de saisir des stats inutiles.

**Workflow hebdo de l'admin en v1 :**
```
1. (mardi) Créer les matchs de la semaine → passer la semaine en OPEN.
2. (jeudi 12h) Lock : les grilles se révèlent, le back fige les entités à noter.
3. (dimanche/lundi) Saisir les scores des matchs → FINAL.
4. Saisir les quelques stats du bonus actif via l'écran « Stats des bonus ».
5. Cliquer « Calculer les scores » → scores + classement publiés.
```

**Chemin de migration v2 (provider) :** activer les jobs de sync → ils **pré-remplissent** les mêmes champs avec `source: "PROVIDER"` ; l'admin ne fait plus que corriger les rares valeurs manquantes (FG le plus long, attribution d'INT au bon QB). Zéro refonte.

---

## 7. Cycle de vie hebdomadaire (machine à états)

`weeks.state` :

```
UPCOMING ──(formOpenAt)──▶ OPEN ──(deadlineAt / lock)──▶ LOCKED ──(scoring)──▶ SCORING ──▶ PUBLISHED
```

| État | Ce qui est permis |
|---|---|
| `UPCOMING` | Admin configure matchs + bonus. Joueurs ne voient rien à remplir. |
| `OPEN` | Joueurs éditent leur `entry` (DRAFT→SUBMITTED). Grilles des autres **cachées**. |
| `LOCKED` | Plus d'édition. Grilles **révélées** (selon `revealPolicy`). GOTW figé. |
| `SCORING` | Back calcule `scores` + résout les `bonuses`. |
| `PUBLISHED` | Scores & classement visibles. |

**Transitions**
- `OPEN→LOCKED` : job `lockWeek` déclenché à `deadlineAt` (ou 1er kickoff selon `lockPolicy`). Marque en `LATE` les `entries` non `SUBMITTED` et applique la pénalité.
- `LOCKED→SCORING→PUBLISHED` : job `scoreWeek` après passage de tous les matchs en `FINAL` (+ stats ingérées). Idempotent (re-calculable si correction admin).

**Pénalités appliquées au scoring**
- `LATE` : soumission après `deadlineAt` → `latePenalty` (-3).
- `NOT_SUBMITTED` : pas de grille → même pénalité + 0 pt de pronos.
- `leaked` (flag admin) : `leakPenalty` (-3).
- Règles fines du doc : « un retardataire ne peut pas affecter le bonus d'un joueur non-retardataire » → dans les moteurs à uniqueness/dedupe, **exclure les entries LATE** du calcul des « seul à avoir choisi ». À implémenter comme option `excludeLateFromUniqueness: true`.

---

## 8. Sécurité (Firestore Security Rules) & rôles

Principes :
1. **Personne n'écrit un `score`** depuis le client (Functions uniquement, via Admin SDK qui bypass les rules).
2. Un joueur lit/écrit **son** `entry` uniquement tant que la semaine est `OPEN` ; lecture des `entries` des autres **seulement** si `week.state ∈ {LOCKED, PUBLISHED}`.
3. Config (matchs, bonus, résultats, weeks) : écriture réservée `OWNER/ADMIN`.

Esquisse :
```
match /leagues/{lid}/members/{uid} {
  allow read: if isMember(lid);
}
match /leagues/{lid}/seasons/{sid}/entries/{eid} {
  allow read: if isOwnerEntry(eid) || weekRevealed(lid,sid,eid);
  allow create, update: if isOwnerEntry(eid) && weekOpen(...) && notScoreFields();
}
match /leagues/{lid}/seasons/{sid}/scores/{doc} {
  allow read: if isMember(lid);
  allow write: if false;             // Functions only
}
match /leagues/{lid}/seasons/{sid}/{col=**} {
  allow write: if isAdmin(lid);      // matches, weeks, bonuses…
}
```
> `weekRevealed` lit l'état de la semaine correspondante — préférer dénormaliser `weekState` dans l'`entry` (posé par la Function au lock) pour éviter un `get()` coûteux dans les rules.

---

## 9. API back-end (Cloud Functions GCP → REST)

> Le front consomme cette API pour toute écriture métier. Auth via **Firebase ID token** (header `Authorization: Bearer <token>`). Le back vérifie le token + le rôle dans la ligue. Contrat détaillé (payloads front) dans `03-brief-frontend-nextjs.md`.

### Endpoints (proposition)
| Méthode | Route | Rôle | Rôle requis |
|---|---|---|---|
| POST | `/leagues` | Créer une ligue | AUTH |
| POST | `/leagues/:lid/invites` | Inviter un membre | ADMIN |
| POST | `/leagues/:lid/invites/:code/accept` | Rejoindre | AUTH |
| POST | `/leagues/:lid/seasons` | Créer une saison | ADMIN |
| POST | `/leagues/:lid/seasons/:sid/weeks/:w/sync-schedule` | Importer les matchs (provider) | ADMIN |
| POST | `/leagues/:lid/seasons/:sid/weeks/:w/bonuses` | Ajouter/configurer un bonus | ADMIN |
| PUT | `/leagues/:lid/seasons/:sid/entries/:w` | **Soumettre sa grille** | PLAYER |
| POST | `/leagues/:lid/seasons/:sid/weeks/:w/lock` | Forcer le lock | ADMIN |
| PUT | `/leagues/:lid/seasons/:sid/matches/:mid/result` | Saisir/corriger un résultat | ADMIN |
| PUT | `/…/weeks/:w/stats-override` | Corriger une stat joueur | ADMIN |
| POST | `/…/weeks/:w/score` | (Re)calculer le scoring | ADMIN |
| GET | `/…/config/engines` | Catalogue des moteurs + schémas config | AUTH |

> Beaucoup de **lectures** (classement, grilles révélées, config) se font **directement en Firestore** côté front (temps réel), pas via l'API. L'API sert les **écritures et les calculs**.

### Découpage des Functions
- `api` (HTTP, Express/Fastify) : routes ci-dessus.
- `onEntryWrite` (trigger Firestore) : validation légère, timestamp, dénormalisation.
- `lockWeek`, `scoreWeek` (Pub/Sub + Scheduler) : machine à états.
- `syncSchedule`, `syncResults`, `syncPlayerStats` (Scheduler) : ingestion.

---

## 10. Découpage de livraison

Tu as choisi **catalogue complet en v1**. Ordre de construction conseillé (pour dérisquer) :

1. **Socle** : Auth, multi-ligue (`leagues/members/seasons`), rôles, security rules.
2. **Boucle de base** : `matches` + `entries` (GAME_PICKS) + lock + scoring + `standings`. → Le jeu est déjà jouable sans bonus.
3. **Ingestion** : provider (schedule + results + player stats) + override admin.
4. **Moteurs sans stats joueurs** : PERFECT_WEEK, GAME_OF_THE_WEEK, PERIOD_LEADER, TEAM_WAGER, UPSET, TEAM_STAT_QUESTIONS, POOL_COMPETITION, DUO_COMPETITION, LINKED_PARLAY.
5. **Moteurs à stats joueurs** : PLAYER_STAT_PICKS, STAT_LEADERBOARD, MATCH_THE_LEADER, CUMULATIVE_COMBO.
6. **Admin console** : configuration des semaines/bonus, saisie/override, déclenchement scoring.

> Chaque moteur est une unité testable isolément (donner `entries`+`config`+`stats`, vérifier les points). Constituer un **jeu de tests** à partir des exemples chiffrés du règlement (ils sont parfaits comme cas de test : RB Death Match, Champ, Dumpster…).

---

## 11. Points d'attention / décisions ouvertes

- **Provider data** : choisir tôt (couverture des stats TE/kicker/INT + granularité « qui a lancé »). SportsData.io et api-sports couvrent bien la NFL ; l'API ESPN publique est gratuite mais moins garantie.
- **Fuseau horaire** : deadlines en `Europe/Paris` mais kickoffs en heure US → tout stocker en UTC, afficher en `league.timezone`.
- **Idempotence du scoring** : recalcul possible après correction admin sans double-compter (recompute complet de la semaine).
- **Uniqueness & retardataires** : bien implémenter `excludeLateFromUniqueness`.
- **Monétisation SaaS** : plan `FREE/PRO` déjà prévu sur `league.plan` (limites : nb de membres, saisons archivées…). Aucun lien avec la cagnotte des joueurs.
```
