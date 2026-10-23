// The Numbers Game: pick the best player from five mystery stat lines, one spot at a time.
//
// Each round deals 5 cards from any era. 0-3 of them are stars (rated 90+); the rest are spread
// across 60-89. Every card shows only some of its stats. Most rounds hide stats at random; about
// one in three is a trap, where the stats shown make a weaker player look best (one honest stat
// is always left visible, so a sharp eye can still see through it). Players are graded on how
// close each pick came to the best card that was on the table.

import { getJSON, shuffle, pick } from "./data.js";

// ------------------------------------------------------------------
// Lineups: one round per spot. `from` = which positions can be dealt; `rate` = which rating counts
// ------------------------------------------------------------------
const spot = (id, label, from = [id], rate = "o") => ({ id, label, from, rate });
export const QUIZ_LINEUPS = {
  basketball: [
    spot("PG", "Point guard"), spot("SG", "Shooting guard"), spot("SF", "Small forward"),
    spot("PF", "Power forward"), spot("C", "Center"),
    spot("6TH", "Sixth man", ["PG", "SG", "SF", "PF", "C"]),
  ],
  football: [
    spot("QB", "Quarterback"), spot("WR", "Wide receiver"), spot("WR", "Wide receiver"),
    spot("RB", "Running back"), spot("TE", "Tight end"),
    spot("FLEX", "Flex", ["RB", "WR", "TE"]),
  ],
  baseball: [
    spot("C", "Catcher"), spot("1B", "First base"), spot("2B", "Second base"), spot("3B", "Third base"),
    spot("SS", "Shortstop"), spot("LF", "Left field"), spot("CF", "Center field"), spot("RF", "Right field"),
    spot("DH", "Designated hitter", ["HIT"], "b"),
    spot("SP", "Starting pitcher"), spot("RP", "Relief pitcher"), spot("CL", "Closer"),
  ],
};

// ------------------------------------------------------------------
// How each stat is shown and judged.
//   better: 1 = higher is better, -1 = lower is better
//   honest: a stat that really tells you how good a player was (kept visible on trap rounds)
// ------------------------------------------------------------------
const int = (v) => Math.round(v).toLocaleString("en-US");
const dec1 = (v) => v.toFixed(1);
const dec2 = (v) => v.toFixed(2);
const avg3 = (v) => v.toFixed(3).replace(/^0/, "");
const pct1 = (v) => `${(v * 100).toFixed(1)}%`;
const S = (fmt, better = 1, honest = false) => ({ fmt, better, honest });

export const STAT_DEFS = {
  HIT: { AVG: S(avg3), HR: S(int), RBI: S(int), R: S(int), SB: S(int), OBP: S(avg3, 1, true), OPS: S(avg3, 1, true) },
  SP: { W: S(int), L: S(int, -1), ERA: S(dec2, -1, true), IP: S(dec1), K: S(int), WHIP: S(dec2, -1, true) },
  RP: { SV: S(int), G: S(int), IP: S(dec1), ERA: S(dec2, -1, true), K: S(int), WHIP: S(dec2, -1, true) },
  BB: { PTS: S(dec1), REB: S(dec1), AST: S(dec1), STL: S(dec1), BLK: S(dec1), "FG%": S(pct1, 1, true), "TS%": S(pct1, 1, true) },
  QB: { YDS: S(int), TD: S(int), INT: S(int, -1, true), "CMP%": S(pct1), "Y/A": S(dec1, 1, true) },
  RB: { YDS: S(int), ATT: S(int), YPC: S(dec1, 1, true), TD: S(int), "REC YDS": S(int) },
  WR: { REC: S(int), YDS: S(int, 1, true), TD: S(int), "Y/R": S(dec1), "YDS/G": S(dec1, 1, true) },
};

const STAR = 90;
const LOW = 60;
// How often a round tries to be a trap. Not every attempt works (the decoy has to genuinely
// out-shine the best card), so these are set so about 1 in 3 rounds end up as traps.
// Football cards have fewer stats to hide, so it tries every round and lands near 28%.
const TRAP_TRY = { basketball: 0.67, baseball: 0.68, football: 1 };
// How many stars a round has: none 20%, one 35%, two 30%, three 15%
const STAR_ODDS = [[0, 0.2], [1, 0.35], [2, 0.3], [3, 0.15]];

export const shownCount = (total) => (total >= 6 ? total - 2 : total - 1);

