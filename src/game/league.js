// Building a league of real teams, playing a full schedule, the table, and the playoffs.

import { SPORTS, DIFFICULTY, CONTENDER_SHARE } from "./sports.js";
import { bestLineup, teamRating } from "./draft.js";
import { seasonsInEra, loadSeason, shuffle, winPct, withContext } from "./data.js";

export function winProbability(a, b, variance) {
  return 1 / (1 + Math.exp(-(a - b) / variance));
}

// ------------------------------------------------------------------
// 1. Choosing the league's teams
// ------------------------------------------------------------------
// Contenders: the top CONTENDER_SHARE of teams (by real record) from seasons in your era.
// Today's league: every team from the most recent season, plus a difficulty boost.
export async function chooseOpponents({ sport, era, leagueType, count }) {
  if (leagueType === "today") {
    const all = await seasonsInEra(sport, { from: 0, to: 9999 });
    const latest = all[all.length - 1];
    const season = await loadSeason(sport, latest);
    return shuffle(season.teams).slice(0, count).map((t) => withContext(sport, season, t));
  }
  const ranked = [];                               // every loaded season's teams, best first
  const picked = [];
  for (const entry of shuffle(await seasonsInEra(sport, era))) {
    const season = await loadSeason(sport, entry);
    const teams = season.teams
      .map((t) => ({ t, pct: winPct(t.record) }))
      .filter((x) => x.pct !== null)
      .sort((a, b) => b.pct - a.pct);
    const top = Math.max(1, Math.ceil(teams.length * CONTENDER_SHARE));
    teams.forEach((x, rank) => (rank < top ? picked : ranked).push({ ...x, rank, season }));
    if (picked.length >= count) break;
  }
  // Short eras may not have enough top teams: fill with the next-best teams
  ranked.sort((a, b) => a.rank - b.rank || b.pct - a.pct);
  const league = [...shuffle(picked).slice(0, count), ...ranked.slice(0, Math.max(0, count - picked.length))];
  return league.map(({ t, season }) => withContext(sport, season, t));
}

export function makeLeagueTeam(sport, team, { boost = 0 } = {}) {
  const lineup = bestLineup(sport, team.players);
  return {
    id: team.id,
    name: `${team.label} ${team.name}`,
    shortName: team.name,
    label: team.label,
    code: team.code,
    realRecord: team.record,
    lineup,
    rating: teamRating(sport, lineup) + boost,
  };
}

