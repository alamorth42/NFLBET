# Prompt de design — à coller dans Claude (mode design / artifact)

> Copie-colle le bloc ci-dessous. Il est autoportant : il décrit le produit, l'ambiance, les écrans clés et les contraintes. Adapte les 3 champs `[…]` en tête si besoin.

---

Tu es un designer produit senior spécialisé en applications sportives et fantasy. Conçois le **design system + les maquettes** d'une web-app de **pronostics NFL entre amis**, façon « Mon Petit Prono » mais pensée SaaS multi-ligues.

## Contexte produit
- **Nom** : NFL BET.
- **Public** : groupes d'amis passionnés de NFL (20-40 ans), qui jouent chaque semaine de la saison régulière (Week 1 à 18).
- **Principe** : chaque semaine, chaque joueur pronostique le vainqueur de tous les matchs + répond à des « bonus » (défis spéciaux). On gagne des points, on suit un classement. **Aucune gestion d'argent dans l'app** (c'est social/compétitif, pas un book).
- **Ton** : ambiance « ligue entre potes » — compétitif, taquin, fun, mais lisible et rapide à remplir sur mobile. Pas corporate, pas casino tape-à-l'œil.
- **Plateforme prioritaire : mobile-first** (on remplit sa grille depuis le canapé), responsive desktop pour l'admin et le classement.

## Direction artistique souhaitée
- **[Palette : sombre par défaut (dark mode), accents énergiques — ex. vert « terrain » + orange/ambre pour les points/bonus. Propose une alternative claire.]**
- **[Typo : une display forte type sport pour les titres/scores + une sans-serif très lisible pour le corps.]**
- **[Identité : clin d'œil football US (yard lines, chiffres de maillot, chevrons) sans tomber dans le cliché. Iconographie nette.]**
- Composants aux angles francs, hiérarchie claire des chiffres (les points sont les héros), micro-animations sur les gains de points.
- Accessibilité : contrastes AA, tap targets ≥ 44px, états focus visibles. Design theme-aware (clair + sombre).

## Écrans à concevoir (prioritaires)

1. **Accueil / Dashboard joueur**
   - Statut de la semaine en cours (formulaire ouvert / verrouillé / résultats publiés) avec compte à rebours vers la deadline.
   - Ma position au classement (rang + points), variation vs semaine dernière.
   - CTA principal : « Remplir ma grille » ou « Voir les résultats ».
   - Aperçu du/des bonus de la semaine.

2. **Grille de pronostics (LE cœur — soigne-le)**
   - Liste des matchs de la semaine : deux équipes (logos, records), on tape pour choisir le vainqueur. État sélectionné très clair.
   - Progression (« 9/14 matchs pronostiqués »).
   - Section **Bonus** de la semaine, avec des widgets de saisie **différents selon le type** de bonus. Conçois au moins ces variantes de widget :
     - *Sélection de joueurs* (chercher/ajouter 1 à 3 joueurs — Prénom + Nom + Team, avec autocomplete). Ex : « Trust Your WR ».
     - *Choix d'une équipe unique* (un seul choix, avertissement « pari risqué »). Ex : « Quitte ou Double ».
     - *Questions à choix d'équipe* (3 questions, une équipe par question). Ex : « Puntos ».
     - *Combo OUI/NON* (par match, deux toggles QB intercepté OUI/NON, ordonnés). Ex : « Combinaison Parfaite ».
     - *Sélection de 3 matchs* dans la liste (checkboxes limitées à 3). Ex : « National TE Day ».
   - Barre d'action sticky en bas : « Enregistrer le brouillon » / « Soumettre » + rappel deadline.

3. **Révélation & résultats de la semaine**
   - Les grilles de tous les joueurs deviennent visibles (tableau des pronos, colonnes = joueurs, lignes = matchs, ✅/❌).
   - Mise en avant du **Game of the Week** (le match le plus serré en votes) et des **Perfect Weeks**.
   - Détail des points bonus gagnés par chacun (breakdown lisible).

4. **Classement (standings)**
   - Général saison + par semaine. Podium en tête (1/2/3 avec accent), reste en liste dense.
   - Ligne joueur : rang, avatar, pseudo, points totaux, evolution (▲▼), sparkline optionnelle.
   - Filtres : général / cette semaine / une période.

5. **Console Admin (commissaire) — pensée pour une saisie 100 % manuelle en v1**
   > En v1 il n'y a **pas de synchro automatique** : l'admin saisit tout à la main. Le design doit rendre cette saisie **rapide et sans friction** (c'est le vrai travail hebdomadaire du commissaire). Conçois ces sous-écrans :
   - **Configurer la semaine** : ajouter les matchs (saisie ligne à ligne **ou coller-en-bloc**, ex. « KC @ BUF » x16), puis choisir/paramétrer le(s) bonus depuis un **catalogue** (cartes de bonus avec titre, description, réglages : points, cap, options). Bouton « Ouvrir la semaine ».
   - **Saisir les résultats** : liste des matchs, deux champs de score par match (Domicile/Extérieur) ; le vainqueur se déduit visuellement. Saisie rapide au clavier, validation en un geste.
   - **Saisir les stats du bonus (écran clé, à soigner)** : après le lock, l'app affiche **uniquement** la courte liste des entités (joueurs/matchs/équipes) que les participants ont réellement sélectionnées, chacune avec le champ de stat attendu (ex. « Rushing yards de Jahmyr Gibbs : ___ », « Un TE a-t-il marqué dans KC@BUF ? Oui/Non »). Objectif : une poignée de champs, remplissables en 2 minutes depuis un box score. Montrer une **checklist de progression** (« 6/8 stats saisies »).
   - **Piloter la semaine** : statut visible (machine à états : À venir → Ouverte → Verrouillée → Publiée), bouton « Verrouiller », bouton « Calculer les scores » (avec état « recalculable » si correction).

6. **Onboarding léger** : créer/rejoindre une ligue (code d'invitation), choisir son pseudo, avatar.

## Composants transverses à définir dans le design system
- Cartes de match (variante « à pronostiquer » vs « résultat »).
- Carte de bonus (état à configurer / à jouer / résolu, avec les points en avant).
- Badges d'état (Ouvert, Verrouillé, En retard -3, Perfect Week, Game of the Week).
- Chip joueur (avatar + Prénom NOM + logo team) pour l'autocomplete des bonus.
- Bandeau de compte à rebours / deadline.
- Tableau de classement dense + podium.
- États vides et de chargement.

## Livrables attendus
1. Un **design system** : palette (clair + sombre), typo, échelle d'espacement, styles de composants, iconographie.
2. Les **maquettes haute-fidélité** des 6 écrans ci-dessus, en priorité mobile puis desktop pour Admin & Classement.
3. Les **variantes de widgets de bonus** listées en écran 2.
4. Une courte note d'intentions (pourquoi ces choix, comment ça sert la rapidité de saisie et le fun compétitif).

Commence par proposer 2 directions visuelles rapides (moodboard/nom + accent), laisse-moi choisir, puis développe la retenue.
```
