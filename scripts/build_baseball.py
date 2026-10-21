"""
build_baseball.py
-----------------
Turns the Lahman Baseball Database into Era Draft's season files.

Input  : data/raw/lahman/  People.csv, Batting.csv, Pitching.csv, Appearances.csv,
                           Teams.csv, HallOfFame.csv
Output : public/data/baseball/<year>.json and index.json

Run from the project folder:
    python scripts/build_baseball.py
"""

import pandas as pd

from common import RAW, era_for, player_record, write_seasons
import numpy as np

from ratings import apply_floor, blend, calibrate, report, to_ovr, zscore

# ------------------------------------------------------------------
# 1. SETTINGS
# ------------------------------------------------------------------
LAHMAN = RAW / "lahman"
FIRST_YEAR, LAST_YEAR = 1950, 2025
MIN_PA = 100              # plate appearances to make a roster
MIN_IP = 20               # innings to make a roster
MIN_POS_GAMES = 20        # games at a position to be eligible there

# "Regular" seasons, for the Hall of Fame floor
REGULAR_PA, REGULAR_SP_IP, REGULAR_RP_G = 400, 120, 50

POSITION_COLUMNS = {"G_c": "C", "G_1b": "1B", "G_2b": "2B", "G_3b": "3B", "G_ss": "SS",
                    "G_lf": "LF", "G_cf": "CF", "G_rf": "RF", "G_dh": "DH"}

# Defensive value, in standard deviations, added to a hitter's score by his main position.
# Hard positions are worth more; DH and 1B less. Roughly follows baseball's positional adjustments.
POSITION_VALUE = {"C": 0.40, "SS": 0.40, "CF": 0.25, "2B": 0.20, "3B": 0.10,
                  "RF": 0.0, "LF": -0.10, "1B": -0.15, "DH": -0.30}

RELIEVER_SCALE = 0.7      # relievers pitch far fewer innings, so their best seasons count a bit less


# ------------------------------------------------------------------
# 2. LOAD
# ------------------------------------------------------------------
def load(name):
    df = pd.read_csv(LAHMAN / f"{name}.csv", low_memory=False)
    return df.rename(columns={"X2B": "2B", "X3B": "3B"})


people = load("People").set_index("playerID")
batting, pitching, appearances, teams = (load(n) for n in ("Batting", "Pitching", "Appearances", "Teams"))
in_range = lambda df: df[(df.yearID >= FIRST_YEAR) & (df.yearID <= LAST_YEAR)]
batting, pitching, appearances, teams = map(in_range, (batting, pitching, appearances, teams))

hall = load("HallOfFame")
hall_of_famers = set(hall[(hall.inducted == "Y") & (hall.category == "Player")].playerID)

KEYS = ["playerID", "yearID"]
names = (people.nameFirst.fillna("") + " " + people.nameLast.fillna("")).str.strip()

# ------------------------------------------------------------------
# 3. HITTERS: OPS+ against the league that year, plus volume and position
# ------------------------------------------------------------------
bat = batting.groupby(KEYS)[["AB", "H", "2B", "3B", "HR", "BB", "HBP", "SF"]].sum().fillna(0)
bat["PA"] = bat.AB + bat.BB + bat.HBP + bat.SF
bat["OBP"] = (bat.H + bat.BB + bat.HBP) / bat.PA.where(bat.PA > 0)
bat["SLG"] = (bat.H + bat["2B"] + 2 * bat["3B"] + 3 * bat.HR) / bat.AB.where(bat.AB > 0)
bat = bat[bat.PA >= MIN_PA].copy()
league = bat.groupby("yearID")[["OBP", "SLG"]].transform("mean")
bat["OPS_PLUS"] = 100 * (bat.OBP / league.OBP + bat.SLG / league.SLG - 1)
bat["shrunk"] = (bat.OPS_PLUS * bat.PA + 80 * 300) / (bat.PA + 300)   # small samples pulled toward below average

app = appearances.groupby(KEYS)[list(POSITION_COLUMNS)].sum()


def positions_for(key):
    if key not in app.index:
        return []
    found = [(POSITION_COLUMNS[c], g) for c, g in app.loc[key].items() if g >= MIN_POS_GAMES]
    return [p for p, _ in sorted(found, key=lambda x: -x[1])]


