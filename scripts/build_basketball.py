"""
build_basketball.py
-------------------
Turns Basketball-Reference season data into Era Draft's season files.

Input  : data/raw/bbref/  Advanced.csv, Player Per Game.csv, Player Play By Play.csv,
                          Team Summaries.csv, Player Career Info.csv
         Downloaded automatically from github.com/sumitrodatta/bball-reference-datasets
         the first time, if they aren't there yet.
Output : public/data/basketball/<year>.json and index.json

NBA seasons span two calendar years; a season is named by the year it ends
("1998" = 1997-98).

Run from the project folder:
    python scripts/build_basketball.py
"""

import pandas as pd

from common import RAW, era_for, fetch, player_record, quote, write_quiz, write_seasons
from ratings import apply_floor, calibrate, report, to_ovr, zscore

# ------------------------------------------------------------------
# 1. SETTINGS
# ------------------------------------------------------------------
BBREF = RAW / "bbref"
DATA_URL = "https://raw.githubusercontent.com/sumitrodatta/bball-reference-datasets/master/Data"
FIRST_YEAR, LAST_YEAR = 1952, 2026     # minutes and advanced stats start in 1951-52
MIN_MINUTES = 200                      # minutes to make a roster
REGULAR_MINUTES = 1500                 # "regular" season, for the Hall of Fame floor
MIN_POS_SHARE = 20                     # % of minutes at a position to be listed there (1996-97 on)
MULTI_TEAM = {"TOT", "2TM", "3TM", "4TM", "5TM"}


def season_label(year):
    return f"{year - 1}-{str(year)[-2:]}"


def load(name, nba_only=True):
    df = pd.read_csv(fetch(f"{DATA_URL}/{quote(name)}.csv", BBREF / f"{name}.csv"), low_memory=False)
    if not nba_only:
        return df
    return df[(df.lg == "NBA") & (df.season >= FIRST_YEAR) & (df.season <= LAST_YEAR)]


adv = load("Advanced")
per_game = load("Player Per Game")
pbp = load("Player Play By Play")
teams = load("Team Summaries")
teams = teams[teams.abbreviation.notna()]          # drops the "League Average" rows
career = load("Player Career Info", nba_only=False)
hall_of_famers = set(career[career.hof == True].player_id)   # noqa: E712

KEYS = ["player_id", "season"]

# ------------------------------------------------------------------
# 2. RATE PLAYERS
#    One row per player-season (the totals row for traded players).
#    Rate stats (PER, WS/48, BPM) show quality per minute; totals (Win Shares, VORP)
#    reward carrying a big role. BPM and VORP start in 1973-74.
# ------------------------------------------------------------------
rows = adv.assign(is_total=adv.team.isin(MULTI_TEAM))
rows = rows.sort_values("is_total", ascending=False).drop_duplicates(KEYS).set_index(KEYS)
rows = rows[rows.mp >= MIN_MINUTES].copy()
year = rows.index.get_level_values("season")

metrics = ["per", "ws_48", "bpm", "ws", "vorp"]
rows["mean_z"] = pd.concat([zscore(rows[m], year).where(rows[m].notna()) for m in metrics], axis=1).mean(axis=1)
rows["shrunk"] = (rows.mean_z * rows.mp + (-0.5) * 800) / (rows.mp + 800)   # low minutes pulled toward below average
rows["z"] = zscore(rows.shrunk, year)

n_seasons = LAST_YEAR - FIRST_YEAR + 1
rows["ovr"] = to_ovr(rows.z, calibrate(rows.z, n_seasons))
rows["hof"] = [k[0] in hall_of_famers for k in rows.index]
rows["ovr"], rows["floored"] = apply_floor(rows.ovr, rows.hof, rows.mp >= REGULAR_MINUTES)
report("Basketball", rows.ovr, n_seasons)

