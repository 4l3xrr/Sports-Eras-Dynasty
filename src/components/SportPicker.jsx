import { SPORTS } from "../game/sports.js";

const GLYPHS = {
  soccer: <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="22" cy="22" r="17" /><path d="M22 13l7 5-3 8h-8l-3-8z" /><path d="M22 5v8M36 16l-7 2M33 36l-7-10M11 36l7-10M8 16l7 2" /></svg>,
  basketball: <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="22" cy="22" r="17" /><path d="M5 22h34M22 5v34M10 10c6 6 6 18 0 24M34 10c-6 6-6 18 0 24" /></svg>,
  baseball: <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="22" cy="22" r="17" /><path d="M11 9c4 4 4 22 0 26M33 9c-4 4-4 22 0 26" /><path d="M13 14h3M13 22h4M13 30h3M28 14h3M27 22h4M28 30h3" strokeWidth="1.5" /></svg>,
  football: <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 36C6 22 22 6 36 8c2 14-14 30-28 28z" /><path d="M16 28l12-12M19 20l5 5M22 17l5 5M16 23l5 5" /></svg>,
};

const ORDER = ["baseball", "basketball", "football", "soccer"];
const PLAYOFF_TEXT = { baseball: "12 teams, series of 3, 5 and 7", basketball: "Play-In, then best of 7", football: "14 teams, single games" };

export default function SportPicker({ onPick }) {
  return (
    <section className="fade">
      <div className="intro">
        <span className="eyebrow">Pick a sport</span>
        <h1>Build a team out of history</h1>
        <p>Each round deals you a real team from a random season. Take one player, fill every position, then take your team through a full season against the best teams of the era.</p>
      </div>
      <div className="sports">
        {ORDER.map((key) => {
          const s = SPORTS[key];
          const all = s.eras?.[0];
          const starters = s.slots?.reduce((n, [, c]) => n + c, 0);
          return (
            <button key={key} className="sport" style={{ "--c": s.color }} disabled={s.comingSoon} onClick={() => onPick(key)}>
              {GLYPHS[key]}
              <h2>{s.name}</h2>
              {s.comingSoon ? (
                <span className="eyebrow">Coming soon</span>
              ) : (
                <>
                  <dl>
                    <dt>Seasons</dt><dd>{all.from}–{all.to}</dd>
                    <dt>Lineup</dt><dd>{starters} starters + {s.bench} bench</dd>
                    <dt>Season</dt><dd>{s.season} games</dd>
                    <dt>Playoffs</dt><dd>{PLAYOFF_TEXT[key]}</dd>
                  </dl>
                  <span className="go">Choose →</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
