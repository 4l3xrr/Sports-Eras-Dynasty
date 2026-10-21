// calibrate.mjs
// Checks how well team ratings predict real records, and finds each sport's best
// "variance" (upset factor) for src/game/sports.js.
//
//   node scripts/calibrate.mjs
//
// For every real team-season: rating = its best lineup under the game's rules.
// Predicted win % = average chance of beating each other team that season.

import fs from "node:fs";
import path from "node:path";
import { bestLineup, teamRating } from "../src/game/draft.js";
import { PLAYABLE, SPORTS } from "../src/game/sports.js";

const DATA = path.resolve("public/data");
const winProb = (a, b, k) => 1 / (1 + Math.exp(-(a - b) / k));
const pct = (rec) => {
  const [w, l, t = 0] = String(rec || "").split("-").map(Number);
  return w + l + t ? (w + t / 2) / (w + l + t) : null;
};
const corr = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};

for (const sport of PLAYABLE) {
  const dir = path.join(DATA, sport);
  if (!fs.existsSync(dir)) continue;
  const seasons = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const rows = [];
  for (const s of seasons) {
    const teams = s.teams.map((t) => ({ r: teamRating(sport, bestLineup(sport, t.players)), real: pct(t.record), year: s.year }))
      .filter((t) => t.real !== null);
    for (const t of teams) rows.push({ ...t, others: teams.filter((o) => o !== t).map((o) => o.r) });
  }
  let best = null;
  for (let k = 2; k <= 30; k += 0.5) {
    let err = 0;
    for (const t of rows) {
      const p = t.others.reduce((a, o) => a + winProb(t.r, o, k), 0) / t.others.length;
      err += (p - t.real) ** 2;
    }
    if (!best || err < best.err) best = { k, err };
  }
  const report = (label, subset) => subset.length > 20 &&
    console.log(`  ${label}: rating vs real win% correlation ${corr(subset.map((t) => t.r), subset.map((t) => t.real)).toFixed(2)} (${subset.length} teams)`);
  console.log(`${SPORTS[sport].name}: best variance ${best.k} (currently ${SPORTS[sport].variance})`);
  report("all seasons", rows);
  const split = { baseball: 1980, basketball: 1980, football: 1982 }[sport];
  report(`before ${split}`, rows.filter((t) => t.year < split));
  report(`${split} on`, rows.filter((t) => t.year >= split));
  const ratings = rows.map((t) => t.r).sort((a, b) => a - b);
  console.log(`  real team ratings: ${ratings[0].toFixed(1)} to ${ratings[ratings.length - 1].toFixed(1)}, middle ${ratings[Math.floor(ratings.length / 2)].toFixed(1)}`);
}