# ------------------------------------------------------------------
# 3. POSITIONS (minute shares from 1996-97 on; one listed position before that)
# ------------------------------------------------------------------
share_cols = {"pg_percent": "PG", "sg_percent": "SG", "sf_percent": "SF", "pf_percent": "PF", "c_percent": "C"}
pbp_rows = pbp.sort_values("mp", ascending=False).drop_duplicates(KEYS).set_index(KEYS)


def positions_for(key, listed):
    if key in pbp_rows.index:
        shares = pbp_rows.loc[key, list(share_cols)].fillna(0)
        found = [(share_cols[c], v) for c, v in shares.items() if v >= MIN_POS_SHARE]
        if found:
            return [p for p, _ in sorted(found, key=lambda x: -x[1])]
    return [listed.split("-")[0]]


pg = per_game.assign(is_total=per_game.team.isin(MULTI_TEAM))
pg = pg.sort_values("is_total", ascending=False).drop_duplicates(KEYS).set_index(KEYS)

# ------------------------------------------------------------------
# 4. WRITE ONE FILE PER SEASON
# ------------------------------------------------------------------
team_rows = adv[~adv.team.isin(MULTI_TEAM)]
seasons = []
for yr, season_teams in teams.groupby("season"):
    out_teams = []
    for _, t in season_teams.iterrows():
        players = []
        for _, r in team_rows[(team_rows.season == yr) & (team_rows.team == t.abbreviation)].iterrows():
            key = (r.player_id, yr)
            if key not in rows.index:
                continue
            p = rows.loc[key]
            stats = {}
            if key in pg.index:
                g = pg.loc[key]
                stats = {"PTS": round(float(g.pts_per_game), 1), "REB": round(float(g.trb_per_game), 1),
                         "AST": round(float(g.ast_per_game), 1)}
            players.append(player_record(f"{r.player_id}-{yr}", r.player, positions_for(key, str(r.pos)),
                                         p.ovr, stats, ref=r.player_id, hof=p.hof, floored=p.floored))
        if not players:
            continue
        players.sort(key=lambda p: -p["ovr"])
        out_teams.append({"id": f"{t.abbreviation}-{yr}", "code": t.abbreviation,
                          "name": t.team.replace("*", ""),
                          "record": f"{int(t.w)}-{int(t.l)}" if pd.notna(t.w) else "", "players": players})
    seasons.append({"year": int(yr), "label": season_label(yr), "era": era_for(yr), "teams": out_teams})

write_seasons("basketball", seasons)

# ------------------------------------------------------------------
# 5. THE NUMBERS GAME: full per-game lines for regular seasons (1,500+ minutes)
#    Spot = main position; anyone can be the sixth man. Steals and blocks start in 1973-74.
# ------------------------------------------------------------------
team_names = {(r.abbreviation, r.season): r.team.replace("*", "") for r in teams.itertuples()}
quiz = []
for key, p in rows[rows.mp >= REGULAR_MINUTES].iterrows():
    if key not in pg.index:
        continue
    g = pg.loc[key]
    # traded players: credit the team they played the most games for
    stints = team_rows[(team_rows.player_id == key[0]) & (team_rows.season == key[1])]
    team = stints.sort_values("mp", ascending=False).team.iloc[0] if len(stints) else ""
    num = lambda v: None if pd.isna(v) else float(v)
    listed = p.pos if isinstance(p.pos, str) else g.pos if isinstance(g.pos, str) else ""
    spot = positions_for(key, listed)[0]
    if spot not in ("PG", "SG", "SF", "PF", "C"):
        continue
    quiz.append({"name": p.player, "year": key[1], "label": season_label(key[1]),
                 "team": team_names.get((team, key[1]), team), "ref": key[0], "ovr": p.ovr, "group": "BB",
                 "spots": [spot],
                 "stats": [num(g.pts_per_game), num(g.trb_per_game), num(g.ast_per_game), num(g.stl_per_game),
                           num(g.blk_per_game), num(g.fg_percent), num(p.ts_percent)]})
write_quiz("basketball", {"BB": ["PTS", "REB", "AST", "STL", "BLK", "FG%", "TS%"]}, quiz)
