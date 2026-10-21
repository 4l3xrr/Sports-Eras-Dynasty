import { useEffect, useRef, useState } from "react";
import { SPORTS, priceFor } from "../game/sports.js";
import { randomTeam } from "../game/data.js";
import { createLineup, placementFor, draftInto, allSlots, filledCount, isComplete, draftedIds } from "../game/draft.js";
import { computerPick, canAfford, spent } from "../game/modes.js";
import { Avatar, RatingChip, Badges, statLine } from "./PlayerCard.jsx";

const SKIPS = 3;

// drafters: [{ name, kind: "human" | "cpu" }]  (one entry when there's no opponent)
// Each dealt team is picked from in turn. With a friend, who picks first alternates every team.
export default function Draft({ sport, settings, era, drafters, onFinish }) {
  const cfg = SPORTS[sport];
  const [lineups, setLineups] = useState(() => drafters.map(() => createLineup(sport)));
  const [team, setTeam] = useState(null);
  const [order, setOrder] = useState([0]);
  const [turn, setTurn] = useState(0);              // position in `order`
  const [taken, setTaken] = useState(() => new Set()); // players already picked from this team
  const [skips, setSkips] = useState(() => drafters.map(() => SKIPS));
  const [view, setView] = useState(0);              // whose lineup the side panel shows
  const [toast, setToast] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(true);
  const [done, setDone] = useState(false);
  const dealCount = useRef(0);
  const history = useRef([]);
  const friend = drafters.length > 1 && drafters[1].kind === "human";

  const [rescue, setRescue] = useState(false);     // salary cap: nobody affordable, so one $1 minimum contract
  const usable = (lu, p, minimum = false) => placementFor(lu, p) && (!settings.salary || minimum || canAfford(sport, lu, p));
  const needs = (lus, d, players, takenIds, minimum = false) =>
    !isComplete(lus[d]) && players.some((p) => !takenIds.has(p.id) && !draftedIds(lus[d]).has(p.id) && usable(lus[d], p, minimum));

  // Walk through the pick order: the computer picks instantly, full or stuck drafters are passed over.
  // Returns when a human needs to pick, or when this team is finished.
  function advance(lus, ord, start, t, takenIds, minimum = false) {
    let notes = [];
    for (let i = start; i < ord.length; i++) {
      const d = ord[i];
      if (isComplete(lus[d])) continue;
      if (drafters[d].kind === "cpu") {
        const rest = t.players.filter((p) => !takenIds.has(p.id) && (!settings.salary || canAfford(sport, lus[d], p)));
        const choice = computerPick(lus[d], rest, settings.cpu);
        if (choice) {
          lus = lus.map((l, k) => (k === d ? draftInto(l, choice).lineup : l));
          takenIds = new Set([...takenIds, choice.id]);
          notes.push(`Computer took ${choice.name}${settings.blind ? "" : ` (${choice.ovr})`}.`);
        } else notes.push("Computer passed on this team.");
        continue;
      }
      if (needs(lus, d, t.players, takenIds, minimum)) return { lus, waitingAt: i, takenIds, notes };
    }
    return { lus, waitingAt: -1, takenIds, notes };
  }

  // Fail-safes when the open spots are hard to fill (thin old rosters, a narrow era, a tight budget):
  //   after 40 teams with nobody usable: allow one $1 minimum contract (salary cap only)
  //   after 60 teams: deal from any era instead of only the chosen one
  //   if even that fails 5 deals in a row: end the draft; an empty spot counts as a 55 rating
  async function deal(lus, failedDeals = 0) {
    setBusy(true);
    const humans = drafters.map((d, i) => i).filter((i) => drafters[i].kind === "human" && !isComplete(lus[i]));
    if (!humans.length || failedDeals >= 5) return finish(lus);
    let t = null, minimum = false, outside = false;
    for (let tries = 0; tries < 80; tries++) {
      if (tries % 10 === 9) await new Promise((r) => setTimeout(r, 0));   // let the page breathe
      outside = tries >= 60;
      t = await randomTeam(sport, outside ? SPORTS[sport].eras[0] : era);
      minimum = tries >= 40;
      if (humans.some((d) => needs(lus, d, t.players, new Set(), minimum))) break;
    }
    const first = friend ? dealCount.current % 2 : 0;
    dealCount.current++;
    const ord = drafters.length > 1 ? [first, 1 - first] : [0];
    const res = advance(lus, ord, 0, t, new Set(), minimum);
    setRescue(minimum && settings.salary);
    setOrder(ord);
    setTeam(t);
    setLineups(res.lus);
    setTaken(res.takenIds);
    setNote([outside ? "No team in your era had anyone for your open spots, so this one comes from any era." : "", ...res.notes].join(" ").trim());
    if (res.waitingAt === -1) { await new Promise((r) => setTimeout(r, 0)); return deal(res.lus, failedDeals + 1); }
    setTurn(res.waitingAt);
    setView(ord[res.waitingAt]);
    setBusy(false);
  }

  async function finish(lus) {
    // A computer opponent keeps drafting from new teams until it's full too
    for (let d = 0; d < drafters.length; d++) {
      if (drafters[d].kind !== "cpu") continue;
      for (let guard = 0; guard < 120 && !isComplete(lus[d]); guard++) {
        const t = await randomTeam(sport, era);
        const broke = guard >= 80;   // same $1 minimum-contract fallback as you get
        const pool = t.players.filter((p) => !settings.salary || broke || canAfford(sport, lus[d], p));
        let choice = computerPick(lus[d], pool, settings.cpu);
        if (choice && settings.salary && !canAfford(sport, lus[d], choice)) choice = { ...choice, contract: 1 };
        if (choice) lus = lus.map((l, k) => (k === d ? draftInto(l, choice).lineup : l));
      }
    }
    setLineups(lus);
    setTeam(null);
    setDone(true);
    setBusy(false);
    setToast("Draft complete.");
  }

  useEffect(() => { deal(lineups); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function snapshot() {
    history.current.push({ lineups, team, order, turn, taken, skips, dealCount: dealCount.current, note });
  }

  function takePlayer(p) {
    snapshot();
    const d = order[turn];
    const signed = rescue && settings.salary && !canAfford(sport, lineups[d], p) ? { ...p, contract: 1 } : p;
    const { lineup, place } = draftInto(lineups[d], signed);
    const lus = lineups.map((l, k) => (k === d ? lineup : l));
    const takenIds = new Set([...taken, p.id]);
    setToast(`${drafters[d].name}: ${p.name} ${place.kind === "starter" ? `starts at ${place.pos}` : "joins the bench"}.`);
    const res = advance(lus, order, turn + 1, team, takenIds, rescue);
    setLineups(res.lus);
    setTaken(res.takenIds);
    setNote(res.notes.join(" "));
    if (res.waitingAt === -1) deal(res.lus);
    else { setTurn(res.waitingAt); setView(order[res.waitingAt]); }
  }

  function skip() {
    snapshot();
    const d = order[turn];
    setSkips(skips.map((n, k) => (k === d ? n - 1 : n)));
    setToast(`${drafters[d].name} skipped the ${team.label} ${team.name}.`);
    deal(lineups);
  }

  function undo() {
    const prev = history.current.pop();
    if (!prev) return;
    setLineups(prev.lineups); setTeam(prev.team); setOrder(prev.order); setTurn(prev.turn);
    setTaken(prev.taken); setSkips(prev.skips); setNote(prev.note); dealCount.current = prev.dealCount;
    setView(prev.order[prev.turn]); setDone(false); setToast("Undone.");
  }

  const active = order[turn];
  const lineup = lineups[active] || lineups[0];
  const total = allSlots(lineups[0]).length;
  const filled = filledCount(lineup);
  const yours = draftedIds(lineup);
  const positions = ["ALL", ...new Set(cfg.slots.map(([p]) => p))];
  const [filter, setFilter] = useState("ALL");
  useEffect(() => setFilter("ALL"), [team, turn]);
  const roster = team
    ? team.players
        .filter((p) => filter === "ALL" || p.positions.includes(filter))
        .sort(settings.blind ? (a, b) => positions.indexOf(a.positions[0]) - positions.indexOf(b.positions[0]) : () => 0)
    : [];
  const shown = lineups[view];

  return (
    <section className="draft fade">
      <div className="panel">
        {done ? (
          <div className="deal-head">
            <span className="eyebrow">Draft complete</span>
            <h2 style={{ fontSize: 34 }}>{drafters.length > 1 ? "Both teams are set" : `Your ${cfg.name.toLowerCase()} team is set`}</h2>
            <p className="muted" style={{ margin: 0 }}>Next: one optional gamble{friend ? " each" : ""}, then the season.</p>
            <div className="actions" style={{ maxWidth: 360 }}>
              <button className="btn primary" onClick={() => onFinish(lineups)}>Continue</button>
            </div>
          </div>
        ) : !team || busy ? (
          <div className="deal-head"><span className="muted">Dealing a team…</span></div>
        ) : (
          <>
            <div className="deal-head">
              {friend && <div className="turn-banner">{drafters[active].name}'s pick</div>}
              {rescue && <div className="cpu-note">No team had anyone in your budget, so you can sign one player from this team on a $1 minimum contract.</div>}
              <div className="deal-row">
                <div>
                  <span className="eyebrow">Pick {filled + 1} of {total} · {era.label} {era.from}–{era.to}</span>
                  <div className="team-name">
                    <span className="yr">{team.label}</span>
                    <h2>{team.name}</h2>
                    {team.record ? <span className="rec num">{team.record}</span> : null}
                  </div>
                </div>
                <button className="btn" disabled={turn !== 0 || !skips[active]} onClick={skip}
                  title={turn !== 0 ? "Only the first picker on a team can skip it" : ""}>Skip team · {skips[active]} left</button>
              </div>
              <div className="filters">
                {positions.map((p) => (
                  <button key={p} className={`chip${filter === p ? " on" : ""}`} onClick={() => setFilter(p)}>{p === "ALL" ? "All" : p}</button>
                ))}
              </div>
            </div>
            <ul className="roster">
              {roster.length === 0 && <li className="row"><span /><span /><span className="muted">No {filter} on this roster.</span></li>}
              {roster.map((p) => {
                const gone = taken.has(p.id);
                const place = !gone && !yours.has(p.id) && placementFor(lineup, p);
                const afford = !settings.salary || rescue || canAfford(sport, lineup, p);
                const label = gone ? "Taken" : yours.has(p.id) ? "Already yours" : !place ? "No open spot" : !afford ? "Over budget" : place.kind === "starter" ? `Start at ${place.pos}` : "Add to bench";
                return (
                  <li key={p.id} className="row" style={gone ? { opacity: 0.45 } : null}>
                    <RatingChip player={p} hidden={settings.blind} />
                    <Avatar player={p} sport={sport} />
                    <div>
                      <div className="name">{p.name} <Badges player={settings.blind ? { ...p, era: null, flr: null } : p} showPrice={settings.salary} /></div>
                      <div className="meta">
                        {p.positions.map((x) => <span key={x} className="pos">{x}</span>)}
                        <span>{p.unit && p.members ? p.members.join(", ") : statLine(p.stats)}</span>
                      </div>
                    </div>
                    <div className="pick">
                      <button className={`pickbtn ${place && afford ? place.kind : ""}`} disabled={!place || !afford || busy} onClick={() => takePlayer(p)}>{label}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <aside className="panel lineup">
        {drafters.length > 1 && (
          <div className="filters">
            {drafters.map((d, i) => (
              <button key={i} className={`chip${view === i ? " on" : ""}`} onClick={() => setView(i)}>
                {d.name} · {filledCount(lineups[i])}/{total}
              </button>
            ))}
          </div>
        )}
        <div className="lineup-head"><h3>{drafters[view].kind === "cpu" ? "Computer's team" : drafters.length > 1 ? `${drafters[view].name}'s team` : "Your team"}</h3><span className="num muted">{filledCount(shown)}/{total}</span></div>
        <div className="meter"><span style={{ width: `${(filledCount(shown) / total) * 100}%` }} /></div>
        {settings.salary && <div className="budget"><span>Salary used</span><b>${spent(shown)} / ${cfg.salaryBudget}</b></div>}
        <div className="slots">
          <span className="eyebrow">Starters</span>
          {shown.starters.map((s, i) => <Slot key={`s${i}`} slot={s} blind={settings.blind} salary={settings.salary} />)}
          <span className="eyebrow">Bench</span>
          {shown.bench.map((s, i) => <Slot key={`b${i}`} slot={s} blind={settings.blind} salary={settings.salary} />)}
        </div>
        {note && <div className="cpu-note">{note}</div>}
        <div className="toast" role="status">{toast}</div>
        <div className="actions">
          <button className="btn" disabled={!history.current.length || busy} onClick={undo}>Undo last move</button>
        </div>
      </aside>
    </section>
  );
}

function Slot({ slot, blind, salary }) {
  const p = slot.player;
  return (
    <div className={`slot${p ? " filled" : ""}`}>
      <span className="tag">{slot.pos}</span>
      {p ? (
        <>
          <span className="who">{p.name}<small>{p.from}{salary ? ` · $${p.contract ?? priceFor(p.ovr)}` : ""}</small></span>
          <span className="r">{blind ? "?" : p.ovr}</span>
        </>
      ) : (<><span className="empty">Open</span><span /></>)}
    </div>
  );
}
