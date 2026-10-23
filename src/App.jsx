import { useMemo, useRef, useState } from "react";
import { SPORTS, DIFFICULTY } from "./game/sports.js";
import { loadPictures, seasonsInEra } from "./game/data.js";
import { teamRating } from "./game/draft.js";
import { chooseOpponents, makeLeagueTeam, playSeason, playPlayoffs, assignConferences, rivalry, difficultyBoost } from "./game/league.js";
import { awards, projectLine } from "./game/recap.js";
import { PicturesContext } from "./components/PlayerCard.jsx";
import SportPicker from "./components/SportPicker.jsx";
import Setup from "./components/Setup.jsx";
import Draft from "./components/Draft.jsx";
import Gamble from "./components/Gamble.jsx";
import Results from "./components/Results.jsx";
import Credits from "./components/Credits.jsx";
import NumbersGame, { NumbersSetup } from "./components/NumbersGame.jsx";

const DEFAULTS = { eraId: "all", blind: false, salary: false, opponent: "none", cpu: "easy", p1: "Player 1", p2: "Player 2", league: "contenders", difficulty: "normal" };
const STEPS = { draft: [["sport", "Sport"], ["setup", "Setup"], ["draft", "Draft"], ["results", "Season"]],
  quiz: [["sport", "Sport"], ["setup", "Players"], ["draft", "Rounds"], ["results", "Grade"]] };

