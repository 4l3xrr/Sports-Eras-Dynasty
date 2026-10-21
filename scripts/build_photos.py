"""
build_photos.py
---------------
Finds free-licensed player photos on Wikimedia Commons, and prepares your own legend
pictures for 99-rated cards.

Run it after the sport converters (build_all.py does this for you):
    python scripts/build_photos.py            # uses saved lookups when it can
    python scripts/build_photos.py --refresh  # asks Wikidata again
    python scripts/build_photos.py football   # just one sport

What it does
  1. Photos: looks players up on Wikidata by their reference-site ID
     (Baseball-Reference, Basketball-Reference, Pro-Football-Reference), which avoids
     same-name mix-ups. Older football players without an ID are matched by name, only
     when the name is unique. Writes public/data/photos/<sport>.json with each photo's
     link, author and license, and prints coverage per sport.
  2. Legend pictures: put images in public/legends/ named after the player, for example
     "michael-jordan.jpg" (all his 99 seasons) or "michael-jordan-1996.jpg" (just that one).
     They're cropped and resized to the card shape into public/legends/cards/.
  3. Writes legends_needed.csv: every 99 in every sport, and whether it has a picture yet.
"""

import csv
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

from common import PROJECT, PUBLIC_DATA, RAW

SPORTS = ["baseball", "basketball", "football"]
WIKIDATA_ID = {"baseball": "P1825", "basketball": "P2685", "football": "P3561"}
FOOTBALL_PLAYER = "Q19204627"          # Wikidata's "American football player"
SPARQL = "https://query.wikidata.org/sparql"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia asks every script to say who it is and how to reach its owner, and slows down
# scripts that don't. Put your GitHub repo link (or email) in CONTACT for best results.
CONTACT = "https://github.com/your-name/era-draft"
USER_AGENT = f"EraDraft/1.1 ({CONTACT}; student portfolio project) python-urllib"
CACHE = RAW / "photos"
LEGENDS = PROJECT / "public" / "legends"
CARD_SIZE = (600, 840)                  # 5:7, same shape as the cards
THUMB_WIDTH = 400


def slug(name):
    text = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def name_key(name):
    return re.sub(r"[^a-z]", "", slug(name))


# ------------------------------------------------------------------
# Reading our own season files
# ------------------------------------------------------------------
def players_by_sport():
    out = {}
    for sport in SPORTS:
        folder = PUBLIC_DATA / sport
        players = []
        for path in sorted(folder.glob("[0-9]*.json")):
            season = json.loads(path.read_text(encoding="utf-8"))
            for team in season["teams"]:
                for p in team["players"]:
                    if p.get("unit"):
                        continue
                    players.append({**p, "year": season["year"], "label": season.get("label", str(season["year"])),
                                    "team": team["name"]})
        out[sport] = players
    return out


# ------------------------------------------------------------------
# Wikidata / Commons lookups (saved in data/raw/photos/ so reruns are quick)
# ------------------------------------------------------------------
def http_json(url, params, tries=6, post=False):
    """GET (or POST) and parse JSON. On "429 Too Many Requests" it waits as long as the
    server asks (Retry-After), otherwise 10s, 20s, 40s... so Wikimedia doesn't block us."""
    body = urllib.parse.urlencode(params)
    for attempt in range(tries):
        try:
            if post:
                req = urllib.request.Request(url, data=body.encode(), headers={
                    "User-Agent": USER_AGENT, "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded"})
            else:
                req = urllib.request.Request(url + "?" + body, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as err:          # network hiccup or rate limit: wait and retry
            if attempt == tries - 1:
                raise
            wait = 10 * 2 ** attempt
            retry_after = getattr(err, "headers", None) and err.headers.get("Retry-After")
            if retry_after and str(retry_after).isdigit():
                wait = max(int(retry_after), 5)
            print(f"    {err} - waiting {wait}s and trying again")
            time.sleep(wait)


def sparql(query):
    data = http_json(SPARQL, {"query": query, "format": "json"}, post=True)
    return [{k: v["value"] for k, v in row.items()} for row in data["results"]["bindings"]]


def cached(name, refresh, fetcher):
    """Saved lookups make reruns fast. An empty result is never trusted from the cache,
    since that almost always means the lookup failed rather than that nothing exists."""
    path = CACHE / f"{name}.json"
    if path.exists() and not refresh:
        saved = json.loads(path.read_text(encoding="utf-8"))
        if saved:
            return saved
    result = fetcher()
    if result:
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(result), encoding="utf-8")
    return result


