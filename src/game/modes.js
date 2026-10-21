// Gamble, the computer opponent, and salary cap rules.

import { SPORTS, priceFor } from "./sports.js";
import { placementFor, openSlots } from "./draft.js";
import { seasonsInEra, loadSeason, shuffle, withContext, pick } from "./data.js";

// ------------------------------------------------------------------
// Gamble: swap one of your players for a random player at the same position, same era
// ------------------------------------------------------------------
export async function gamblePool(sport, era, position, excludeIds, seasonCount = 10) {
  const pool = [];
  for (const entry of shuffle(await seasonsInEra(sport, era)).slice(0, seasonCount)) {
    const season = await loadSeason(sport, entry);
    for (const team of season.teams) {
      const t = withContext(sport, season, team);
      for (const p of t.players) {
        if (p.positions.includes(position) && !excludeIds.has(p.id)) pool.push(p);
      }
    }
  }
  return pool;
}

export function gambleOdds(pool, current) {
  const n = pool.length || 1;
  return {
    upgrade: pool.filter((p) => p.ovr > current.ovr).length / n,
    star: pool.filter((p) => p.ovr >= 90).length / n,
    size: pool.length,
  };
}

export const gambleResult = (pool) => pick(pool);

// ------------------------------------------------------------------
// Computer opponent: picks from the same dealt team after you
//   easy: random choice among its three best fits
//   hard: always the best fit (starter spots first)
// ------------------------------------------------------------------
export function computerPick(lineup, players, difficulty) {
  const options = players
    .map((p) => ({ p, place: placementFor(lineup, p) }))
    .filter((x) => x.place)
    .sort((a, b) => (b.place.kind === "starter") - (a.place.kind === "starter") || b.p.ovr - a.p.ovr);
  if (!options.length) return null;
  if (difficulty === "hard") return options[0].p;
  return pick(options.slice(0, 3)).p;
}

// ------------------------------------------------------------------
// Salary cap: every player has a price; you must leave at least 1 per open slot
// ------------------------------------------------------------------
export function spent(lineup) {
  return [...lineup.starters, ...lineup.bench].reduce((sum, s) => sum + (s.player ? s.player.contract ?? priceFor(s.player.ovr) : 0), 0);
}

export function canAfford(sport, lineup, player) {
  const left = SPORTS[sport].salaryBudget - spent(lineup);
  const slotsAfter = openSlots(lineup) - 1;
  return priceFor(player.ovr) <= left - slotsAfter;
}
