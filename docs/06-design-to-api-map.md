# NFL BET — Câblage du design → API / Firestore (pour le dev front)

> **But de ce doc** : relier **chaque écran et chaque donnée** de la maquette (`docs/design-source.readable.html`) à **l'appel exact** à faire — API REST (écritures) ou lecture Firestore temps réel (données). Le designer ne connaissait pas le back : les données de la maquette sont **mockées** (`MATCHES`, `WRS`, `STAND`…). Ici on dit d'où vient chaque valeur *pour de vrai*.
>
> À lire avec : `03-brief-frontend-nextjs.md` (routes, schémas), `openapi.yaml` (contrat API), `01-architecture-technique.md` (modèle de données).

---

## 0. Glossaire NFL express (pour le dev qui ne connaît pas le foot US)

| Terme dans la maquette | Ce que c'est | D'où ça vient chez nous |
|---|---|---|
| `KC`, `BUF`, `MIN`… | **Abréviation d'une franchise** (32 équipes). | = notre `teamId`. Référentiel `catalog/teams`. |
| `Chiefs`, `Bills`… | Le **surnom** de l'équipe. | `catalog/teams/{id}.name` (ex. "Kansas City Chiefs"). |
| `5-1` (record) | **Bilan victoires-défaites** de l'équipe sur la saison. | ⚠️ **PAS dans le modèle v1** (voir §7, point 2). À calculer ou masquer. |
| `BUF -1.5` (line/spread) | **Cote de paris** (handicap bookmaker). | ⚠️ **PAS dans le système** (pas de provider d'odds en v1). À **supprimer** de l'UI. |
| `QB / RB / WR / TE / K` | Postes : Quarterback, Running back, Wide receiver, Tight end, Kicker. | `catalog/players/{id}.position`. |
| `TD` | **Touchdown** (6 pts marqués sur le terrain). | Stat joueur `anyTd`. |
| `Game of the Week` | Le match le plus serré dans les votes du groupe. | Calculé au scoring → `weeks/{w}.gotwMatchId`. |
| `Perfect Week` | Un joueur a deviné **tous** les matchs justes. | `scores/{uid}_Wnn.perfectWeek`. |
| Les bonus (Trust Your WR…) | Défis hebdo à points. | **Dynamiques**, définis par l'admin → collection `bonuses` (voir §7, point 1 — TRÈS IMPORTANT). |

---

## 1. À mettre en place une fois (fondations)

### 1.1 Firebase client + API client
```ts
// lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const app = getApps().length ? getApps()[0] : initializeApp({ /* config web Firebase */ });
export const auth = getAuth(app);
export const db = getFirestore(app);
```

```ts
// lib/api.ts  — toutes les ÉCRITURES métier passent par là
import { auth } from "./firebase";

const BASE = process.env.NEXT_PUBLIC_API_BASE!; // ex: https://europe-west1-<projet>.cloudfunctions.net/api

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.code || "API_ERROR");
  return json.data as T;
}
```

### 1.2 Règle d'or
- **Lectures** (matchs, classement, grilles révélées, config) = **Firestore `onSnapshot`** (temps réel).
- **Écritures** (soumettre une grille, actions admin) = **`api(...)`**.
- Le front **n'écrit jamais** de score : tout est calculé serveur.

---

## 2. Écran ONBOARDING (`isOnboarding`, lignes 378-410)

| Élément maquette | Variable mock | Source réelle |
|---|---|---|
| Cases "CODE D'INVITATION" | `codeCells` = `'GRID18'` | Champ de saisie. En v1 le back rejoint par **`leagueId`** (le "code" = l'ID de ligue, ou implémente une collection `invites`, cf. §7 point 4). |
| Champ "PSEUDO" | `pseudo` | Envoyé comme `displayName`. |
| Choix "AVATAR" | `avatars` | Optionnel ; pas de champ back dédié pour l'instant (à stocker sur `members/{uid}` si voulu). |
| Bouton "REJOINDRE LA LIGUE" | `navHome` | **`api("POST", "/leagues/{lid}/join", { displayName })`** puis redirection dashboard. |
| "créer ma propre ligue" | — | **`api("POST", "/leagues", { name, displayName })`** → renvoie `{ leagueId }`. |

---

## 3. Écran DASHBOARD (`isDash`, lignes 34-94)

**Contexte à charger** : la **semaine courante**, ma grille, mon classement.

```ts
// Semaine courante : la plus récente non archivée (état OPEN/LOCKED/PUBLISHED)
import { collection, query, where, orderBy, limit, onSnapshot, doc } from "firebase/firestore";
const base = `leagues/${lid}/seasons/${sid}`;
onSnapshot(query(collection(db, `${base}/weeks`), orderBy("number", "desc"), limit(1)), snap => {
  const week = snap.docs[0]?.data(); // { number, state, deadlineAt, bonusIds, ... }
});
```

| Élément maquette | Variable mock | Source réelle |
|---|---|---|
| Badge "WEEK 07" (header) | statique | `week.number`. |
| "FORMULAIRE OUVERT" / badge "OUVERT" | statique | `week.state` (`UPCOMING/OPEN/LOCKED/SCORING/PUBLISHED`). |
| Compte à rebours `{{ countdown }}` | `st.left` | `week.deadlineAt` − maintenant (recalcul chaque seconde côté client). |
| "9/14 MATCHS PRONOSTIQUÉS" | `done/14` | `Object.keys(myEntry.gamePicks).length` / nombre de `matches` de la semaine. |
| "0/5 BONUS" | statique | nb de `bonusAnswers` remplis / `week.bonusIds.length`. |
| "MON RANG 3 ▲2 sur 12" | statique | `standings/{uid}.rank` ; `sur N` = `season.participants.length` ; le ▲ = variation via `standings/{uid}.perWeek`. |
| "MES POINTS 134 +21" | statique | `standings/{uid}.totalPoints` ; `+21` = `scores/{uid}_W(n-1).weekTotal` ou diff de rangs. |
| Bouton "REMPLIR MA GRILLE" | `navGrid` | Route `/l/{lid}/week/{n}`. |
| "LES BONUS DE LA SEMAINE" | `bonusPreview` (hardcodé) | **Lire `bonuses` where week==n** → `{ title, type, config }`. Le `desc`/`pts` doivent venir du `type`+`config`, pas être écrits en dur (§7 point 1). |
| Encart "TRASH TALK" | statique | Pas de back → statique ou fonctionnalité future. |

Ma grille (brouillon) :
```ts
onSnapshot(doc(db, `${base}/entries/${uid}_W07`), s => { const myEntry = s.data(); });
```

---

## 4. Écran GRILLE (`isGrid`, lignes 96-261) — le cœur

### 4.1 Les matchs (`MATCHES`, lignes 108-133)
```ts
onSnapshot(query(collection(db, `${base}/matches`), where("week", "==", 7)), snap => {
  const matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
});
```
| Élément | Mock | Source réelle |
|---|---|---|
| `m.away` / `m.home` (KC / BUF) | mock | `match.awayTeamId` / `match.homeTeamId`. |
| `m.awayName` (Chiefs) | mock | `catalog/teams/{teamId}.name` (précharger `catalog/teams` en cache). |
| `m.awayRec` (5-1) | mock | ⚠️ **pas en v1** → masquer (§7 point 2). |
| `m.time` (JEU 02:15) | mock | `match.kickoffAt` formaté en `Europe/Paris`. |
| `m.line` (BUF -1.5) | mock | ⚠️ **pas en v1** → supprimer. |
| Boutons pick away/home | `st.picks` | State local → envoyé dans `gamePicks: { [matchId]: teamId }`. |

### 4.2 Les bonus (lignes 135-248)
> ⚠️ **NE PAS coder les 5 bonus en dur.** Ils changent chaque semaine. Boucle sur `bonuses` (where week==n) et rends **un widget selon `bonus.type`** (mapping complet dans `03-brief-frontend-nextjs.md §6`). Le titre = `bonus.title`, le barème = `bonus.config`.

| Widget maquette | Type de bonus | Réponse à écrire (`bonusAnswers[bonusId]`) | Données pour l'UI |
|---|---|---|---|
| **TRUST YOUR WR** (recherche receveurs, `WRS`) | `PLAYER_STAT_PICKS` | `{ players: [playerId, …] }` | Autocomplete sur `catalog/players` filtré `position=="WR"`. Afficher `displayName` + `teamId`, stocker l'**id**. |
| **QUITTE OU DOUBLE** (grille d'équipes) | `TEAM_WAGER` | `{ teamId }` | Équipes = `catalog/teams` (ou les équipes qui jouent cette semaine, via `matches`). |
| **PUNTOS** (3 questions × équipe) | `TEAM_STAT_QUESTIONS` | `{ answers: { [questionId]: teamId } }` | Questions = `bonus.config.questions` ; options = équipes de la semaine. |
| **COMBINAISON PARFAITE** (OUI/NON par match) | `CUMULATIVE_COMBO` | `{ items: { [itemId]: { QB_HOME, QB_AWAY } } }` | Matchs = `bonus.config.items[].matchId`. |
| **NATIONAL TE DAY** (choisir 3 matchs) | `PLAYER_STAT_PICKS` (entity `MATCH_TE`) | `{ matches: [matchId, matchId, matchId] }` | Liste = `matches` de la semaine ; limiter la sélection à 3. |

> ⚠️ Le texte de la maquette « 1 pt par tranche de 10 receiving yards, cap 15 » a été **inventé** par le designer. La **vraie règle** de Trust Your WR (chaque WR doit marquer un TD) vient de `bonus.config`. **Affiche la description depuis les données, jamais en dur.**

### 4.3 Barre d'action (lignes 251-260)
| Élément | Source réelle |
|---|---|
| "LOCK JEUDI 02:15" | `week.deadlineAt`. |
| Bouton "Brouillon" | ⚠️ Pas d'endpoint draft en v1 → sauvegarde **localStorage** (ou demander une route `draft` au back). Voir §7 point 3. |
| Bouton "SOUMETTRE MA GRILLE" | **`api("PUT", "/leagues/{lid}/seasons/{sid}/entries/7", { gamePicks, bonusAnswers })`**. |

Réponse : `{ state: "SUBMITTED" | "LATE" }`. Erreurs à mapper : `WEEK_LOCKED`, `INVALID_BONUS_ANSWER`, `INVALID_REFERENCE`.

---

## 5. Écran RÉSULTATS (`isResults`, lignes 263-332)

> Visible seulement si `week.state ∈ {LOCKED, PUBLISHED}`. Avant le lock, Firestore **bloque** la lecture des grilles des autres (ne pas contourner).

| Élément maquette | Mock | Source réelle |
|---|---|---|
| "RÉVÉLATION W07 / PUBLIÉE" | statique | `week.number` + `week.state`. |
| **GAME OF THE WEEK** (KC/BUF, votes, score) | statique | Match = `week.gotwMatchId` ; score = `match.result` (27-24) ; **votes** = à calculer en lisant tous les `entries` de la semaine (`gamePicks[gotwMatchId]`) après révélation. |
| Bandeau "PERFECT WEEK" | statique | `scores` where `perfectWeek == true`. |
| **Tableau matchs × joueurs** (✓/✗) | `grid`, `resultPlayers`, `resultRows` | Colonnes = participants ; lignes = `matches` ; ✓ si `entry.gamePicks[matchId] == match.result.winnerTeamId`. Lire tous les `entries` (révélés) + `matches`. |
| **DÉTAIL DES BONUS** | `bonusBreakdown` | `scores/{uid}_W07.bonusBreakdown` (déjà structuré `{ type, points, detail }`) + `penalties`. |

---

## 6. Écran CLASSEMENT (`isStandings`, lignes 334-376)

```ts
onSnapshot(query(collection(db, `${base}/standings`), orderBy("totalPoints", "desc")), snap => {
  const standings = snap.docs.map(d => d.data()); // { rank, displayName, totalPoints, perWeek }
});
```
| Élément | Mock | Source réelle |
|---|---|---|
| Filtres Général / Cette semaine / W01–W07 | `standFilters` | Général = `standings` ; Cette semaine = `scores` where week==n ; Période = somme `perWeek` sur la plage. |
| Podium (top 3) | statique | 3 premiers de `standings`. |
| Liste (`STAND`) | mock | `standings` triés ; `name` = `displayName` ; `pts` = `totalPoints` ; ▲▼ = variation via `perWeek`. |

---

## 7. ⚠️ Écarts entre la maquette et le vrai système (À LIRE)

1. **Les bonus sont DYNAMIQUES.** La maquette montre 5 bonus figés (Trust Your WR, Quitte ou Double…). En vrai, l'admin choisit **quels** bonus sont actifs **chaque semaine** dans un catalogue de 14 types. Le front doit **itérer sur `bonuses` et rendre un widget par `type`** (mapping type→widget dans `03 §6`), avec titre/description/barème **issus des données**. Ne jamais hardcoder un bonus.

2. **Records (5-1) et cotes (BUF -1.5) n'existent pas en v1.** Le modèle de données ne les contient pas (pas de provider d'odds). → **Retirer le spread** de l'UI ; le record est optionnel (calculable depuis `matches` FINAL si tu y tiens, sinon masquer).

3. **Brouillon (autosave)** : aucun endpoint en v1 (seul `PUT entries` existe et il **soumet**). Options : sauvegarde locale (`localStorage`) tant que non soumis, ou demander une route `draft` au back. À trancher avec le back.

4. **Codes d'invitation** : le back v1 rejoint via `POST /leagues/:lid/join` (le "code" = l'ID de ligue). Pour de vrais codes courts, il faudra une collection `invites` (prévue dans le modèle, pas encore implémentée).

5. **Trash talk** : pas de back → statique ou fonctionnalité future.

6. **Format joueur imposé** par les règles : toujours afficher **Prénom + NOM + TEAM** dans les autocompletes (le design le fait déjà avec les chips). Stocker l'**`id`** (`catalog/players`), jamais le nom libre — sinon le scoring ne retrouve pas la stat.

---

## 8. Récap des appels par action

| Action utilisateur | Appel |
|---|---|
| Créer une ligue | `POST /leagues` |
| Rejoindre | `POST /leagues/:lid/join` |
| Voir dashboard / grille / résultats / classement | **Lectures Firestore** (`weeks`, `matches`, `bonuses`, `entries`, `scores`, `standings`, `catalog/*`) |
| Soumettre sa grille | `PUT /leagues/:lid/seasons/:sid/entries/:w` |
| Autocomplete joueur / équipe | **Lecture Firestore** `catalog/players` / `catalog/teams` |
| (Admin) config semaine, résultats, stats, scoring | voir `openapi.yaml` (tag Scoring / Weeks) |

> Import de la spec dans Postman/Insomnia : `docs/openapi.yaml`. Le fichier `docs/design-source.readable.html` est le **source lisible** du design (le `.html` bundlé n'est pas éditable directement).
