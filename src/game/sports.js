// Each sport's rules: lineup, season, playoffs, era presets and simulator tuning.
// variance: how often the weaker team wins. Tuned so real teams' ratings predict
// their real records (see scripts/calibrate.mjs).

export const SPORTS = {
  baseball: {
    name: "Baseball",
    slots: [["SP", 1], ["RP", 1], ["C", 1], ["1B", 1], ["2B", 1], ["3B", 1], ["SS", 1], ["LF", 1], ["CF", 1], ["RF", 1], ["DH", 1]],
    bench: 3,
    season: 162,
    leagueSize: 30,
    conferences: ["American League", "National League"],
    // 6 per league; top 2 skip the Wild Card round (MLB format)
    playoffs: { format: "mlb", perConference: 6, rounds: [["Wild Card", 3], ["Division Series", 5], ["Championship Series", 7], ["World Series", 7]] },
    variance: 9.5,
    eras: [
      { id: "all", label: "All eras", from: 1950, to: 2025 },
      { id: "classic", label: "Classic", from: 1950, to: 1979 },
      { id: "golden", label: "Golden", from: 1980, to: 2005 },
      { id: "modern", label: "Modern", from: 2006, to: 2025 },
    ],
    salaryBudget: 140,
    color: "#6E9CF0",
  },
  basketball: {
    name: "Basketball",
    slots: [["PG", 1], ["SG", 1], ["SF", 1], ["PF", 1], ["C", 1]],
    bench: 3,
    season: 82,
    leagueSize: 30,
    conferences: ["Eastern Conference", "Western Conference"],
    // seeds 7-10 play the single-game Play-In for the last two spots, then 8 per conference (NBA format)
    playoffs: { format: "nba", perConference: 10, rounds: [["Play-In", 1], ["First Round", 7], ["Conference Semifinals", 7], ["Conference Finals", 7], ["Finals", 7]] },
    variance: 5.5,
    eras: [
      { id: "all", label: "All eras", from: 1952, to: 2026 },
      { id: "classic", label: "Classic", from: 1952, to: 1979 },
      { id: "golden", label: "Magic, Bird & Jordan", from: 1980, to: 1998 },
      { id: "modern", label: "Modern", from: 1999, to: 2026 },
    ],
    salaryBudget: 100,
    color: "#EE8A4E",
  },
  football: {
    name: "Football",
    slots: [["QB", 1], ["RB", 1], ["WR", 2], ["TE", 1], ["OL", 1], ["DL", 1], ["LB", 1], ["CB", 1], ["S", 1], ["K", 1]],
    bench: 3,
    season: 17,
    leagueSize: 32,
    conferences: ["AFC", "NFC"],
    // 7 per conference; the top seed skips the Wild Card round; top seed always faces the lowest seed left (NFL format)
    playoffs: { format: "nfl", perConference: 7, rounds: [["Wild Card", 1], ["Divisional", 1], ["Conference Championship", 1], ["Championship", 1]] },
    variance: 5,
    unitWeight: { OL: 2 },        // an offensive line is five players, so it counts double
    eras: [
      { id: "all", label: "All eras", from: 1966, to: 2025 },
      { id: "classic", label: "Classic", from: 1966, to: 1981 },
      { id: "golden", label: "Golden", from: 1982, to: 1999 },
      { id: "modern", label: "Modern", from: 2000, to: 2025 },
    ],
    salaryBudget: 150,
    color: "#D2B04C",
  },
  soccer: { name: "Soccer", comingSoon: true, color: "#4FB88A" },
};

export const PLAYABLE = ["baseball", "basketball", "football"];

// Contenders league: the share of each season's teams (best records first) that qualify
export const CONTENDER_SHARE = 0.10;

// Salary cap prices, by rating (straight lines between these points)
export const PRICE_POINTS = [[55, 1], [70, 3], [80, 7], [85, 11], [90, 18], [95, 28], [99, 40]];

export function priceFor(ovr) {
  for (let i = 1; i < PRICE_POINTS.length; i++) {
    const [r0, p0] = PRICE_POINTS[i - 1], [r1, p1] = PRICE_POINTS[i];
    if (ovr <= r1) return Math.round(p0 + ((p1 - p0) * (Math.max(ovr, r0) - r0)) / (r1 - r0));
  }
  return PRICE_POINTS[PRICE_POINTS.length - 1][1];
}