def images_by_reference_id(sport, refresh):
    """{reference id: commons file name} for every player Wikidata has a photo for."""
    prop = WIKIDATA_ID[sport]

    def fetch():
        rows = sparql(f"SELECT ?id ?image WHERE {{ ?p wdt:{prop} ?id ; wdt:P18 ?image . }}")
        return {r["id"]: file_name(r["image"]) for r in rows}
    raw = cached(f"wikidata_{sport}", refresh, fetch)
    # Wikidata often stores IDs with the site's letter folder in front ("c/cabremi01");
    # our data has just "cabremi01", so keep only the part after the last slash.
    return {ref.rsplit("/", 1)[-1]: file for ref, file in raw.items()}


def football_images_by_name(refresh):
    """Name matching for older football players who have no reference ID in our data.
    Names shared by two or more players are dropped, so nobody gets the wrong face."""
    def fetch():
        rows = sparql(f"""SELECT ?p ?label ?image WHERE {{
            ?p wdt:P106 wd:{FOOTBALL_PLAYER} ; wdt:P18 ?image ; rdfs:label ?label .
            FILTER(LANG(?label) = "en") }}""")
        seen, unique = {}, {}
        for r in rows:
            key = name_key(r["label"])
            seen.setdefault(key, set()).add(r["p"])
            unique[key] = file_name(r["image"])
        return {k: v for k, v in unique.items() if len(seen[k]) == 1}
    return cached("wikidata_football_names", refresh, fetch)


def file_name(commons_url):
    return urllib.parse.unquote(commons_url.rsplit("/", 1)[-1]).replace("_", " ")


def credits_for(files, refresh):
    """Author and license for each Commons file (the free licenses require showing these)."""
    """Progress is saved after every batch, so if Wikimedia slows us down, the next run
    picks up where this one stopped. Photos still show without credits (as "See file page")."""
    path = CACHE / "credits.json"
    known = json.loads(path.read_text(encoding="utf-8")) if path.exists() and not refresh else {}
    todo = [f for f in files if f not in known]
    if todo:
        print(f"  looking up credits for {len(todo)} photos (about {len(todo) // 50 + 1} requests)...")
    CACHE.mkdir(parents=True, exist_ok=True)
    try:
        for i in range(0, len(todo), 50):
            batch = todo[i:i + 50]
            data = http_json(COMMONS_API, {"action": "query", "format": "json", "prop": "imageinfo",
                                           "iiprop": "extmetadata", "titles": "|".join("File:" + f for f in batch),
                                           "maxlag": 5})
            # Commons may return a file's title in a slightly different form, so map it back
            fixed = {n["to"]: n["from"] for k in ("normalized", "redirects") for n in data.get("query", {}).get(k, [])}
            for page in data.get("query", {}).get("pages", {}).values():
                meta = (page.get("imageinfo") or [{}])[0].get("extmetadata", {})
                artist = re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", "Unknown")).strip()
                title = page.get("title", "")
                title = fixed.get(title, title).replace("File:", "")
                known[title] = {"author": artist[:120] or "Unknown",
                                "license": meta.get("LicenseShortName", {}).get("value", "See file page")}
            path.write_text(json.dumps(known), encoding="utf-8")
            done = min(i + 50, len(todo))
            if done % 500 == 0 or done == len(todo):
                print(f"    credits: {done}/{len(todo)}")
            time.sleep(1.0)               # be polite: one request a second
    except Exception as err:
        print(f"  Stopped looking up credits ({err}). Saved progress; run again later to finish.")
    return known


def photo_entry(file, credits):
    c = credits.get(file, {})
    return {"src": f"https://commons.wikimedia.org/wiki/Special:FilePath/{urllib.parse.quote(file)}?width={THUMB_WIDTH}",
            "page": f"https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(file.replace(' ', '_'))}",
            "author": c.get("author", "Unknown"), "license": c.get("license", "See file page")}


