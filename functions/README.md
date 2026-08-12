# NFL BET — Cloud Functions (back-end)

API REST + moteur de scoring + 14 moteurs de bonus. Node.js 20 / TypeScript / Firebase Functions v2.

## Arborescence

```
functions/
  src/
    index.ts                 # point d'entrée : expose la fonction HTTP `api`
    lib/
      firebase.ts            # init Admin SDK + db + auth
      auth.ts                # middleware token + contrôle de rôle
      errors.ts              # ApiError typée
    models/types.ts          # helpers (weekId, chemins…)
    engines/index.ts         # LES 14 MOTEURS DE BONUS (Zod + resolve)
    scoring/
      scoreWeek.ts           # orchestrateur : base + Perfect Week + bonus + pénalités + classement
      statTodo.ts            # mode manuel : stats à saisir (entités sélectionnées)
    api/
      app.ts                 # app Express : toutes les routes
      catalog.ts             # métadonnées moteurs (GET /config/engines)
```

À la racine du repo : `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`.

## Prérequis

1. Un projet Firebase (plan **Blaze** requis pour les Functions v2 — gratuit tant que sous les quotas).
2. Firebase CLI : `npm i -g firebase-tools` puis `firebase login`.
3. Renseigner ton `projectId` dans **`.firebaserc`** (remplacer `REMPLACER_PAR_TON_PROJECT_ID`).

## Installer & lancer en local (émulateurs)

```bash
cd functions
npm install
npm run build            # compile TS -> lib/
cd ..
firebase emulators:start # API + Firestore + Auth en local
```

L'API locale : `http://127.0.0.1:5001/<projectId>/europe-west1/api`

## Déployer

```bash
cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules
```

URL de prod affichée en fin de déploiement (forme `https://europe-west1-<projectId>.cloudfunctions.net/api`).

## Référentiels (catalog) — à peupler avant les bonus « joueurs »

Le `playerId`/`teamId` utilisé partout (grilles, stats, scoring) = l'ID de document
dans `catalog/players` / `catalog/teams`. Le front les lit pour l'autocomplete ;
le back valide leur existence à la soumission. À initialiser une fois :

```bash
# Émulateur
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export GCLOUD_PROJECT=<projectId>
# ou Prod : export GOOGLE_APPLICATION_CREDENTIALS=/chemin/serviceAccount.json

npm run seed:teams                         # 32 équipes NFL -> catalog/teams
npm run import:players -- ./scripts/players.sample.csv   # joueurs -> catalog/players
```

CSV joueurs : `id,firstName,lastName,teamId,position,externalId`.
`id` prioritaire ; sinon `p_<externalId>` ; sinon slug du nom (fragile).
➜ Recommandé : aligner `id`/`externalId` sur l'ID API-Sports dès maintenant (migration v2 sans remapping).

## Authentification

Chaque requête doit porter un **Firebase ID token** :
`Authorization: Bearer <idToken>` (obtenu côté front via `getIdToken()`).

## Endpoints

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/config/engines` | Catalogue des moteurs de bonus |
| POST | `/leagues` | Créer une ligue (le créateur devient OWNER) |
| POST | `/leagues/:lid/join` | Rejoindre (PLAYER) |
| POST | `/leagues/:lid/seasons` | Créer une saison (admin) |
| POST | `/leagues/:lid/seasons/:sid/participants` | Ajouter un participant (admin) |
| POST | `/leagues/:lid/seasons/:sid/weeks/:w/matches` | Créer les matchs (admin) |
| POST | `/leagues/:lid/seasons/:sid/weeks/:w/open` | Ouvrir la semaine (admin) |
| PUT | `/leagues/:lid/seasons/:sid/matches/:mid/result` | Saisir un résultat (admin) |
| POST | `/leagues/:lid/seasons/:sid/weeks/:w/bonuses` | Ajouter/configurer un bonus (admin) |
| PUT | `/leagues/:lid/seasons/:sid/entries/:w` | Soumettre sa grille (joueur) |
| POST | `/leagues/:lid/seasons/:sid/weeks/:w/lock` | Verrouiller + révéler (admin) |
| GET | `/leagues/:lid/seasons/:sid/weeks/:w/stat-todo` | Stats à saisir (mode manuel, admin) |
| PUT | `/leagues/:lid/seasons/:sid/weeks/:w/stats-override` | Saisir les stats (admin) |
| POST | `/leagues/:lid/seasons/:sid/weeks/:w/score` | Calculer les scores (admin) |

## Workflow hebdo (mode manuel v1)

```
1. POST .../weeks/7/matches        → créer les matchs
2. POST .../weeks/7/bonuses        → activer le(s) bonus de la semaine
3. POST .../weeks/7/open           → ouvrir la saisie (avec deadlineAt)
   … les joueurs PUT .../entries/7 …
4. POST .../weeks/7/lock           → verrouiller (grilles révélées)
5. PUT  .../matches/:mid/result    → saisir les scores
6. GET  .../weeks/7/stat-todo      → voir les stats à remplir
   PUT  .../weeks/7/stats-override → les remplir
7. POST .../weeks/7/score          → publier scores + classement
```

## Notes d'implémentation

- **Idempotent** : `POST .../score` peut être rejoué après correction — recalcul complet de la semaine.
- **Aucun score écrit par le client** : les Functions (Admin SDK) sont seules à écrire `scores`/`standings` ; les security rules l'imposent.
- **`weekState` dénormalisé sur les entries** au lock → déclenche la révélation côté rules.
- Les blocs `// TODO` dans `engines/index.ts` marquent la logique fine dépendante des données (ex. règle du QB remplaçant). Les exemples chiffrés du règlement servent de tests unitaires.
- Passage au provider (v2) : ajouter les jobs `onSchedule` dans `index.ts` qui écrivent les mêmes docs `matches`/`playerStats` avec `source: "PROVIDER"`. Rien d'autre à changer.
```