// ------------------------------------------------------------------
// Loading: turns the compact quiz file into player objects the cards can use
// ------------------------------------------------------------------
export async function loadQuizPool(sport) {
  const raw = await getJSON(`data/quiz/${sport}.json`);
  const players = raw.players.map((p, i) => {
    const names = raw.stats[p.g];
    const stats = Object.fromEntries(names.map((k, j) => [k, p.s[j]]));
    return {
      id: `q${i}`, name: p.n, year: p.y, label: p.l || String(p.y), team: raw.teams[p.t] || "",
      ref: p.r, ovr: p.o, bat: p.b, group: p.g, spots: p.p, stats, positions: p.p.length ? p.p : ["DH"],
    };
  });
  // Sorted values of every stat in every group, for percentiles ("how good does this number look?")
  const sorted = {};
  for (const [group, names] of Object.entries(raw.stats)) {
    sorted[group] = {};
    for (const k of names) {
      sorted[group][k] = players.filter((p) => p.group === group && p.stats[k] != null).map((p) => p.stats[k]).sort((a, b) => a - b);
    }
  }
  return { sport, players, sorted };
}

// 0 (looks worst in history) to 1 (looks best), with "lower is better" stats flipped
function percentile(pool, group, key, value) {
  const arr = pool.sorted[group][key];
  if (value == null || !arr.length) return null;
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < value) lo = mid + 1; else hi = mid; }
  const p = lo / arr.length;
  return STAT_DEFS[group][key].better === 1 ? p : 1 - p;
}

export const ratingFor = (player, round) => (round.rate === "b" ? player.bat : player.ovr);

// ------------------------------------------------------------------
// Dealing a round
// ------------------------------------------------------------------
function rollStars() {
  let r = Math.random();
  for (const [n, odds] of STAR_ODDS) { if ((r -= odds) < 0) return n; }
  return 0;
}

function eligible(pool, round) {
  return pool.players.filter((p) => (round.from.includes("HIT") ? p.group === "HIT" : p.spots.some((s) => round.from.includes(s))));
}

// usedNames: players already shown this quiz, so nobody appears twice
export function dealRound(pool, round, usedNames = new Set()) {
  const candidates = eligible(pool, round).filter((p) => !usedNames.has(p.name) && ratingFor(p, round) != null);
  const taken = new Set();
  const take = (p) => { taken.add(p.name); return p; };
  const free = (p) => !taken.has(p.name);

  const stars = shuffle(candidates.filter((p) => ratingFor(p, round) >= STAR));
  const cards = [];
  const starCount = rollStars();
  for (const p of stars) { if (cards.length >= starCount) break; if (free(p)) cards.push(take(p)); }

  // The rest: aim for a random rating between 60 and 89 each time, so rounds range from
  // lopsided to razor-close
  const byRating = new Map();
  for (const p of candidates) {
    const r = ratingFor(p, round);
    if (r >= LOW && r < STAR) { if (!byRating.has(r)) byRating.set(r, []); byRating.get(r).push(p); }
  }
  let guard = 0;
  while (cards.length < 5 && guard++ < 200) {
    const target = LOW + Math.floor(Math.random() * (STAR - LOW));
    for (let d = 0; d < 30; d++) {
      const options = [...(byRating.get(target + d) || []), ...(d ? byRating.get(target - d) || [] : [])].filter(free);
      if (options.length) { cards.push(take(pick(options))); break; }
    }
  }
  const dealt = shuffle(cards).map((player) => ({ player, rating: ratingFor(player, round) }));
  const { cards: shownCards, trap } = chooseShownStats(pool, dealt, Math.random() < (TRAP_TRY[pool.sport] ?? 0.67));
  return { round, cards: shownCards, trap };
}

// ------------------------------------------------------------------
// Which stats each card shows
// ------------------------------------------------------------------
function available(player) {
  return Object.keys(STAT_DEFS[player.group]).filter((k) => player.stats[k] != null);
}

function randomShown(player) {
  const keys = available(player);
  const n = Math.min(shownCount(Object.keys(STAT_DEFS[player.group]).length), keys.length);
  const honest = keys.filter((k) => STAT_DEFS[player.group][k].honest);
  const first = honest.length ? [pick(honest)] : [];
  const rest = shuffle(keys.filter((k) => !first.includes(k))).slice(0, n - first.length);
  return new Set([...first, ...rest]);
}

// Shows a card at its best (bestLook) or worst (worstLook): its most (or least) flattering stats,
// plus its strongest honest stat either way, so the truth is always somewhere on the table.
function slantedShown(pool, player, flattering) {
  const g = player.group;
  const keys = available(player);
  const n = Math.min(shownCount(Object.keys(STAT_DEFS[g]).length), keys.length);
  const look = (k) => percentile(pool, g, k, player.stats[k]);
  const honest = keys.filter((k) => STAT_DEFS[g][k].honest).sort((a, b) => look(b) - look(a));
  const others = keys.filter((k) => !STAT_DEFS[g][k].honest).sort((a, b) => (flattering ? look(b) - look(a) : look(a) - look(b)));
  const shown = honest.length ? [honest[0]] : [];
  for (const k of [...others, ...honest.slice(1)]) { if (shown.length >= n) break; shown.push(k); }
  return new Set(shown);
}