# ------------------------------------------------------------------
# Legend pictures
# ------------------------------------------------------------------
def prepare_legends():
    """Crop/resize every picture in public/legends/ to the card shape. Returns {file stem: card path}."""
    ready = {}
    pictures = [p for p in LEGENDS.glob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")]
    if not pictures:
        return ready
    try:
        from PIL import Image, ImageOps
    except ImportError:
        print("  To use legend pictures, install Pillow first:  python -m pip install pillow")
        return ready
    out = LEGENDS / "cards"
    out.mkdir(parents=True, exist_ok=True)
    for pic in pictures:
        target = out / f"{slug(pic.stem)}.jpg"
        if not target.exists() or target.stat().st_mtime < pic.stat().st_mtime:
            with Image.open(pic) as im:
                im = ImageOps.exif_transpose(im).convert("RGB")
                ImageOps.fit(im, CARD_SIZE, method=Image.LANCZOS, centering=(0.5, 0.35)).save(target, quality=86)
        ready[slug(pic.stem)] = f"legends/cards/{target.name}"
    return ready


def main():
    refresh = "--refresh" in sys.argv
    only = [a for a in sys.argv[1:] if a in SPORTS]      # e.g.  python scripts/build_photos.py football
    all_players = players_by_sport()
    (PUBLIC_DATA / "photos").mkdir(parents=True, exist_ok=True)

    # 1. Wikimedia photos (each sport on its own, so one failure doesn't stop the others)
    for sport, players in all_players.items():
        if not players or (only and sport not in only):
            continue
        print(f"Photos for {sport}...")
        try:
            by_id = images_by_reference_id(sport, refresh)
            by_name = football_images_by_name(refresh) if sport == "football" else {}
            print(f"  Wikidata: {len(by_id)} {sport} players with a photo by ID"
                  + (f", {len(by_name)} more by name" if sport == "football" else ""))
            chosen = {}
            for p in players:
                if p.get("ref") and p["ref"] in by_id:
                    chosen[p["ref"]] = by_id[p["ref"]]
                # by name: players with no ID, and pre-1999 players whose ID Wikidata doesn't know
                elif (not p.get("ref") or p["year"] < 1999) and name_key(p["name"]) in by_name:
                    chosen["name:" + name_key(p["name"])] = by_name[name_key(p["name"])]
            if by_id and not chosen:          # something doesn't line up: show both sides
                print(f"  No matches. Our IDs look like {[p.get('ref') for p in players[:3]]}, "
                      f"Wikidata's look like {list(by_id)[:3]}")
            credits = credits_for(sorted(set(chosen.values())), refresh)
            photos = {key: photo_entry(file, credits) for key, file in chosen.items()}
            (PUBLIC_DATA / "photos" / f"{sport}.json").write_text(json.dumps(photos), encoding="utf-8")

            def has(p):
                return (p.get("ref") in photos) or (
                    (not p.get("ref") or p["year"] < 1999) and "name:" + name_key(p["name"]) in photos)
            stars = [p for p in players if p["ovr"] >= 90]
            print(f"  {sport}: photos for {sum(map(has, players)) / len(players):.0%} of player-seasons, "
                  f"{sum(map(has, stars)) / max(len(stars), 1):.0%} of 90+ rated")
        except Exception as err:
            print(f"  Couldn't reach Wikidata/Wikimedia for {sport} ({err}). "
                  f"Cards will show initials; run  python scripts/build_photos.py {sport}  again later.")
        time.sleep(3)
    for sport in SPORTS:                       # the app expects a file per sport, even an empty one
        path = PUBLIC_DATA / "photos" / f"{sport}.json"
        if not path.exists():
            path.write_text("{}", encoding="utf-8")

    # 2. Legend pictures and the list of who needs one
    ready = prepare_legends()
    legends, rows = {}, []
    for sport, players in all_players.items():
        for p in players:
            if p["ovr"] < 99:
                continue
            base, season_slug = slug(p["name"]), f"{slug(p['name'])}-{p['year']}"
            pic = ready.get(season_slug) or ready.get(base)
            if pic:
                legends[p["id"]] = pic
            rows.append({"sport": sport, "season": p["label"], "name": p["name"], "team": p["team"],
                         "file name to use": f"{base}.jpg", "has picture": "yes" if pic else "no"})
    (PUBLIC_DATA / "legends.json").write_text(json.dumps(legends), encoding="utf-8")
    with open(PROJECT / "legends_needed.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["sport", "season", "name", "team", "file name to use", "has picture"])
        w.writeheader()
        w.writerows(rows)
    print(f"\nLegend pictures: {len(legends)} of {len(rows)} 99-rated seasons have one. "
          f"See legends_needed.csv for the full list.")


if __name__ == "__main__":
    main()
