import { useEffect, useState } from "react";
import { SPORTS } from "../game/sports.js";
import { PlayerCard, FlipCard } from "./PlayerCard.jsx";

const ordinal = (n) => n + (["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
const pctText = (p) => p.toFixed(3).replace(/^0/, "");

export default function Results({ sport, r, settings, drafters, onAgain, onNew, onChangeSport }) {
  const [tab, setTab] = useState("season");
  const [who, setWho] = useState(0);                 // whose team the screens focus on (friend games)
  const [revealed, setRevealed] = useState(!settings.blind);
  useEffect(() => { if (settings.blind) { const t = setTimeout(() => setRevealed(true), 700); return () => clearTimeout(t); } }, [settings.blind]);
  const humans = drafters.map((d, i) => i).filter((i) => drafters[i].kind === "human");
  const tabs = [["season", "Season"], ["playoffs", "Playoffs"], ["recap", "Recap"], ["share", "Share"]];
  return (
    <section className="results fade">
      {r.rivalry && <Rivalry r={r} drafters={drafters} />}
      <div className="tabs">
        {tabs.map(([id, label]) => <button key={id} className={`chip${tab === id ? " on" : ""}`} onClick={() => setTab(id)}>{label}</button>)}
        {humans.length > 1 && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {humans.map((i) => <button key={i} className={`chip${who === i ? " on" : ""}`} onClick={() => setWho(i)}>{drafters[i].name}</button>)}
          </span>
        )}
      </div>
      {tab === "season" && <Season sport={sport} r={r} who={who} revealed={revealed} blind={settings.blind} />}
      {tab === "playoffs" && <Playoffs sport={sport} r={r} />}
      {tab === "recap" && <Recap r={r} who={who} />}
      {tab === "share" && <Share sport={sport} r={r} who={who} settings={settings} drafters={drafters} />}
      <div className="actions" style={{ maxWidth: 560 }}>
        <button className="btn primary" onClick={onAgain}>Play the season again</button>
        <button className="btn" onClick={onNew}>New draft</button>
        <button className="btn" onClick={onChangeSport}>Change sport</button>
      </div>
    </section>
  );
}

function Rivalry({ r, drafters }) {
  const { winner, reason } = r.rivalry;
  const side = (i) => {
    const row = r.season.standings.find((s) => s.index === i);
    return (
      <div className={`side${winner === i ? " win" : ""}`}>
        <b>{r.teams[i].name}</b>
        <span className="num">{row.W}-{row.L} · {r.playoffs.reached[i].text}</span>
        <span className="muted" style={{ fontSize: 12 }}>OVR {r.teams[i].rating.toFixed(1)}</span>
      </div>
    );
  };
  const head = winner === r.userIndex
    ? (drafters[1].kind === "cpu" ? "You beat the computer" : `${r.teams[winner].name} wins`)
    : (drafters[1].kind === "cpu" ? "The computer wins" : `${r.teams[winner].name} wins`);
  return (
    <div className="panel rivalry">
      <span className="eyebrow">The rivalry</span>
      <h2>{head}</h2>
      <span className="muted">{r.teams[winner].name} {reason}.</span>
      <div className="vs">{side(r.userIndex)}<span className="eyebrow">vs</span>{side(r.rivalIndex)}</div>
    </div>
  );
}

function Season({ sport, r, who, revealed, blind }) {
  const cfg = SPORTS[sport];
  const me = r.season.standings.find((s) => s.index === who);
  const games = r.season.games[who] || [];
  let best = 0, cur = 0;
  games.forEach((g) => { cur = g.res === "W" ? cur + 1 : 0; best = Math.max(best, cur); });
  const oppAvg = games.reduce((a, g) => a + r.teams[g.opp].rating, 0) / Math.max(1, games.length);
  const confRank = r.season.standings.filter((s) => r.conf[s.index] === r.conf[who]).findIndex((s) => s.index === who) + 1;
  const reached = r.playoffs.reached[who];
  const lineup = r.lineups[who];
  return (
    <>
      <div className="panel score">
        <div>
          <span className="eyebrow">{r.teams[who].name} · {r.leagueLabel}</span>
          <div className="record num" style={{ fontFamily: "var(--display)" }}>{me.W}<span className="sep">-</span>{me.L}</div>
          <div className={`verdict${reached.champion ? " champ" : ""}`}>{reached.text}</div>
        </div>
        <dl className="stats-dl">
          <div><dt>{cfg.conferences[r.conf[who]]}</dt><dd>{ordinal(confRank)}</dd></div>
          <div><dt>Team OVR</dt><dd>{revealed ? r.teams[who].rating.toFixed(1) : "?"}</dd></div>
          <div><dt>Avg opponent</dt><dd>{oppAvg.toFixed(1)}</dd></div>
          <div><dt>Best streak</dt><dd>{best}W</dd></div>
        </dl>
      </div>

      <div className="panel box">
        <span className="eyebrow">Game by game</span>
        <div className="games">{games.map((g, i) => <span key={i} className={`g ${g.res}`} title={`Game ${i + 1}: ${g.res === "W" ? "Win" : "Loss"} vs ${r.teams[g.opp].name} (${r.teams[g.opp].rating.toFixed(1)})`} />)}</div>
        <div className="legend-row"><span><i className="g W" />Win</span><span><i className="g L" />Loss</span><span>Hover a square to see the opponent</span></div>
      </div>

      <div className="panel box">
        <span className="eyebrow">{r.teams[who].name}{blind && revealed ? " · revealed" : ""}</span>
        <div className="cardgrid">
          {[...lineup.starters, ...lineup.bench].map((s, i) => (
            <div key={i}>
              <div className="slotlabel">{s.pos}</div>
              {blind ? <FlipCard player={s.player} sport={sport} revealed={revealed} /> : <PlayerCard player={s.player} sport={sport} />}
            </div>
          ))}
        </div>
      </div>

      <div className="conf-tables">
        {[0, 1].map((c) => <ConferenceTable key={c} sport={sport} r={r} conf={c} revealed={revealed} />)}
      </div>
    </>
  );
}

function ConferenceTable({ sport, r, conf, revealed }) {
  const cfg = SPORTS[sport];
  const rows = r.season.standings.filter((s) => r.conf[s.index] === conf);
  const cut = cfg.playoffs.perConference;
  const playIn = cfg.playoffs.format === "nba" ? 6 : null;
  const mine = (i) => r.teams[i].drafter !== undefined;
  return (
    <div className="panel box">
      <span className="eyebrow">{cfg.conferences[conf]} · top {playIn ? "6 in, 7-10 Play-In" : cut} make the playoffs</span>
      <div className="tablewrap">
        <table className="league">
          <thead><tr><th>#</th><th>Team</th><th>Real</th><th className="n">W</th><th className="n">L</th><th className="n">Pct</th><th className="n">OVR</th></tr></thead>
          <tbody>
            {rows.map((row, k) => {
              const t = r.teams[row.index];
              const cls = [row.index === r.userIndex ? "you" : "", row.index === r.rivalIndex ? "cpu" : "", k + 1 === cut || (playIn && k + 1 === playIn) ? "cut" : ""].join(" ");
              return (
                <tr key={row.index} className={cls}>
                  <td className="n">{k + 1}</td>
                  <td>{t.name}</td>
                  <td className="num muted">{t.realRecord || "—"}</td>
                  <td className="n">{row.W}</td><td className="n">{row.L}</td>
                  <td className="n">{pctText(row.pct)}</td>
                  <td className="n">{mine(row.index) && !revealed ? "?" : t.rating.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Playoffs({ sport, r }) {
  const cfg = SPORTS[sport];
  const p = r.playoffs;
  const seed = (i) => {
    const c = r.conf[i];
    const list = p.conferences[c].allSeeds;
    const n = list.indexOf(i);
    return n >= 0 ? `${n + 1}. ` : "";
  };
  const highlight = (i) => (i === r.userIndex ? "you" : i === r.rivalIndex ? "rival" : "");
  return (
    <div className="panel box">
      <span className="eyebrow">Playoffs · champion: {r.teams[p.champion].name}</span>
      <div className="tablewrap">
        <div className="bracket">
          {p.rounds.map((round) => (
            <div className="round" key={round.name}>
              <h3>{round.name}{round.bestOf > 1 ? ` · best of ${round.bestOf}` : ""}</h3>
              {[0, 1, -1].map((c) => {
                const series = round.series.filter((g) => g.conf === c);
                if (!series.length) return null;
                return (
                  <div key={c} style={{ display: "grid", gap: 8 }}>
                    {c >= 0 && <div className="conf-label">{cfg.conferences[c]}</div>}
                    {series.map((s, i) => (
                      <div className="series" key={i}>
                        {[[s.hi, s.hiWins], [s.lo, s.loWins]].map(([team, wins]) => (
                          <div key={team} className={`${s.winner === team ? "won" : "lost"} ${highlight(team)}`}>
                            <span>{seed(team)}{r.teams[team].name}</span>
                            <span className="num">{round.bestOf > 1 ? wins : s.winner === team ? "W" : "L"}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <b style={{ font: "700 20px var(--display)", textTransform: "uppercase", color: "#F3D57A" }}>Champion: {r.teams[p.champion].name}</b>
    </div>
  );
}

function Recap({ r, who }) {
  const a = r.awards;
  const lines = r.lines[who];
  const teamMvp = [...lines].filter((l) => !l.player.unit).sort((x, y) => y.player.ovr - x.player.ovr)[0];
  const inAllLeague = a.allLeague.filter((e) => e.team === who).length;
  const label = (i) => (r.teams[i].drafter !== undefined ? r.teams[i].name : r.teams[i].name);
  return (
    <>
      <div className="awards">
        <div className="award"><span className="eyebrow">League MVP</span><b>{a.mvp.player.name}</b><span className="muted">{label(a.mvp.team)}</span></div>
        {teamMvp && <div className="award"><span className="eyebrow">{r.teams[who].name} MVP</span><b>{teamMvp.player.name}</b><span className="muted">{teamMvp.player.from}</span></div>}
        <div className="award"><span className="eyebrow">All-League team</span><b>{inAllLeague} of {r.teams[who].name}'s players</b><span className="muted">made the league's best lineup</span></div>
      </div>
      <div className="panel box">
        <span className="eyebrow">{r.teams[who].name}: seasons projected from real stats</span>
        <div className="tablewrap">
          <table className="lines">
            <thead><tr><th>Spot</th><th>Player</th><th>Season</th></tr></thead>
            <tbody>
              {lines.map(({ slot, player, line }, i) => (
                <tr key={i}>
                  <td className="num">{slot}</td>
                  <td><b>{player.name}</b> <span className="muted" style={{ fontSize: 12 }}>{player.from}</span></td>
                  <td className="num">{Object.entries(line).map(([k, v]) => `${v} ${k}`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel box">
        <span className="eyebrow">All-League team</span>
        <div className="tablewrap">
          <table className="lines">
            <tbody>
              {a.allLeague.map((e, i) => (
                <tr key={i} style={r.teams[e.team].drafter !== undefined ? { color: "var(--accent)" } : null}>
                  <td className="num">{e.slot}</td><td><b>{e.player.name}</b></td><td className="muted">{label(e.team)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Share({ sport, r, who, settings, drafters }) {
  const me = r.season.standings.find((s) => s.index === who);
  const [copied, setCopied] = useState("");
  const lineup = r.lineups[who];
  const players = [...lineup.starters, ...lineup.bench];
  const reached = r.playoffs.reached[who];
  const rivalLine = r.rivalry ? `${r.teams[r.rivalry.winner].name} won the rivalry (${r.rivalry.reason})` : null;
  const summary = [
    `Era Draft · ${SPORTS[sport].name} · ${r.leagueLabel}`,
    `${r.teams[who].name}: ${me.W}-${me.L} · ${reached.text}`,
    ...(rivalLine ? [rivalLine] : []),
    ...players.map((s) => `${s.pos} ${s.player.name} (${s.player.label}) ${s.player.ovr}`),
  ].join("\n");
  async function copy() {
    try { await navigator.clipboard.writeText(summary); setCopied("Copied."); }
    catch { setCopied("Couldn't copy here. Select the text below instead."); }
  }
  const opp = settings.opponent === "computer" ? `vs Computer (${settings.cpu})` : settings.opponent === "friend" ? `vs ${drafters[1 - who]?.name}` : null;
  const modes = [settings.blind && "Blind", settings.salary && "Salary cap", opp].filter(Boolean);
  const mvp = [...players].filter((s) => !s.player.unit).sort((a, b) => b.player.ovr - a.player.ovr)[0];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="share" style={{ "--accent": SPORTS[sport].color }}>
        <div className="top">
          <div>
            <span className="eyebrow">Era Draft · {SPORTS[sport].name} · {r.teams[who].name}</span>
            <div className="big">{me.W}-{me.L}</div>
            <div className="res">{reached.text}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="eyebrow">{r.leagueLabel}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>OVR {r.teams[who].rating.toFixed(1)}</div>
          </div>
        </div>
        {rivalLine && <div style={{ font: "600 13px var(--body)", color: "#F3D57A" }}>{rivalLine}</div>}
        <ul>
          {players.map((s, i) => (
            <li key={i}><span>{s.pos}</span><span style={{ flex: 1 }}>{s.player.name} <span className="muted" style={{ fontSize: 11 }}>'{String(s.player.year).slice(-2)}</span></span><b>{s.player.ovr}</b></li>
          ))}
        </ul>
        <div className="foot"><span>{modes.length ? modes.join(" · ") : "Solo draft"}</span><span>Top player: {mvp?.player.name || "—"}</span></div>
      </div>
      <div className="actions" style={{ maxWidth: 360 }}><button className="btn" onClick={copy}>Copy as text</button></div>
      <span className="toast">{copied || "Screenshot the card to share it, or copy it as text."}</span>
      <textarea readOnly value={summary} rows={6} style={{ width: "min(560px,100%)", background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 8, padding: 10, fontFamily: "var(--mono)", fontSize: 12 }} onFocus={(e) => e.target.select()} />
    </div>
  );
}