export default function App() {
  const [screen, setScreen] = useState("sport");
  const [mode, setMode] = useState("draft");            // draft = Era Draft, quiz = The Numbers Game
  const [quizPlayers, setQuizPlayers] = useState(null);
  const [quizKey, setQuizKey] = useState(0);
  const [sport, setSport] = useState(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [pictures, setPictures] = useState({ photos: {}, legends: {} });
  const [lineups, setLineups] = useState(null);     // one lineup per drafter
  const [gambleTurn, setGambleTurn] = useState(0);
  const [results, setResults] = useState(null);
  const [draftKey, setDraftKey] = useState(0);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const seen = useRef(new Map());
  const drafters = useMemo(() => {
    if (settings.opponent === "computer") return [{ name: "You", kind: "human" }, { name: "Computer", kind: "cpu" }];
    if (settings.opponent === "friend") return [{ name: settings.p1.trim() || "Player 1", kind: "human" }, { name: settings.p2.trim() || "Player 2", kind: "human" }];
    return [{ name: "You", kind: "human" }];
  }, [settings.opponent, settings.p1, settings.p2]);
  const era = useMemo(() => (sport ? SPORTS[sport].eras.find((e) => e.id === settings.eraId) : null), [sport, settings.eraId]);

  async function pickSport(key) {
    setSport(key);
    setSettings(DEFAULTS);
    setScreen(mode === "quiz" ? "quiz-setup" : "setup");
    setPictures(await loadPictures(key));
  }

  function startDraft() {
    setDraftKey((k) => k + 1);
    setResults(null);
    setScreen("draft");
    window.scrollTo({ top: 0 });
  }

  // Gambles: each human drafter gets one, in turn
  function nextGamble(after, lus) {
    const next = drafters.findIndex((d, i) => i > after && d.kind === "human");
    if (next === -1) runSeason(lus);
    else { setGambleTurn(next); setScreen("gamble"); window.scrollTo({ top: 0 }); }
  }

  async function runSeason(lus) {
    setScreen("simulating");
    const cfg = SPORTS[sport];
    const today = settings.league === "today";
    const boost = today ? difficultyBoost(settings.difficulty) : 0;
    const mine = drafters.map((d, i) => ({ id: `drafter${i}`, name: d.kind === "cpu" ? "Computer" : drafters.length > 1 ? d.name : "Your team",
      shortName: d.name, lineup: lus[i], rating: teamRating(sport, lus[i]), drafter: i }));
    const opponents = await chooseOpponents({ sport, era, leagueType: settings.league, count: cfg.leagueSize - mine.length });
    const teams = [...mine, ...opponents.map((t) => makeLeagueTeam(sport, t, { boost }))];
    const userIndex = 0, rivalIndex = mine.length > 1 ? 1 : -1;
    const conf = assignConferences(teams.length, rivalIndex);

    const season = playSeason(sport, teams, userIndex, mine.map((_, i) => i));
    const playoffs = playPlayoffs(sport, teams, season.standings, conf);
    const pctOf = (i) => season.standings.find((r) => r.index === i).pct;
    const linesFor = (i) => [...lus[i].starters, ...lus[i].bench].map((s) => ({ slot: s.pos, player: s.player, line: projectLine(s.player, pctOf(i)) }));

    let leagueLabel;
    if (today) {
      const all = await seasonsInEra(sport, { from: 0, to: 9999 });
      leagueLabel = `Today's league (${all[all.length - 1].label}) · ${DIFFICULTY.find((d) => d.id === settings.difficulty).label}`;
    } else leagueLabel = `Contenders · ${era.label} ${era.from}–${era.to}`;

    setResults({
      teams, conf, userIndex, rivalIndex, season, playoffs, leagueLabel, lineups: lus,
      lines: mine.map((_, i) => linesFor(i)),
      awards: awards(sport, teams, season.standings, userIndex),
      rivalry: rivalIndex >= 0 ? rivalry(playoffs, season, userIndex, rivalIndex) : null,
    });
    setScreen("results");
    window.scrollTo({ top: 0 });
  }

  function startQuiz(players) {
    setQuizPlayers(players);
    setQuizKey((k) => k + 1);
    setScreen("quiz");
    window.scrollTo({ top: 0 });
  }

  const stepIndex = creditsOpen ? -1 : { sport: 0, setup: 1, "quiz-setup": 1, draft: 2, quiz: 2, gamble: 2, simulating: 3, results: 3 }[screen];
  const accent = sport ? SPORTS[sport].color : "#6E9CF0";

  return (
    <PicturesContext.Provider value={{ ...pictures, seen: seen.current }}>
      <div className="wrap" style={{ "--accent": accent }}>
        <header className="bar">
          <button className="brand" onClick={() => { setCreditsOpen(false); setScreen("sport"); }}><i />Era Draft</button>
          <nav className="crumbs">
            {STEPS[mode].map(([id, label], i) => <span key={id} className={`step${i === stepIndex ? " on" : ""}`}>{label}</span>)}
            <button className="linkbtn" onClick={() => setCreditsOpen(!creditsOpen)}>{creditsOpen ? "Close credits" : "Credits"}</button>
          </nav>
        </header>

        {creditsOpen && <Credits seen={seen.current} onBack={() => setCreditsOpen(false)} />}
        {/* Screens stay mounted while credits are open, so a draft in progress isn't lost */}
        <div hidden={creditsOpen}>
        {screen === "sport" && <SportPicker mode={mode} onMode={setMode} onPick={pickSport} />}
        {screen === "quiz-setup" && <NumbersSetup sport={sport} onStart={startQuiz} onBack={() => setScreen("sport")} />}
        {screen === "quiz" && (
          <NumbersGame key={quizKey} sport={sport} players={quizPlayers}
            onAgain={() => startQuiz(quizPlayers)}
            onNewSetup={() => setScreen("quiz-setup")}
            onChangeSport={() => setScreen("sport")} />
        )}
        {screen === "setup" && <Setup sport={sport} settings={settings} setSettings={setSettings} onStart={startDraft} onBack={() => setScreen("sport")} />}
        {screen === "draft" && (
          <Draft key={draftKey} sport={sport} settings={settings} era={era} drafters={drafters}
            onFinish={(lus) => { setLineups(lus); nextGamble(-1, lus); }} />
        )}
        {screen === "gamble" && (
          <Gamble key={gambleTurn} sport={sport} era={era} lineup={lineups[gambleTurn]} blind={settings.blind}
            title={drafters.length > 1 && drafters[1].kind === "human" ? `${drafters[gambleTurn].name}'s gamble` : null}
            exclude={lineups}
            onDone={(lineup) => { const lus = lineups.map((l, i) => (i === gambleTurn ? lineup : l)); setLineups(lus); nextGamble(gambleTurn, lus); }} />
        )}
        {screen === "simulating" && <p className="muted">Building your league and playing the season…</p>}
        {screen === "results" && results && (
          <Results sport={sport} r={results} settings={settings} drafters={drafters}
            onAgain={() => runSeason(lineups)}
            onNew={() => setScreen("setup")}
            onChangeSport={() => setScreen("sport")} />
        )}
        </div>
      </div>
    </PicturesContext.Provider>
  );
}
