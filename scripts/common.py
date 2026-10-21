"""
common.py
---------
Small helpers every converter uses: folder locations, downloading, eras, and writing
the season files the app reads.
"""

import json
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
RAW = PROJECT / "data" / "raw"
PUBLIC_DATA = PROJECT / "public" / "data"

ERAS = [(1900, 1969, "Early era"), (1970, 1984, "Expansion era"),
        (1985, 1999, "Golden era"), (2000, 2012, "Modern era"),
        (2013, 2100, "Analytics era")]


def era_for(year):
    return next(label for start, end, label in ERAS if start <= year <= end)


def fetch(url, dest):
    """Download url to dest, unless it's already there."""
    dest = Path(dest)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {dest.name} ...")
    request = urllib.request.Request(url, headers={"User-Agent": "era-draft"})
    with urllib.request.urlopen(request) as response:
        data = response.read()
    dest.write_bytes(data)
    return dest


def quote(name):
    return urllib.parse.quote(name)


def write_seasons(sport, seasons):
    """seasons: list of dicts {year, label?, era, teams:[...]}. Writes one file per season
    plus index.json into public/data/<sport>/ and returns the output folder."""
    out = PUBLIC_DATA / sport
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.json"):
        old.unlink()
    index = []
    for season in sorted(seasons, key=lambda s: s["year"]):
        body = {"sport": sport, **season}
        name = f"{season['year']}.json"
        (out / name).write_text(json.dumps(body, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
        index.append({"year": season["year"], "label": season.get("label", str(season["year"])),
                      "file": name, "teams": len(season["teams"])})
    (out / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")
    print(f"Wrote {len(index)} seasons to {out}")
    return out


def player_record(pid, name, positions, ovr, stats, ref=None, hof=False, floored=False, limited=False):
    """One player, in the format the app expects. Flags are left out when false to keep files small."""
    p = {"id": pid, "name": name, "positions": positions, "ovr": int(ovr), "stats": stats}
    if ref:
        p["ref"] = ref            # reference-site ID, used to find photos
    if hof:
        p["hof"] = 1
    if limited:
        p["lim"] = 1              # "Limited stats" badge: rated on thin data
    if floored:
        p["flr"] = 1              # "HOF floor" badge: the Hall of Fame floor raised this rating
    return p
