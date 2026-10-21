// Season recap: projected stat lines for your players, and awards across the league.

import { SPORTS } from "./sports.js";

// Rate stats (averages, percentages, per-game numbers) move a little; totals move more.
const RATE_STATS = new Set(["AVG", "ERA", "ERA+", "OPS+", "PTS", "REB", "AST", "PCT"]);
const LOWER_IS_BETTER = new Set(["ERA", "INT"]);

function jitter(value, key, teamBoost) {
  if (typeof value !== "number") return value;
  const isRate = RATE_STATS.has(key);
  const spread = isRate ? 0.05 : 0.12;
  const direction = LOWER_IS_BETTER.has(key) ? -1 : 1;
  const factor = 1 + (Math.random() * 2 - 1) * spread + direction * teamBoost * (isRate ? 0.05 : 0.1);
  const out = value * factor;
  if (key === "AVG") return Math.max(0, out).toFixed(3).replace(/^0/, "");
  if (key === "ERA" || (isRate && !Number.isInteger(value))) return Math.max(0, out).toFixed(key === "ERA" ? 2 : 1);
  return Math.max(0, Math.round(out));
}

// A season line close to the player's real one, nudged by how well your team did
export function projectLine(player, teamPct) {
  if (player.unit) return player.stats;
  const boost = (teamPct - 0.5) * 2;       // -1 (winless) to +1 (unbeaten)
  return Object.fromEntries(Object.entries(player.stats || {}).map(([k, v]) => [k, jitter(v, k, boost)]));
}

// Award score: rating, plus a bonus for winning, plus a little luck
const awardScore = (p, pct) => p.ovr + 12 * (pct - 0.5) + Math.random() * 3;

export function awards(sport, teams, standings, userIndex) {
  const pctOf = Object.fromEntries(standings.map((r) => [r.index, r.pct]));
  const everyone = [];
  teams.forEach((t, i) => t.lineup.starters.forEach((s) => {
    if (s.player && !s.player.unit) everyone.push({ player: s.player, team: i, slot: s.pos, score: awardScore(s.player, pctOf[i]) });
  }));
  everyone.sort((a, b) => b.score - a.score);
  const mvp = everyone[0];
  const teamMvp = everyone.find((e) => e.team === userIndex);

  // All-League team: the best player at each lineup spot across the league
  const allLeague = [];
  for (const [pos, n] of SPORTS[sport].slots) {
    if (pos === "OL") continue;
    everyone.filter((e) => e.slot === pos).slice(0, n).forEach((e) => allLeague.push(e));
  }
  return { mvp, teamMvp, allLeague, yourAllLeague: allLeague.filter((e) => e.team === userIndex).length };
}