bat["positions"] = [positions_for(k) for k in bat.index]
bat = bat[bat.positions.map(len) > 0].copy()
years = bat.index.get_level_values("yearID")
bat["z"] = zscore(blend([zscore(bat.shrunk, years), zscore(bat.PA, years)], [0.8, 0.2]), years)
bat["z"] += bat.positions.map(lambda p: POSITION_VALUE.get(p[0], 0))
bat["regular"] = bat.PA >= REGULAR_PA

# ------------------------------------------------------------------
# 4. PITCHERS: ERA+ against the league; starters vs starters, relievers vs relievers
# ------------------------------------------------------------------
pit = pitching.groupby(KEYS)[["G", "GS", "IPouts", "ER"]].sum().fillna(0)
pit["IP"] = pit.IPouts / 3
pit = pit[pit.IP >= MIN_IP].copy()
pit["ERA"] = 9 * pit.ER / pit.IP
yr = pit.index.get_level_values("yearID")
lg_era = 9 * pit.ER.groupby(yr).transform("sum") / pit.IP.groupby(yr).transform("sum")
pit["ERA_PLUS"] = 100 * lg_era / pit.ERA.clip(lower=1.0)
pit["role"] = (pit.GS >= pit.G / 2).map({True: "SP", False: "RP"})
pit["shrunk"] = np.log((pit.ERA_PLUS * pit.IP + 85 * 120) / (pit.IP + 120))   # log tames freak small-sample ERAs
group = [yr, pit.role]
pit["z"] = zscore(blend([zscore(pit.shrunk, group), zscore(pit.IP, group)], [0.7, 0.3]), group)
pit.loc[pit.role == "RP", "z"] *= RELIEVER_SCALE
pit["regular"] = ((pit.role == "SP") & (pit.IP >= REGULAR_SP_IP)) | ((pit.role == "RP") & (pit.G >= REGULAR_RP_G))

# ------------------------------------------------------------------
# 5. RATINGS on the shared scale, then the Hall of Fame floor
# ------------------------------------------------------------------
n_seasons = LAST_YEAR - FIRST_YEAR + 1
anchors = calibrate(pd.concat([bat.z, pit.z]), n_seasons)
for df in (bat, pit):
    df["ovr"] = to_ovr(df.z, anchors)
    df["hof"] = [k[0] in hall_of_famers for k in df.index]
    df["ovr"], df["floored"] = apply_floor(df.ovr, df.hof, df.regular)
report("Baseball", pd.concat([bat.ovr, pit.ovr]), n_seasons)

# ------------------------------------------------------------------
# 6. WRITE ONE FILE PER SEASON
# ------------------------------------------------------------------
roster_rows = appearances.groupby(["yearID", "teamID"]).playerID.unique()
seasons = []
for year, season_teams in teams.groupby("yearID"):
    out_teams = []
    for _, t in season_teams.iterrows():
        players = []
        for pid in roster_rows.get((year, t.teamID), []):
            key, ref = (pid, year), people.bbrefID.get(pid)
            if key in pit.index:
                p = pit.loc[key]
                players.append(player_record(
                    f"{pid}-{year}-P", names.get(pid, pid), [p.role], p.ovr,
                    {"ERA": round(float(p.ERA), 2), "IP": round(float(p.IP), 1), "ERA+": int(round(p.ERA_PLUS))},
                    ref=ref, hof=p.hof, floored=p.floored))
            if key in bat.index:
                b = bat.loc[key]
                players.append(player_record(
                    f"{pid}-{year}", names.get(pid, pid), b.positions, b.ovr,
                    {"AVG": round(float(b.H / b.AB), 3) if b.AB else 0, "HR": int(b.HR),
                     "OPS+": int(round(b.OPS_PLUS))},
                    ref=ref, hof=b.hof, floored=b.floored))
        players.sort(key=lambda p: -p["ovr"])
        out_teams.append({"id": f"{t.teamID}-{year}", "code": t.franchID, "name": t["name"],
                          "record": f"{int(t.W)}-{int(t.L)}", "players": players})
    seasons.append({"year": int(year), "era": era_for(year), "teams": out_teams})

write_seasons("baseball", seasons)
