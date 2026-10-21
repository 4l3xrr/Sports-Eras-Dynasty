export default function Credits({ seen, onBack }) {
  const photos = [...seen.values()];
  return (
    <section className="credits fade">
      <div className="intro" style={{ marginBottom: 0 }}>
        <span className="eyebrow">Credits</span>
        <h1>Data and photos</h1>
      </div>
      <div className="panel box">
        <span className="eyebrow">Data</span>
        <ul>
          <li>Baseball: <a href="https://sabr.org/lahman-database/" target="_blank" rel="noreferrer">Lahman Baseball Database</a> (SABR), 1950–2025.</li>
          <li>Basketball: Basketball-Reference statistics via <a href="https://github.com/sumitrodatta/bball-reference-datasets" target="_blank" rel="noreferrer">sumitrodatta/bball-reference-datasets</a>.</li>
          <li>Football 1999–2025: <a href="https://github.com/nflverse" target="_blank" rel="noreferrer">nflverse</a>. Football 1966–1998: the "NFL Football Player Stats" dataset on Kaggle, scraped from Pro-Football-Reference.</li>
          <li>Offensive line ratings: u/gyman122's OL Z-Score database (Reddit), built on Pro-Football-Reference data; 2022–2025 extended with the same method.</li>
          <li>Hall of Fame data: Lahman, Basketball-Reference, and the Pro Football Hall of Fame.</li>
        </ul>
      </div>
      <div className="panel box">
        <span className="eyebrow">Photos seen this visit ({photos.length})</span>
        {photos.length ? (
          <ul>
            {photos.map((p) => (
              <li key={p.page}><a href={p.page} target="_blank" rel="noreferrer">{decodeURIComponent(p.page.split("File:")[1] || "Photo").replace(/_/g, " ")}</a> · {p.author} · {p.license}</li>
            ))}
          </ul>
        ) : <p className="muted" style={{ margin: 0 }}>No photos shown yet. Photos come from Wikimedia Commons under free licenses; players without one show their initials.</p>}
      </div>
      <div className="actions" style={{ maxWidth: 240 }}><button className="btn" onClick={onBack}>Back</button></div>
    </section>
  );
}
