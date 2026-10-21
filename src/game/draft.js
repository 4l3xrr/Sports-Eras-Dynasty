// Lineups and the draft rules.
// A lineup has one starter slot per position (e.g. two WR slots) plus bench slots.
// A player fills an open starter slot at one of his positions; if those are taken,
// he can only go to the bench.

import { SPORTS } from "./sports.js";

export const EMPTY_SLOT_RATING = 55;

export function createLineup(sport) {
  const cfg = SPORTS[sport];
  const starters = [];
  cfg.slots.forEach(([pos, n]) => { for (let i = 0; i < n; i++) starters.push({ pos, player: null }); });
  const bench = Array.from({ length: cfg.bench }, () => ({ pos: "BN", player: null }));
  return { starters, bench, history: [] };
}

export function placementFor(lineup, player) {
  for (const pos of player.positions) {
    const i = lineup.starters.findIndex((s) => s.pos === pos && !s.player);
    if (i > -1) return { kind: "starter", index: i, pos };
  }
  if (player.unit) return null;                 // a whole O-Line can't sit on the bench
  const b = lineup.bench.findIndex((s) => !s.player);
  return b > -1 ? { kind: "bench", index: b, pos: "BN" } : null;
}

// Returns a new lineup (React state should never be changed in place)
export function draftInto(lineup, player) {
  const place = placementFor(lineup, player);
  if (!place) return { lineup, place: null };
  const next = clone(lineup);
  (place.kind === "starter" ? next.starters : next.bench)[place.index].player = player;
  next.history.push(place);
  return { lineup: next, place };
}

export function undoLast(lineup) {
  if (!lineup.history.length) return { lineup, player: null };
  const next = clone(lineup);
  const last = next.history.pop();
  const list = last.kind === "starter" ? next.starters : next.bench;
  const player = list[last.index].player;
  list[last.index].player = null;
  return { lineup: next, player };
}

export function replaceAt(lineup, kind, index, player) {
  const next = clone(lineup);
  (kind === "starter" ? next.starters : next.bench)[index].player = player;
  return next;
}

export const allSlots = (l) => [...l.starters, ...l.bench];
export const filledCount = (l) => allSlots(l).filter((s) => s.player).length;
export const isComplete = (l) => filledCount(l) === allSlots(l).length;
export const openSlots = (l) => allSlots(l).length - filledCount(l);
export const draftedIds = (l) => new Set(allSlots(l).filter((s) => s.player).map((s) => s.player.id));

function clone(l) {
  return { starters: l.starters.map((s) => ({ ...s })), bench: l.bench.map((s) => ({ ...s })), history: [...l.history] };
}

// Team strength: 85% starters, 15% bench. An O-Line counts double (it's five players).
export function teamRating(sport, lineup) {
  const weights = SPORTS[sport].unitWeight || {};
  let total = 0, weight = 0;
  for (const s of lineup.starters) {
    const w = weights[s.pos] || 1;
    total += (s.player ? s.player.ovr : EMPTY_SLOT_RATING) * w;
    weight += w;
  }
  const bench = lineup.bench.map((s) => (s.player ? s.player.ovr : EMPTY_SLOT_RATING));
  const benchAvg = bench.length ? bench.reduce((a, b) => a + b, 0) / bench.length : EMPTY_SLOT_RATING;
  return (total / weight) * 0.85 + benchAvg * 0.15;
}

// A real team fields its best lineup under the same rules: best players first.
export function bestLineup(sport, players) {
  let lineup = createLineup(sport);
  for (const p of [...players].sort((a, b) => b.ovr - a.ovr)) {
    if (isComplete(lineup)) break;
    lineup = draftInto(lineup, p).lineup;
  }
  return lineup;
}