export const DIFFICULTY = [
  { id: "normal", label: "Normal", boost: 0 },
  { id: "hard", label: "Hard", boost: 4 },
  { id: "legend", label: "Legend", boost: 8 },
];

export function tierOf(ovr) {
  if (ovr >= 99) return "legend";
  if (ovr >= 95) return "elite";
  if (ovr >= 90) return "gold";
  if (ovr >= 80) return "silver";
  return "base";
}

// Team colors by team code. Unknown codes get a steady color from their name.
const COLORS = {
  // baseball (Lahman franchise codes)
  ANA: "#BA0021", ARI: "#A71930", ATL: "#CE1141", BAL: "#DF4601", BOS: "#BD3039", CHC: "#0E3386",
  CHW: "#27251F", CIN: "#C6011F", CLE: "#0C2340", COL: "#33006F", DET: "#0C2340", FLA: "#00A3E0",
  HOU: "#EB6E1F", KCR: "#004687", LAD: "#005A9C", MIL: "#12284B", MIN: "#002B5C", NYM: "#FF5910",
  NYY: "#0C2340", OAK: "#003831", PHI: "#E81828", PIT: "#FDB827", SDP: "#2F241D", SEA: "#005C5C",
  SFG: "#FD5A1E", STL: "#C41E3A", TBD: "#092C5C", TEX: "#003278", TOR: "#134A8E", WSN: "#AB0003",
  // basketball (season abbreviations)
  BOS_: "#007A33", BRK: "#000000", NJN: "#002A60", NYK: "#006BB6", PHI_: "#006BB6", TOR_: "#CE1141",
  CHI: "#CE1141", CLE_: "#860038", DET_: "#C8102E", IND: "#002D62", MIL_: "#00471B", ATL_: "#E03A3E",
  CHA: "#1D1160", CHO: "#1D1160", CHH: "#00788C", MIA: "#98002E", ORL: "#0077C0", WAS: "#002B5C",
  WSB: "#002B5C", DEN: "#0E2240", MIN_: "#0C2340", OKC: "#007AC1", SEA_: "#00653A", POR: "#E03A3E",
  UTA: "#002B5C", GSW: "#1D428A", LAC: "#C8102E", LAL: "#552583", PHO: "#E56020", SAC: "#5A2D81",
  DAL: "#00538C", HOU_: "#CE1141", MEM: "#5D76A9", VAN: "#00B2A9", NOP: "#0C2340", NOH: "#0C2340",
  NOK: "#0C2340", SAS: "#C4CED4", BUF: "#E03A3E", KCK: "#5A2D81", SDC: "#C8102E", SDR: "#E03A3E",
  CIN_: "#5A2D81", BLT: "#E03A3E", STL_: "#C8102E", SYR: "#006BB6", PHW: "#1D428A", SFW: "#1D428A",
  MNL: "#552583", ROC: "#5A2D81", FTW: "#C8102E", MLH: "#E03A3E", NOJ: "#002B5C",
  // football (franchise codes)
  "ARI~": "#97233F", "ATL~": "#A71930", "BALR": "#241773", "BUF~": "#00338D", "CAR": "#0085CA",
  "CHI~": "#0B162A", "CIN~": "#FB4F14", "CLE~": "#311D00", "DAL~": "#003594", "DEN~": "#FB4F14",
  "DET~": "#0076B6", GB: "#203731", HOUT: "#03202F", "IND~": "#002C5F", JAX: "#006778",
  KC: "#E31837", "LA~": "#003594", "LAC~": "#0080C6", LV: "#000000", "MIA~": "#008E97",
  "MIN~": "#4F2683", NE: "#002244", NO: "#D3BC8D", NYG: "#0B2265", NYJ: "#125740",
  "PHI~": "#004C54", "PIT~": "#FFB612", "SEA~": "#002244", SF: "#AA0000", TB: "#D50A0A",
  TEN: "#4B92DB", "WAS~": "#5A1414",
};

export function teamColor(sport, code, name = "") {
  const keys = sport === "football" ? [`${code}~`, code] : sport === "basketball" ? [`${code}_`, code] : [code];
  for (const k of keys) if (COLORS[k]) return COLORS[k];
  let h = 0;
  for (const ch of name || code || "") h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 38%)`;
}
