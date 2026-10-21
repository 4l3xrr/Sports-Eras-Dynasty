import { useState } from "react";
import { draftedIds, replaceAt } from "../game/draft.js";
import { gamblePool, gambleOdds, gambleResult } from "../game/modes.js";
import { PlayerCard, FlipCard } from "./PlayerCard.jsx";

// One optional gamble after the draft: swap a player for a random one at the same
// position from your era. Odds show first (hidden in blind mode).
export default function Gamble({ sport, era, lineup, blind, title, exclude, onDone }) {
  const slots = [
    ...lineup.starters.map((s, i) => ({ ...s, kind: "starter", index: i })),
    ...lineup.bench.map((s, i) => ({ ...s, kind: "bench", index: i })),
  ];
  const [chosen, setChosen] = useState(null);
  const [pool, setPool] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [revealed, setRevealed] = useState(false);

  async function choose(slot) {
    setChosen(slot);
    setPool(null);
    setLoading(true);
    const position = slot.kind === "starter" ? slot.pos : slot.player.positions[0];
    const taken = new Set((exclude || [lineup]).flatMap((l) => [...draftedIds(l)]));
    const p = await gamblePool(sport, era, position, taken);
    setPool({ position, players: p, odds: gambleOdds(p, slot.player) });
    setLoading(false);
  }

  function roll() {
    const pickd = gambleResult(pool.players);
    setResult(pickd);
    setRevealed(false);
    setTimeout(() => setRevealed(true), 350);
  }

  const pct = (x) => `${Math.round(x * 100)}%`;

  if (result) {
    const better = result.ovr > chosen.player.ovr;
    const next = replaceAt(lineup, chosen.kind, chosen.index, result);
    return (
      <section className="gamble fade">
        <div className="intro" style={{ marginBottom: 0 }}>
          <span className="eyebrow">{title || "The gamble"}</span>
          <h1>{revealed ? (blind ? "Your new player" : better ? "It paid off" : result.ovr === chosen.player.ovr ? "Even trade" : "It backfired") : "Revealing…"}</h1>
        </div>
        <div className="stage">
          <div style={{ width: 230, opacity: 0.55 }}><PlayerCard player={chosen.player} sport={sport} hidden={blind} /></div>
          <span style={{ font: "700 28px var(--display)", color: "var(--muted)" }}>→</span>
          <div style={{ width: 230 }}>{blind ? <PlayerCard player={result} sport={sport} hidden /> : <FlipCard player={result} sport={sport} revealed={revealed} />}</div>
        </div>
        <div className="actions" style={{ maxWidth: 320 }}>
          <button className="btn primary" onClick={() => onDone(next)}>Play the season</button>
        </div>
      </section>
    );
  }

  return (
    <section className="gamble fade">
      <div className="intro" style={{ marginBottom: 0 }}>
        <span className="eyebrow">{title ? `${title} · optional` : "Optional · once per draft"}</span>
        <h1>Gamble a player?</h1>
        <p>Pick one of your players. He's swapped for a random player at the same position from your era, better or worse. {blind ? "In blind mode, the odds stay hidden too." : "The odds show before you commit."}</p>
      </div>
      <div className="pickers">
        {slots.map((s) => (
          <button key={`${s.kind}${s.index}`} className={chosen === s || (chosen && chosen.kind === s.kind && chosen.index === s.index) ? "on" : ""} onClick={() => choose(s)}>
            <span className="slotlabel">{s.kind === "starter" ? s.pos : "BENCH"}</span>
            <b style={{ fontSize: 14 }}>{s.player.name}</b>
            <span className="muted" style={{ fontSize: 12 }}>{blind ? "Rating hidden" : `Rated ${s.player.ovr}`}</span>
          </button>
        ))}
      </div>
      {chosen && (
        <div className="panel box">
          {loading || !pool ? <span className="muted">Checking the {chosen.kind === "starter" ? chosen.pos : "position"} pool…</span> : (
            <>
              <span className="eyebrow">Gamble {chosen.player.name}</span>
              {blind ? (
                <p className="muted" style={{ margin: 0 }}>Odds hidden in blind mode. {pool.odds.size} possible players at {pool.position}.</p>
              ) : (
                <div className="odds">
                  <span>Chance of an upgrade: <b>{pct(pool.odds.upgrade)}</b></span>
                  <span>Chance of a 90+ player: <b>{pct(pool.odds.star)}</b></span>
                  <span className="muted" style={{ fontSize: 12.5 }}>Drawn from {pool.odds.size} {pool.position} player-seasons in your era.</span>
                </div>
              )}
              <div className="actions" style={{ maxWidth: 360 }}>
                <button className="btn primary" disabled={!pool.players.length} onClick={roll}>Gamble</button>
              </div>
            </>
          )}
        </div>
      )}
      <div className="actions" style={{ maxWidth: 320 }}>
        <button className="btn" onClick={() => onDone(lineup)}>Skip the gamble</button>
      </div>
    </section>
  );
}
