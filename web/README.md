# NFL BET — Front (Next.js)

App Router + TypeScript + Tailwind + Firebase (Auth & Firestore temps réel).

## Démarrer

```bash
cd web
npm install
cp .env.local.example .env.local   # remplir la config Firebase + NEXT_PUBLIC_API_BASE
npm run dev                        # http://localhost:3000
```

Prérequis : back déployé (`functions/`), rules déployées, `seed:teams` + `import:players` lancés, provider Auth activé (Google et/ou Email/Password).

## Architecture

```
src/
  lib/            firebase.ts · api.ts (écritures) · auth-context.tsx · types.ts · format.ts
  hooks/          firestore.ts (lectures temps réel) · league.ts (saison active, rôle)
  components/     ui.tsx · BonusRenderer.tsx · bonuses/*  (widgets par type de bonus)
  app/
    login/                       auth (Google + email/mdp)
    l/                           sélecteur de ligue (create / join)
    l/[leagueId]/
      LeagueShell.tsx            contexte lid/sid/role + header + bottom nav
      page.tsx                   dashboard
      week/[w]/page.tsx          GRILLE (matchs + bonus dynamiques + soumission)
      week/[w]/results/page.tsx  révélation & résultats
      standings/page.tsx         classement
      admin/page.tsx             console admin (config semaine, résultats, stats, scoring)
```

## Principes (voir `docs/06-design-to-api-map.md`)
- **Lectures = Firestore `onSnapshot`** (temps réel) via les hooks.
- **Écritures = `api()`** (fetch + Firebase ID token).
- **Les bonus sont DYNAMIQUES** : `BonusRenderer` rend un widget selon `bonus.type`. Aucun bonus n'est codé en dur.
- Pas de score écrit côté client.

## Ce qui est fait / à étoffer
- ✅ Auth, sélecteur de ligue, dashboard, grille (avec bonus dynamiques), résultats, classement, admin minimal.
- ✅ Widgets bonus : PLAYER_STAT_PICKS (PLAYER + MATCH_TE), STAT_LEADERBOARD, MATCH_THE_LEADER, TEAM_WAGER, TEAM_STAT_QUESTIONS, CUMULATIVE_COMBO, LINKED_PARLAY, DUO_COMPETITION.
- ⏳ À finir : widgets restants (POOL/PERIOD_LEADER n'ont pas de saisie joueur → rien à afficher), onboarding par code d'invitation, brouillon (autosave), avatars, formulaire admin dynamique via `/config/engines`, records/spreads (hors périmètre v1).

## Notes
- Le sélecteur de ligue mémorise les ligues récentes en `localStorage` (pas d'index "mes ligues" en v1).
- Créer une ligue crée aussi une saison 2026/27 automatiquement.
