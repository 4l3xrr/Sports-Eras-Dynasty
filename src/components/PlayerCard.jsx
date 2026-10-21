import { createContext, useContext, useState } from "react";
import { tierOf, teamColor, priceFor } from "../game/sports.js";
import { nameKey } from "../game/data.js";

// Photos, legend pictures and a tracker for the credits page, shared by every card
export const PicturesContext = createContext({ photos: {}, legends: {}, seen: new Map() });

const TIER_LABEL = { base: "Base", silver: "Silver", gold: "Gold", elite: "Elite", legend: "Legend" };

export function initials(name) {
  const parts = String(name).replace(/[^\p{L}\s.'-]/gu, "").split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function usePhoto(player) {
  const { photos, seen } = useContext(PicturesContext);
  if (!player || player.unit) return null;
  // by ID first; by name only for players the photo script matched that way (no ID, or football before 1999)
  const entry = (player.ref && photos[player.ref]) || ((!player.ref || player.year < 1999) && photos[nameKey(player.name)]);
  if (entry) seen.set(entry.page, entry);
  return entry || null;
}

export function Avatar({ player, sport }) {
  const photo = usePhoto(player);
  const [broken, setBroken] = useState(false);
  const color = teamColor(sport, player.teamCode, player.team);
  return (
    <span className="avatar" style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${color} 80%, #fff 20%), ${color})` }}>
      {photo && !broken
        ? <img src={photo.src} alt="" loading="lazy" onError={() => setBroken(true)} />
        : player.unit ? "OL" : initials(player.name)}
    </span>
  );
}

export function RatingChip({ player, hidden }) {
  const tier = hidden ? "hidden" : tierOf(player.ovr);
  return <span className={`ovr-chip ${tier}`} aria-label={hidden ? "Rating hidden" : `Rating ${player.ovr}`}>{hidden ? "?" : player.ovr}</span>;
}

export function Badges({ player, showPrice }) {
  return (
    <>
      {player.hof ? <span className="badge hof">HOF</span> : null}
      {player.lim ? <span className="badge lim" title="Rated on limited stats from his era">Ltd stats</span> : null}
      {player.flr ? <span className="badge lim" title="Raised to the Hall of Fame floor this season">HOF floor</span> : null}
      {player.era ? <span className="badge era">#{player.era.rank} era</span> : null}
      {showPrice ? <span className="badge price">${priceFor(player.ovr)}</span> : null}
    </>
  );
}

export function PlayerCard({ player, sport, hidden = false, showPrice = false }) {
  const { legends } = useContext(PicturesContext);
  const tier = hidden ? "hidden" : tierOf(player.ovr);
  const art = !hidden && player.ovr >= 99 && legends[player.id];
  const stats = Object.entries(player.stats || {}).slice(0, 3);
  const color = teamColor(sport, player.teamCode, player.team);
  return (
    <div className={`card ${tier}${art ? " art" : ""}`} style={{ "--team": color }}>
      {art ? <div className="art-bg" style={{ backgroundImage: `url(${art})` }} /> : null}
      <div className="top">
        <div className="ovr"><b>{hidden ? "?" : player.ovr}</b><span className="tierlabel">{hidden ? "Hidden" : TIER_LABEL[tier]}</span></div>
        <div className="poslist">{player.positions.map((p) => <span key={p} className="pos">{p}</span>)}</div>
        <div className="badges"><Badges player={player} showPrice={showPrice} /></div>
      </div>
      <div className="mono">
        {player.unit && player.members
          ? <span className="units">{player.members.join(" · ")}</span>
          : <Avatar player={player} sport={sport} />}
      </div>
      <div className="id">
        <div className="nm">{player.name}</div>
        <div className="tm">{player.from}{player.era ? ` · ${player.era.span} era` : ""}</div>
      </div>
      <div className="stats">
        {stats.map(([k, v]) => <div key={k}><b>{v}</b><i>{k}</i></div>)}
        {Array.from({ length: 3 - stats.length }, (_, i) => <div key={`e${i}`}><b>&nbsp;</b><i>&nbsp;</i></div>)}
      </div>
    </div>
  );
}

// A card that flips from hidden to revealed
export function FlipCard({ player, sport, revealed }) {
  return (
    <div className={`flip${revealed ? " on" : ""}`}>
      <div className="inner">
        <div className="front"><PlayerCard player={player} sport={sport} hidden /></div>
        <div className="back"><PlayerCard player={player} sport={sport} /></div>
      </div>
    </div>
  );
}

export function statLine(stats) {
  return Object.entries(stats || {}).map(([k, v]) => `${v} ${k}`).join(" · ");
}
