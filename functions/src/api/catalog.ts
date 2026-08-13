/**
 * Métadonnées des moteurs de bonus, exposées au front (GET /config/engines)
 * pour générer dynamiquement les formulaires de configuration admin.
 *
 * Chaque champ porte :
 *  - `key`     : le nom réel dans `config` (jamais montré au commissaire) ;
 *  - `label`   : l'intitulé lisible affiché dans le formulaire ;
 *  - `help`    : la phrase qui explique l'effet du réglage ;
 *  - `optionLabels` : traduction des valeurs d'un `enum`.
 *
 * C'est ici qu'on traduit le jargon technique en langage de commissaire de
 * ligue : le front n'affiche que ce que ce fichier déclare. La validation
 * stricte reste faite côté back par le `configSchema` Zod de chaque moteur.
 */
export const ENGINE_CATALOG = [
  {
    type: "PERFECT_WEEK",
    title: "Perfect Week",
    description: "Tous les matchs corrects → gros bonus.",
    playerInput: false,
    configFields: [
      { key: "points", type: "number", default: 10, label: "Points si grille parfaite", help: "Accordés au joueur qui a trouvé tous les vainqueurs de la semaine." },
      { key: "includeGOTW", type: "boolean", default: true, label: "Inclure le Game of the Week", help: "Si activé, le match de la semaine doit lui aussi être correct." },
    ],
  },
  {
    type: "GAME_OF_THE_WEEK",
    title: "Game of the Week",
    description: "Le match le plus serré (50/50). Bon pronostic → points.",
    playerInput: false,
    configFields: [
      { key: "points", type: "number", default: 2, label: "Points si le match est trouvé", help: "Pour chaque joueur ayant pronostiqué le bon vainqueur." },
      {
        key: "gotwMatchId",
        type: "match",
        default: "",
        label: "Match désigné",
        help: "Laisse « automatique » pour que le match le plus partagé par la ligue soit choisi au moment du calcul. Si tu désignes un match toi-même, fais-le avant le verrouillage.",
      },
    ],
  },
  {
    type: "PERIOD_LEADER",
    title: "Leader de période (WW3)",
    description: "Leader(s) au cumul sur une plage de semaines.",
    playerInput: false,
    configFields: [
      { key: "fromWeek", type: "number", default: 1, label: "Première semaine comptée" },
      { key: "toWeek", type: "number", default: 3, label: "Dernière semaine comptée", help: "Le bonus est attribué une fois cette semaine terminée." },
      { key: "points", type: "number", default: 3, label: "Points pour le leader", help: "En cas d'égalité, tous les leaders reçoivent les points." },
    ],
  },
  {
    type: "TEAM_WAGER",
    title: "Pari équipe (Melvyn / Quitte ou Double)",
    description: "Parier sur une équipe. Seul vs partagé, victoire vs défaite.",
    playerInput: true,
    configFields: [
      { key: "optional", type: "boolean", default: false, label: "Participation facultative", help: "Si activé, un joueur peut ne pas parier du tout — il ne gagne ni ne perd rien." },
      { key: "soleWinPoints", type: "number", default: 2, label: "Points si l'équipe gagne et que tu es le seul à l'avoir choisie" },
      { key: "sharedWinPoints", type: "number", default: 0, label: "Points si l'équipe gagne mais que d'autres l'ont aussi choisie" },
      { key: "losePoints", type: "number", default: 0, label: "Points si l'équipe perd", help: "Mets une valeur négative pour que le pari coûte cher (ex. -1)." },
    ],
  },
  {
    type: "UPSET",
    title: "Upset",
    description: "Parier sur une équipe sans victoire qui gagne / contre une invaincue qui perd.",
    playerInput: false,
    configFields: [
      { key: "points", type: "number", default: 2, label: "Points par surprise trouvée", help: "Une équipe encore sans victoire qui l'emporte, ou une équipe invaincue qui tombe." },
    ],
  },
  {
    type: "PLAYER_STAT_PICKS",
    title: "Sélection de joueurs (WR/Champ/Dumpster/TE Day)",
    description: "Choisir des joueurs qui doivent atteindre une stat (TD, INT…).",
    playerInput: true,
    configFields: [
      { key: "selectionMin", type: "number", default: 1, label: "Nombre minimum de choix" },
      { key: "selectionMax", type: "number", default: 3, label: "Nombre maximum de choix" },
      {
        key: "entity",
        type: "enum",
        options: ["PLAYER", "MATCH_TE"],
        default: "PLAYER",
        label: "Sur quoi porte le choix",
        optionLabels: { PLAYER: "Des joueurs", MATCH_TE: "Des matchs (le TE doit marquer)" },
      },
      {
        key: "statKey",
        type: "enum",
        options: ["ANY_TD", "RECEIVING_TD", "PASSING_INT", "TE_TD_IN_MATCH"],
        label: "Exploit à réaliser",
        optionLabels: {
          ANY_TD: "Marquer un touchdown",
          RECEIVING_TD: "Marquer un touchdown à la réception",
          PASSING_INT: "Se faire intercepter",
          TE_TD_IN_MATCH: "Un tight end marque dans ce match",
        },
      },
      {
        key: "scoring",
        type: "enum",
        options: ["GATED_EACH", "COUNT_CAPPED"],
        label: "Mode de comptage",
        optionLabels: {
          GATED_EACH: "Tout ou rien — il faut que tous les choix réussissent",
          COUNT_CAPPED: "Au nombre de réussites, dans la limite du plafond",
        },
      },
      { key: "pointsPerHit", type: "number", default: 1, label: "Points par joueur réussi" },
      { key: "cap", type: "number", default: 3, label: "Plafond de points", help: "Maximum de points que ce bonus peut rapporter sur la semaine." },
      {
        key: "dedupe",
        type: "enum",
        options: ["NONE", "ELIMINATE"],
        default: "NONE",
        label: "Si plusieurs joueurs choisissent le même",
        optionLabels: { NONE: "Aucune conséquence", ELIMINATE: "Le choix est annulé pour tout le monde" },
      },
    ],
  },
  {
    type: "STAT_LEADERBOARD",
    title: "Leaderboard de stat (RB Death Match)",
    description: "Sélection qui compétitionne sur un cumul de stat ; doublons éliminés.",
    playerInput: true,
    configFields: [
      { key: "selectionCount", type: "number", default: 2, label: "Nombre de joueurs à choisir", help: "Exactement ce nombre : ni plus, ni moins." },
      { key: "statKey", type: "enum", options: ["RUSHING_YARDS"], label: "Statistique comparée", optionLabels: { RUSHING_YARDS: "Yards à la course" } },
      {
        key: "dedupe",
        type: "enum",
        options: ["NONE", "ELIMINATE"],
        default: "ELIMINATE",
        label: "Si plusieurs joueurs choisissent le même",
        optionLabels: { NONE: "Aucune conséquence", ELIMINATE: "Le choix est annulé pour tout le monde" },
      },
    ],
  },
  {
    type: "MATCH_THE_LEADER",
    title: "Nommer le leader (Kickerz)",
    description: "Nommer le joueur qui mènera une stat (ex. plus long FG).",
    playerInput: true,
    configFields: [
      { key: "statKey", type: "enum", options: ["FG_LONGEST"], label: "Classement à deviner", optionLabels: { FG_LONGEST: "Le plus long field goal de la semaine" } },
      { key: "solePoints", type: "number", default: 3, label: "Points si tu es le seul à avoir trouvé" },
      { key: "sharedPoints", type: "number", default: 1, label: "Points si d'autres ont trouvé aussi" },
    ],
  },
  {
    type: "TEAM_STAT_QUESTIONS",
    title: "Questions par équipe (Puntos)",
    description: "Plusieurs questions, une équipe par question.",
    playerInput: true,
    configFields: [
      { key: "cap", type: "number", default: 3, label: "Plafond de points" },
      {
        key: "questions",
        type: "questions",
        default: [],
        label: "Liste des questions",
        help: "Une ligne par question : la statistique visée, l'extrême cherché et les points. Le joueur répondra en désignant une équipe de la semaine.",
      },
    ],
  },
  {
    type: "POOL_COMPETITION",
    title: "Poules (Cage Fight)",
    description: "Poules ; 1er de poule → points.",
    playerInput: false,
    configFields: [
      {
        key: "poolSize",
        type: "number",
        default: 4,
        label: "Joueurs par poule",
        help: "Les poules sont tirées au sort automatiquement au verrouillage de la semaine — tu peux les retirer ou les corriger à la main depuis la liste des bonus.",
      },
      { key: "firstPlacePoints", type: "number", default: 3, label: "Points pour le premier de chaque poule" },
      {
        key: "tieRule",
        type: "enum",
        options: ["SHARED_ZERO", "SHARED_POINTS"],
        default: "SHARED_ZERO",
        label: "En cas d'égalité en tête de poule",
        optionLabels: { SHARED_ZERO: "Personne ne marque", SHARED_POINTS: "Tous les ex æquo marquent les points" },
      },
    ],
  },
  {
    type: "DUO_COMPETITION",
    title: "Duos (Destins Liés)",
    description: "Duos tirés au sort ; scores additionnés et classés.",
    playerInput: true,
    configFields: [
      {
        key: "optIn",
        type: "boolean",
        default: true,
        label: "Inscription volontaire",
        help: "Si activé, seuls les joueurs ayant coché « je participe » entrent dans le tirage, fait automatiquement au verrouillage de la semaine.",
      },
      {
        key: "rankPoints",
        type: "numbers",
        default: { first: 3, second: 1, last: -1 },
        fields: [
          { key: "first", label: "Duo 1er" },
          { key: "second", label: "Duo 2e" },
          { key: "last", label: "Duo dernier" },
        ],
        label: "Points par place du duo",
        help: "Les deux joueurs du duo reçoivent les mêmes points. La pénalité du dernier ne s'applique qu'à partir de trois duos.",
      },
    ],
  },
  {
    type: "LINKED_PARLAY",
    title: "Parlay lié (Thanksgiving Combine)",
    description: "Plusieurs matchs liés ; tout correct → points, sinon 0.",
    playerInput: true,
    configFields: [
      {
        key: "matchIds",
        type: "matches",
        default: [],
        label: "Matchs du combiné",
        help: "Coche les matchs qui composent le combiné. Ils doivent être créés au préalable (étape 1).",
      },
      { key: "allCorrectPoints", type: "number", default: 3, label: "Points si tout le combiné est correct", help: "Une seule erreur et le bonus ne rapporte rien." },
    ],
  },
  {
    type: "CUMULATIVE_COMBO",
    title: "Combo cumulatif (Combinaison Parfaite)",
    description: "OUI/NON par match, points cumulatifs dans l'ordre.",
    playerInput: true,
    configFields: [
      { key: "cap", type: "number", default: 3, label: "Plafond de points" },
      {
        key: "items",
        type: "comboItems",
        default: [],
        label: "Matchs et quarterbacks",
        help: "Une ligne par match, DANS L'ORDRE : les points s'arrêtent à la première erreur. Le joueur répondra OUI/NON à « ce QB va-t-il se faire intercepter ? » pour les deux quarterbacks.",
      },
    ],
  },
];
