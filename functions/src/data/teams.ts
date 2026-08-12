/** Référentiel des 32 équipes NFL. L'`id` (abréviation) sert de teamId partout. */
export interface Team {
  id: string;
  name: string;
  conference: "AFC" | "NFC";
  division: "East" | "North" | "South" | "West";
}

export const TEAMS: Team[] = [
  // AFC East
  { id: "BUF", name: "Buffalo Bills", conference: "AFC", division: "East" },
  { id: "MIA", name: "Miami Dolphins", conference: "AFC", division: "East" },
  { id: "NE", name: "New England Patriots", conference: "AFC", division: "East" },
  { id: "NYJ", name: "New York Jets", conference: "AFC", division: "East" },
  // AFC North
  { id: "BAL", name: "Baltimore Ravens", conference: "AFC", division: "North" },
  { id: "CIN", name: "Cincinnati Bengals", conference: "AFC", division: "North" },
  { id: "CLE", name: "Cleveland Browns", conference: "AFC", division: "North" },
  { id: "PIT", name: "Pittsburgh Steelers", conference: "AFC", division: "North" },
  // AFC South
  { id: "HOU", name: "Houston Texans", conference: "AFC", division: "South" },
  { id: "IND", name: "Indianapolis Colts", conference: "AFC", division: "South" },
  { id: "JAX", name: "Jacksonville Jaguars", conference: "AFC", division: "South" },
  { id: "TEN", name: "Tennessee Titans", conference: "AFC", division: "South" },
  // AFC West
  { id: "DEN", name: "Denver Broncos", conference: "AFC", division: "West" },
  { id: "KC", name: "Kansas City Chiefs", conference: "AFC", division: "West" },
  { id: "LV", name: "Las Vegas Raiders", conference: "AFC", division: "West" },
  { id: "LAC", name: "Los Angeles Chargers", conference: "AFC", division: "West" },
  // NFC East
  { id: "DAL", name: "Dallas Cowboys", conference: "NFC", division: "East" },
  { id: "NYG", name: "New York Giants", conference: "NFC", division: "East" },
  { id: "PHI", name: "Philadelphia Eagles", conference: "NFC", division: "East" },
  { id: "WAS", name: "Washington Commanders", conference: "NFC", division: "East" },
  // NFC North
  { id: "CHI", name: "Chicago Bears", conference: "NFC", division: "North" },
  { id: "DET", name: "Detroit Lions", conference: "NFC", division: "North" },
  { id: "GB", name: "Green Bay Packers", conference: "NFC", division: "North" },
  { id: "MIN", name: "Minnesota Vikings", conference: "NFC", division: "North" },
  // NFC South
  { id: "ATL", name: "Atlanta Falcons", conference: "NFC", division: "South" },
  { id: "CAR", name: "Carolina Panthers", conference: "NFC", division: "South" },
  { id: "NO", name: "New Orleans Saints", conference: "NFC", division: "South" },
  { id: "TB", name: "Tampa Bay Buccaneers", conference: "NFC", division: "South" },
  // NFC West
  { id: "ARI", name: "Arizona Cardinals", conference: "NFC", division: "West" },
  { id: "LAR", name: "Los Angeles Rams", conference: "NFC", division: "West" },
  { id: "SF", name: "San Francisco 49ers", conference: "NFC", division: "West" },
  { id: "SEA", name: "Seattle Seahawks", conference: "NFC", division: "West" },
];
