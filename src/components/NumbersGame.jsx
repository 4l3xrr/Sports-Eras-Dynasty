import { useEffect, useMemo, useState } from "react";
import { SPORTS, tierOf } from "../game/sports.js";
import {
  QUIZ_LINEUPS, STAT_DEFS, loadQuizPool, dealRound, credit, bestCard, summarize, formatStat,
  loadRecords, saveRecords, gradeFor,
} from "../game/quiz.js";
import { Avatar } from "./PlayerCard.jsx";

// ------------------------------------------------------------------
// Setup: solo or a friend on the same device
// ------------------------------------------------------------------
export function NumbersSetup({ sport, onStart, onBack }) {
  const [mode, setMode] = useState("solo");
  const [names, setNames] = useState(["Player 1", "Player 2"]);
  const records = loadRecords();
  const rounds = QUIZ_LINEUPS[sport];
  const best = records.best[sport];

  function start() {
    const players = mode === "solo" ? ["You"] : names.map((n, i) => n.trim() || `Player ${i + 1}`);
    onStart(players);
  }

  return (
    <section className="setup fade">
      <div className="intro">
        <span className="eyebrow">{SPORTS[sport].name} · The Numbers Game</span>
        <h1>Trust the numbers?</h1>
        <p>
          Each round shows five mystery players for one spot: no names, no faces, just the year and some of their stats.
          Pick who you think was best. Some rounds have no stars, some have three, and some stat lines are chosen to fool you.
        </p>
      </div>

      <section>
        <span className="eyebrow">Your {rounds.length} rounds</span>
        <div className="spot-row">{rounds.map((r, i) => <span key={i} className="pos">{r.label}</span>)}</div>
      </section>

      <section>
        <span className="eyebrow">Players</span>
        <div className="options">
          <button className={`option${mode === "solo" ? " on" : ""}`} onClick={() => setMode("solo")}>
            <b>Solo</b><small>Beat your best grade</small>
          </button>
          <button className={`option${mode === "friend" ? " on" : ""}`} onClick={() => setMode("friend")}>
            <b>Vs a friend</b><small>Same cards, pass the device</small>
          </button>
        </div>
        {mode === "friend" && (
          <div className="names">
            {names.map((n, i) => (
              <label key={i}>
                <span className="eyebrow">Player {i + 1}</span>
                <input value={n} maxLength={18} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="rules panel">
        <div><b>Grading</b><span>Every round, the best card on the table is worth full credit and the worst is worth none. Your grade is how close you came across all {rounds.length} rounds.</span></div>
        <div><b>Peek</b><span>Once per game, you can uncover one hidden stat on any card.</span></div>
        {records.games > 0 && (
          <div><b>Your records</b><span>
            {best != null ? `Best ${SPORTS[sport].name.toLowerCase()} grade: ${gradeFor(best)} (${Math.round(best)}%). ` : ""}
            {records.trapRounds ? `Best card picked on ${Math.round((100 * records.trapHits) / records.trapRounds)}% of trap rounds. ` : ""}
            Longest streak of best picks: {records.bestStreak}.
          </span></div>
        )}
      </section>

      <div className="actions">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn primary" onClick={start}>Start</button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// One mystery card
// ------------------------------------------------------------------
function QuizCard({ card, sport, round, state, peekable, peeked, onPeek, onPick, revealed, pickedBy, isBest, roundCredit }) {
  const p = card.player;
  const keys = Object.keys(STAT_DEFS[p.group]);
  const position = round.rate === "b" ? "Hitter" : p.positions[0];
  const visible = (k) => revealed || card.shown.has(k) || peeked.has(k);
  const tier = revealed ? tierOf(card.rating) : "hidden";
  return (
    <div className={`qcard ${tier}${state === "chosen" ? " chosen" : ""}${revealed && isBest ? " best" : ""}`}>
      <button className="qface" disabled={!onPick} onClick={onPick} aria-pressed={state === "chosen"}>
        <div className="qtop">
          <span className="qyear">{p.label}</span>
          <span className="pos">{position}</span>
        </div>
        <div className="qwho">
          {revealed ? (
            <>
              <Avatar player={{ ...p, teamCode: undefined }} sport={sport} />
              <div className="qname">{p.name}</div>
              <div className="qteam">{p.team}</div>
            </>
          ) : (
            <>
              <span className="qmystery">?</span>
              <div className="qname muted">Mystery player</div>
            </>
          )}
        </div>
      </button>
      <dl className="qstats">
        {keys.map((k) => {
          const shown = visible(k);
          const wasHidden = revealed && !card.shown.has(k) && !peeked.has(k);
          return (
            <div key={k} className={`${wasHidden ? "washidden" : ""}${peeked.has(k) ? " peeked" : ""}`}>
              <dt>{k}</dt>
              <dd>
                {shown ? formatStat(p.group, k, p.stats[k])
                  : peekable && p.stats[k] != null ? <button className="peekbtn" onClick={() => onPeek(k)} aria-label={`Peek at ${k}`}>peek</button>
                  : <span className="locked" aria-label="Hidden">••</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      {revealed && (
        <div className="qfoot">
          <span className={`ovr-chip ${tierOf(card.rating)}`}>{card.rating}</span>
          <span className="qtags">
            {isBest && <span className="badge best">Best</span>}
            {pickedBy.map((n) => <span key={n} className="badge pick">{n}</span>)}
            {pickedBy.length > 0 && <span className="qcredit num">{Math.round(roundCredit * 100)}%</span>}
          </span>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// The game
// ------------------------------------------------------------------
export default function NumbersGame({ sport, players, onAgain, onNewSetup, onChangeSport }) {
  const rounds = QUIZ_LINEUPS[sport];
  const friend = players.length > 1;
  const [pool, setPool] = useState(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [deal, setDeal] = useState(null);
  const [used, setUsed] = useState(() => new Set());
  const [picks, setPicks] = useState(() => players.map(() => []));       // per player: [{cards, chosen, trap, round}]
  const [current, setCurrent] = useState([]);                             // this round's choices, per turn
  const [turn, setTurn] = useState(0);                                   // position in this round's turn order
  const [phase, setPhase] = useState("pick");                            // pick | pass | reveal | done
  const [selected, setSelected] = useState(null);
  const [peeksLeft, setPeeksLeft] = useState(() => players.map(() => 1));
  const [peekMode, setPeekMode] = useState(false);
  const [peeks, setPeeks] = useState({});                                // `${player}:${card}` -> Set of stat keys
  const [records, setRecords] = useState(null);

  const order = useMemo(() => (friend ? (index % 2 ? [1, 0] : [0, 1]) : [0]), [friend, index]);
  const who = order[turn];

  useEffect(() => {
    loadQuizPool(sport).then(setPool).catch(() => setError("Couldn't load the player pool. Run the build scripts first (see the README)."));
  }, [sport]);

  useEffect(() => {
    if (!pool) return;
    const d = dealRound(pool, rounds[index], used);
    setDeal(d);
    setUsed((u) => new Set([...u, ...d.cards.map((c) => c.player.name)]));
    setCurrent([]); setTurn(0); setSelected(null); setPhase("pick"); setPeekMode(false); setPeeks({});
    window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, index]);

  if (error) return <p className="muted">{error}</p>;
  if (!pool || !deal) return <p className="muted">Shuffling every season in history…</p>;

  const round = rounds[index];
  const peekedFor = (playerIdx, cardIdx) => peeks[`${playerIdx}:${cardIdx}`] || new Set();

  function peek(cardIdx, key) {
    const k = `${who}:${cardIdx}`;
    setPeeks({ ...peeks, [k]: new Set([...(peeks[k] || []), key]) });
    setPeeksLeft(peeksLeft.map((n, i) => (i === who ? n - 1 : n)));
    setPeekMode(false);
  }

  function lockIn() {
    const chosen = deal.cards[selected];
    const next = [...current, { player: who, cardIdx: selected, chosen }];
    setCurrent(next);
    setSelected(null);
    setPeekMode(false);
    if (turn + 1 < order.length) { setTurn(turn + 1); setPhase("pass"); return; }
    setPicks(picks.map((list, i) => {
      const mine = next.find((c) => c.player === i);
      return [...list, { round, cards: deal.cards, chosen: mine.chosen, trap: deal.trap }];
    }));
    setPhase("reveal");
  }

  function nextRound() {
    if (index + 1 < rounds.length) { setIndex(index + 1); return; }
    if (!friend) setRecords(saveRecords(sport, picks[0]));
    setPhase("done");
    window.scrollTo({ top: 0 });
  }

  if (phase === "done") {
    return <NumbersResults sport={sport} players={players} picks={picks} records={records}
      onAgain={onAgain} onNewSetup={onNewSetup} onChangeSport={onChangeSport} />;
  }

  const best = bestCard(deal.cards);
  const revealed = phase === "reveal";

  return (
    <section className="quiz fade">
      <div className="quiz-head">
        <div>
          <span className="eyebrow">Round {index + 1} of {rounds.length}</span>
          <h2>{round.label}</h2>
          {round.from.length > 1 && !round.from.includes("HIT") && <p className="muted small">Any of: {round.from.join(", ")}</p>}
          {round.rate === "b" && <p className="muted small">Any hitter. Judged on hitting alone.</p>}
        </div>
        <div className="quiz-progress" aria-hidden="true">
          {rounds.map((_, i) => <i key={i} className={i < index ? "done" : i === index ? "on" : ""} />)}
        </div>
      </div>

      {phase === "pass" ? (
        <div className="pass panel">
          <span className="eyebrow">{players[order[0]]} has locked in</span>
          <h2>Pass to {players[who]}</h2>
          <p className="muted">No peeking at the screen, {players[order[0]]}.</p>
          <button className="btn primary" onClick={() => setPhase("pick")}>I'm {players[who]}, show the cards</button>
        </div>
      ) : (
        <>
          {friend && !revealed && <div className="turn-banner">{players[who]}'s pick</div>}
          <div className="qgrid">
            {deal.cards.map((card, i) => {
              const pickedBy = revealed ? current.filter((c) => c.cardIdx === i).map((c) => (friend ? players[c.player] : "Your pick")) : [];
              const peeked = revealed
                ? new Set(current.flatMap((c) => [...peekedFor(c.player, i)]))
                : peekedFor(who, i);
              return (
                <QuizCard key={card.player.id} card={card} sport={sport} round={round} revealed={revealed}
                  state={!revealed && selected === i ? "chosen" : ""}
                  peekable={!revealed && peekMode}
                  peeked={peeked}
                  onPeek={(k) => peek(i, k)}
                  onPick={revealed || peekMode ? null : () => setSelected(i)}
                  isBest={card.rating === best.rating}
                  pickedBy={pickedBy}
                  roundCredit={credit(deal.cards, card)} />
              );
            })}
          </div>

          <div className="quiz-actions">
            {!revealed ? (
              <>
                <button className="btn" disabled={peeksLeft[who] < 1} onClick={() => setPeekMode(!peekMode)}>
                  {peekMode ? "Cancel peek" : `Peek at a stat (${peeksLeft[who]} left)`}
                </button>
                <span className="muted small">{peekMode ? "Tap a hidden stat on any card." : selected == null ? "Tap a card to choose it." : ""}</span>
                <button className="btn primary" disabled={selected == null} onClick={lockIn}>Lock in</button>
              </>
            ) : (
              <>
                <span className="muted small">
                  {current.map((c) => `${friend ? players[c.player] : "You"}: ${Math.round(credit(deal.cards, c.chosen) * 100)}%`).join(" · ")}
                </span>
                <button className="btn primary" onClick={nextRound}>{index + 1 < rounds.length ? "Next round" : "See your grade"}</button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------
// Results: your team next to the team you could've had
// ------------------------------------------------------------------
function MiniPlayer({ card, sport }) {
  const p = card.player;
  return (
    <span className="mini">
      <Avatar player={{ ...p, teamCode: undefined }} sport={sport} />
      <span><b>{p.name}</b><small>{p.label} · {p.team}</small></span>
      <span className={`ovr-chip small ${tierOf(card.rating)}`}>{card.rating}</span>
    </span>
  );
}

function NumbersResults({ sport, players, picks, records, onAgain, onNewSetup, onChangeSport }) {
  const friend = players.length > 1;
  const summaries = picks.map(summarize);
  const winner = friend
    ? summaries[0].pct === summaries[1].pct ? null : summaries[0].pct > summaries[1].pct ? 0 : 1
    : null;

  return (
    <section className="quiz-results fade">
      <div className="grades">
        {players.map((name, i) => (
          <div key={name + i} className={`grade-card panel${winner === i ? " winner" : ""}`}>
            <span className="eyebrow">{friend ? name : "Your grade"}{winner === i ? " · Winner" : ""}</span>
            <div className={`grade g-${summaries[i].grade[0]}`}>{summaries[i].grade}</div>
            <div className="num">{Math.round(summaries[i].pct)}%</div>
            <dl>
              <dt>Your team</dt><dd className="num">{summaries[i].teamRating.toFixed(1)}</dd>
              <dt>Could've had</dt><dd className="num">{summaries[i].bestRating.toFixed(1)}</dd>
              <dt>Best picks</dt><dd className="num">{summaries[i].bestPicks} of {picks[i].length}</dd>
            </dl>
            {!friend && records?.isNewBest && <span className="badge best">New best</span>}
          </div>
        ))}
        {friend && winner === null && <p className="muted">Dead even. Run it back?</p>}
      </div>

      <div className="panel compare">
        <div className={`compare-row head${friend ? " two" : ""}`}>
          <span>Spot</span>
          {players.map((n, i) => <span key={i}>{friend ? n : "Your pick"}</span>)}
          <span>Could've had</span>
        </div>
        {picks[0].map((p, r) => {
          const best = bestCard(p.cards);
          return (
            <div key={r} className={`compare-row${friend ? " two" : ""}`}>
              <span className="spot">{p.round.label}</span>
              {players.map((_, i) => {
                const mine = picks[i][r];
                const hit = mine.chosen.rating === best.rating;
                return <span key={i} className={hit ? "hit" : ""}><MiniPlayer card={mine.chosen} sport={sport} /></span>;
              })}
              <span className="could"><MiniPlayer card={best} sport={sport} /></span>
            </div>
          );
        })}
      </div>

      {!friend && records && (
        <p className="muted small">
          Records on this device: best {SPORTS[sport].name.toLowerCase()} grade {gradeFor(records.best[sport])} ({Math.round(records.best[sport])}%)
          {records.trapRounds ? ` · best card on ${Math.round((100 * records.trapHits) / records.trapRounds)}% of trap rounds` : ""}
          {` · longest streak ${records.bestStreak}`}
        </p>
      )}

      <div className="actions">
        <button className="btn primary" onClick={onAgain}>Play again</button>
        <button className="btn" onClick={onNewSetup}>Change players</button>
        <button className="btn" onClick={onChangeSport}>Change sport</button>
      </div>
    </section>
  );
}