// ------------------------------------------------------------------
// 2. Schedule: round-robin rounds (everyone plays once per round), repeated
//    until each team has played the sport's season length.
// ------------------------------------------------------------------
function roundRobin(n) {
  const ids = [...Array(n).keys()];
  if (n % 2) ids.push(-1);                      // bye
  const rounds = [];
  const m = ids.length;
  for (let r = 0; r < m - 1; r++) {
    const round = [];
    for (let i = 0; i < m / 2; i++) {
      const a = ids[i], b = ids[m - 1 - i];
      if (a !== -1 && b !== -1) round.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(round);
    ids.splice(1, 0, ids.pop());                // rotate all but the first
  }
  return rounds;
}

export function playSeason(sport, teams, userIndex, tracked = [userIndex]) {
  const cfg = SPORTS[sport];
  const cycle = roundRobin(teams.length);
  const order = shuffle(cycle);
  const table = teams.map(() => ({ W: 0, L: 0 }));
  const games = Object.fromEntries(tracked.map((i) => [i, []]));   // game logs for you (and your rival)
  for (let r = 0; r < cfg.season; r++) {
    for (const [a, b] of order[r % order.length]) {
      const aWins = Math.random() < winProbability(teams[a].rating, teams[b].rating, cfg.variance);
      const w = aWins ? a : b, l = aWins ? b : a;
      table[w].W++;
      table[l].L++;
      if (games[w]) games[w].push({ res: "W", opp: l });
      if (games[l]) games[l].push({ res: "L", opp: w });
    }
  }
  const standings = teams
    .map((t, i) => ({ index: i, ...table[i], pct: table[i].W / Math.max(1, table[i].W + table[i].L) }))
    .sort((x, y) => y.pct - x.pct || teams[y.index].rating - teams[x.index].rating)
    .map((row, rank) => ({ ...row, rank: rank + 1 }));
  return { standings, games, userGames: games[userIndex] };
}

// ------------------------------------------------------------------
// 3. Conferences and playoffs (real formats)
// ------------------------------------------------------------------
// Two conferences. You go in the first, your rival (computer or friend) in the second,
// so the only playoff meeting possible is the final.
export function assignConferences(teamCount, rivalIndex) {
  const conf = Array(teamCount).fill(0);
  let a = 1, b = rivalIndex >= 0 ? 1 : 0;          // you are already in conference 0
  if (rivalIndex >= 0) conf[rivalIndex] = 1;
  for (let i = 1; i < teamCount; i++) {
    if (i === rivalIndex) continue;
    if (a <= b) { conf[i] = 0; a++; } else { conf[i] = 1; b++; }
  }
  return conf;
}

function playSeries(sport, teams, x, y, bestOf) {
  const cfg = SPORTS[sport];
  const need = Math.ceil(bestOf / 2);
  let w = 0, l = 0;
  while (w < need && l < need) {
    if (Math.random() < winProbability(teams[x].rating, teams[y].rating, cfg.variance)) w++; else l++;
  }
  return { hi: x, lo: y, hiWins: w, loWins: l, winner: w > l ? x : y, loser: w > l ? y : x, bestOf };
}

// Each format plays one conference's bracket. seeds = team indices, best first.
// Returns the champion and a list of rounds (same order as cfg.playoffs.rounds, minus the final).
const FORMATS = {
  // MLB: 3v6 and 4v5 (best of 3), then 1 v winner(4/5) and 2 v winner(3/6) (best of 5), then best of 7
  mlb(play, s, rounds) {
    const wc = [play(s[2], s[5], rounds[0][1]), play(s[3], s[4], rounds[0][1])];
    const ds = [play(s[0], wc[1].winner, rounds[1][1]), play(s[1], wc[0].winner, rounds[1][1])];
    const cs = [play(...bySeed(s, ds[0].winner, ds[1].winner), rounds[2][1])];
    return { champ: cs[0].winner, rounds: [wc, ds, cs] };
  },
  // NFL: 2v7, 3v6, 4v5; then the top seed hosts the lowest seed left; all single games
  nfl(play, s, rounds) {
    const wc = [play(s[1], s[6], 1), play(s[2], s[5], 1), play(s[3], s[4], 1)];
    const left = [s[0], ...wc.map((g) => g.winner)].sort((x, y) => s.indexOf(x) - s.indexOf(y));
    const div = [play(left[0], left[3], 1), play(left[1], left[2], 1)];
    const conf = [play(...bySeed(s, div[0].winner, div[1].winner), 1)];
    return { champ: conf[0].winner, rounds: [wc, div, conf] };
  },
  // NBA: Play-In (7v8 winner is the 7 seed; loser plays the 9v10 winner for the 8 seed),
  // then 1v8, 4v5, 2v7, 3v6, best of 7 all the way
  nba(play, s, rounds) {
    const g1 = play(s[6], s[7], 1), g2 = play(s[8], s[9], 1), g3 = play(g1.loser, g2.winner, 1);
    const seeds = [...s.slice(0, 6), g1.winner, g3.winner];
    const r1 = [play(seeds[0], seeds[7], 7), play(seeds[3], seeds[4], 7), play(seeds[1], seeds[6], 7), play(seeds[2], seeds[5], 7)];
    const r2 = [play(...bySeed(seeds, r1[0].winner, r1[1].winner), 7), play(...bySeed(seeds, r1[2].winner, r1[3].winner), 7)];
    const cf = [play(...bySeed(seeds, r2[0].winner, r2[1].winner), 7)];
    return { champ: cf[0].winner, rounds: [[g1, g2, g3], r1, r2, cf], seeds };
  },
};
const bySeed = (s, x, y) => (s.indexOf(x) <= s.indexOf(y) ? [x, y] : [y, x]);

export function playPlayoffs(sport, teams, standings, conf) {
  const cfg = SPORTS[sport];
  const { format, perConference, rounds } = cfg.playoffs;
  const play = (x, y, bestOf) => playSeries(sport, teams, x, y, bestOf);
  const order = standings.map((r) => r.index);
  const reached = Object.fromEntries(teams.map((_, i) => [i, { stage: 0, text: "Missed the playoffs" }]));
  const confResults = [0, 1].map((c) => {
    const seeds = order.filter((i) => conf[i] === c).slice(0, perConference);
    const result = FORMATS[format](play, seeds, rounds);
    result.seeds = result.seeds || seeds;
    result.allSeeds = seeds;
    return result;
  });
  // Merge both conferences round by round, then the final
  const merged = rounds.slice(0, -1).map(([name, bestOf], r) => ({
    name, bestOf, series: confResults.flatMap((cr, c) => cr.rounds[r].map((g) => ({ ...g, conf: c }))),
  }));
  const [finalName, finalBestOf] = rounds[rounds.length - 1];
  const final = playSeries(sport, teams, ...bySeedOverall(order, confResults[0].champ, confResults[1].champ), finalBestOf);
  merged.push({ name: finalName, bestOf: finalBestOf, series: [{ ...final, conf: -1 }] });

  // How far every team got: stage = number of rounds won (+1 for being in the playoffs)
  merged.forEach((round, r) => round.series.forEach((g) => {
    reached[g.winner] = { stage: r + 2, text: "Made the playoffs" };
    const lostIn = r === merged.length - 1 ? `Lost the ${round.name}` : `Lost in the ${round.name}`;
    reached[g.loser] = { stage: r + 1, text: lostIn };
  }));
  reached[final.winner] = { stage: merged.length + 1, text: "Champions", champion: true };
  return { rounds: merged, champion: final.winner, reached, conferences: confResults };
}
const bySeedOverall = (order, x, y) => (order.indexOf(x) <= order.indexOf(y) ? [x, y] : [y, x]);

export function outcomeOf(playoffs, index) {
  return playoffs.reached[index];
}

// Who won the rivalry: furthest in the playoffs, then regular-season meetings, then record
export function rivalry(playoffs, season, a, b) {
  const ra = playoffs.reached[a], rb = playoffs.reached[b];
  const met = playoffs.rounds.flatMap((r) => r.series.map((g) => ({ ...g, round: r.name })))
    .find((g) => (g.hi === a && g.lo === b) || (g.hi === b && g.lo === a));
  const meetings = season.userGames.filter((g) => g.opp === b);
  const h2h = { a: meetings.filter((g) => g.res === "W").length, b: meetings.filter((g) => g.res === "L").length };
  const pct = (i) => season.standings.find((r) => r.index === i).pct;
  let winner, reason;
  if (met) { winner = met.winner; reason = `won the ${met.round}${met.bestOf > 1 ? ` ${Math.max(met.hiWins, met.loWins)}-${Math.min(met.hiWins, met.loWins)}` : ""}`; }
  else if (ra.stage !== rb.stage) { winner = ra.stage > rb.stage ? a : b; reason = "went further in the playoffs"; }
  else if (h2h.a !== h2h.b) { winner = h2h.a > h2h.b ? a : b; reason = `won the regular-season series ${Math.max(h2h.a, h2h.b)}-${Math.min(h2h.a, h2h.b)}`; }
  else { winner = pct(a) >= pct(b) ? a : b; reason = "had the better record"; }
  return { winner, reason, met, h2h };
}

export function difficultyBoost(id) {
  return (DIFFICULTY.find((d) => d.id === id) || DIFFICULTY[0]).boost;
}