// How good the flashy (non-honest) stats a card shows look, on average
function flashyLook(pool, player, shown) {
  const looks = [...shown].filter((k) => !STAT_DEFS[player.group][k].honest)
    .map((k) => percentile(pool, player.group, k, player.stats[k])).filter((v) => v != null);
  return looks.length ? looks.reduce((a, b) => a + b, 0) / looks.length : 0;
}

// Returns { cards, trap }. A trap only counts if the decoy's flashy stats really do look better
// than the top card's (or cards', when two are within 2 points); each weaker card is tried as the
// decoy until one works. Cards in between are left alone, so they might lure you too.
function chooseShownStats(pool, dealt, wantTrap) {
  const best = Math.max(...dealt.map((c) => c.rating));
  if (wantTrap) {
    const decoys = dealt.filter((c) => c.rating < best - 2).map((c) => {
      const shown = slantedShown(pool, c.player, true);
      return { card: c, shown, look: flashyLook(pool, c.player, shown) };
    }).sort((a, b) => b.look - a.look);
    for (const decoy of decoys) {
      const plan = dealt.map((c) => {
        if (c === decoy.card) return { ...c, shown: decoy.shown };
        if (c.rating >= best - 2) return { ...c, shown: slantedShown(pool, c.player, false) };
        return { ...c, shown: randomShown(c.player) };
      });
      const fooled = plan.filter((c) => c.rating >= best - 2)
        .every((c) => flashyLook(pool, c.player, c.shown) < decoy.look);
      if (fooled) return { cards: plan, trap: true };
    }
  }
  return { cards: dealt.map((c) => ({ ...c, shown: randomShown(c.player) })), trap: false };
}

// ------------------------------------------------------------------
// Grading: how close each pick came to the best card on the table
// ------------------------------------------------------------------
export function credit(cards, chosen) {
  const ratings = cards.map((c) => c.rating);
  const best = Math.max(...ratings), worst = Math.min(...ratings);
  return best === worst ? 1 : (chosen.rating - worst) / (best - worst);
}

export const bestCard = (cards) => cards.reduce((a, b) => (b.rating > a.rating ? b : a));

const GRADES = [[95, "A+"], [85, "A"], [70, "B"], [55, "C"], [40, "D"], [0, "F"]];
export function gradeFor(pct) {
  return GRADES.find(([min]) => pct >= min)[1];
}

// picks: one per round, { cards, chosen }
export function summarize(picks) {
  const credits = picks.map((p) => credit(p.cards, p.chosen));
  const pct = (100 * credits.reduce((a, b) => a + b, 0)) / Math.max(picks.length, 1);
  const avg = (list) => list.reduce((a, b) => a + b, 0) / Math.max(list.length, 1);
  return {
    pct, grade: gradeFor(pct),
    teamRating: avg(picks.map((p) => p.chosen.rating)),
    bestRating: avg(picks.map((p) => bestCard(p.cards).rating)),
    bestPicks: picks.filter((p) => p.chosen === bestCard(p.cards)).length,
  };
}

export const formatStat = (group, key, value) => (value == null ? "—" : STAT_DEFS[group][key].fmt(value));

// ------------------------------------------------------------------
// Records kept in this browser (solo games only)
// ------------------------------------------------------------------
const RECORDS_KEY = "numbersGame.v1";
const EMPTY = { best: {}, trapRounds: 0, trapHits: 0, streak: 0, bestStreak: 0, games: 0 };

export function loadRecords() {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(RECORDS_KEY) || "{}") }; } catch { return { ...EMPTY }; }
}

export function saveRecords(sport, picks) {
  const rec = loadRecords();
  const { pct } = summarize(picks);
  const isNewBest = rec.best[sport] == null || pct > rec.best[sport];
  if (isNewBest) rec.best[sport] = pct;
  rec.games += 1;
  for (const p of picks) {
    const hit = p.chosen === bestCard(p.cards);
    if (p.trap) { rec.trapRounds += 1; if (hit) rec.trapHits += 1; }
    rec.streak = hit ? rec.streak + 1 : 0;
    rec.bestStreak = Math.max(rec.bestStreak, rec.streak);
  }
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch { /* private window: records just aren't kept */ }
  return { ...rec, isNewBest };
}
