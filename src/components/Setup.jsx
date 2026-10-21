import { SPORTS, DIFFICULTY } from "../game/sports.js";

function Toggle({ on, onClick, title, children }) {
  return (
    <button className={`toggle${on ? " on" : ""}`} onClick={onClick} aria-pressed={on}>
      <span className="check">{on ? "✓" : ""}</span>
      <span><b>{title}</b><small>{children}</small></span>
    </button>
  );
}

export default function Setup({ sport, settings, setSettings, onStart, onBack }) {
  const cfg = SPORTS[sport];
  const set = (patch) => setSettings({ ...settings, ...patch });
  return (
    <section className="setup fade">
      <div className="intro" style={{ marginBottom: 0 }}>
        <span className="eyebrow">{cfg.name} · set up your draft</span>
        <h1>Choose your era</h1>
      </div>

      <section>
        <span className="eyebrow">Era</span>
        <div className="options">
          {cfg.eras.map((e) => (
            <button key={e.id} className={`option${settings.eraId === e.id ? " on" : ""}`} onClick={() => set({ eraId: e.id })}>
              <b>{e.label}</b><small>{e.from}–{e.to}</small>
            </button>
          ))}
        </div>
      </section>

      <section>
        <span className="eyebrow">Modes (mix any)</span>
        <div className="options">
          <Toggle on={settings.blind} onClick={() => set({ blind: !settings.blind })} title="Blind">
            Ratings stay hidden until the end. Draft on names and stats alone.
          </Toggle>
          <Toggle on={settings.salary} onClick={() => set({ salary: !settings.salary })} title="Salary cap">
            Every player has a price. ${cfg.salaryBudget} to fill your whole team.
          </Toggle>
        </div>
      </section>

      <section>
        <span className="eyebrow">Opponent</span>
        <div className="options">
          {[["none", "Solo", "Just you against the league"],
            ["computer", "Computer", "Drafts from the same teams after you"],
            ["friend", "Friend", "Pass and play on this device"]].map(([id, label, hint]) => (
            <button key={id} className={`option${settings.opponent === id ? " on" : ""}`} onClick={() => set({ opponent: id })}>
              <b>{label}</b><small>{hint}</small>
            </button>
          ))}
        </div>
        {settings.opponent === "computer" && (
          <div className="suboptions">
            {["easy", "hard"].map((d) => (
              <button key={d} className={`chip${settings.cpu === d ? " on" : ""}`} onClick={() => set({ cpu: d })}>{d === "easy" ? "Easy" : "Hard"}</button>
            ))}
          </div>
        )}
        {settings.opponent === "friend" && (
          <div className="names">
            <label>Player 1 <input id="p1name" value={settings.p1} maxLength={18} onChange={(e) => set({ p1: e.target.value })} /></label>
            <label>Player 2 <input id="p2name" value={settings.p2} maxLength={18} onChange={(e) => set({ p2: e.target.value })} /></label>
          </div>
        )}
        {settings.opponent !== "none" && <p className="muted" style={{ margin: 0, fontSize: 13 }}>You'll be in opposite conferences, so you can only meet in the playoffs in the final.</p>}
      </section>

      <section>
        <span className="eyebrow">League</span>
        <div className="options">
          <button className={`option${settings.league === "contenders" ? " on" : ""}`} onClick={() => set({ league: "contenders" })}>
            <b>Contenders</b><small>The top 10% of teams from your era</small>
          </button>
          <button className={`option${settings.league === "today" ? " on" : ""}`} onClick={() => set({ league: "today" })}>
            <b>Today's league</b><small>The most recent real season</small>
          </button>
        </div>
        {settings.league === "today" && (
          <div className="suboptions">
            {DIFFICULTY.map((d) => (
              <button key={d.id} className={`chip${settings.difficulty === d.id ? " on" : ""}`} onClick={() => set({ difficulty: d.id })}>
                {d.label}{d.boost ? ` (+${d.boost})` : ""}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="actions" style={{ maxWidth: 420 }}>
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn primary" onClick={onStart}>Start draft</button>
      </div>
    </section>
  );
}
