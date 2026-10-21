// Loading the season files the Python converters write into public/data/.
// Every file is fetched at most once per visit.

const cache = new Map();

async function getJSON(path, fallback) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    }).catch((err) => {
      cache.delete(path);
      if (fallback !== undefined) return fallback;
      throw err;
    }));
  }
  return cache.get(path);
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export async function seasonsInEra(sport, era) {
  const index = await getJSON(`data/${sport}/index.json`);
  const inRange = index.filter((s) => s.year >= era.from && s.year <= era.to);
  return inRange.length ? inRange : index;
}

export async function loadSeason(sport, entry) {
  return getJSON(`data/${sport}/${entry.file}`);
}

// Real win percentage from a record like "12-4" or "8-5-1" (ties count half)
export function winPct(record) {
  const parts = String(record || "").split("-").map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  const [w, l, t = 0] = parts;
  const games = w + l + t;
  return games ? (w + t / 2) / games : null;
}

// Attach season and team info to each player, so cards can say "1995-96 Chicago Bulls"
export function withContext(sport, season, team) {
  const label = season.label || String(season.year);
  return {
    ...team,
    year: season.year,
    label,
    era: season.era,
    sport,
    players: team.players.map((p) => ({ ...p, from: `${label} ${team.name}`, team: team.name, teamCode: team.code, year: season.year, label })),
  };
}

export async function randomTeam(sport, era) {
  const entry = pick(await seasonsInEra(sport, era));
  const season = await loadSeason(sport, entry);
  return withContext(sport, season, pick(season.teams));
}

// Photos and legend pictures (written by scripts/build_photos.py). Missing files are fine.
export async function loadPictures(sport) {
  const [photos, legends] = await Promise.all([
    getJSON(`data/photos/${sport}.json`, {}),
    getJSON(`data/legends.json`, {}),
  ]);
  return { photos, legends };
}

export function nameKey(name) {
  // must match name_key() in scripts/build_photos.py
  return "name:" + String(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}
