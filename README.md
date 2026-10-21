# Era Draft

Draft real players from random teams across history, fill every position, then take your team through a full season, playoffs and awards against the best teams of your chosen era. Baseball, basketball and football; soccer is coming later.

Built with React + Vite (the game) and Python + pandas (the data pipeline).

## Run it

```
python -m pip install pandas openpyxl pillow
python scripts/build_all.py      # builds the season files into public/data/
npm install
npm run dev                      # then open the address it prints
```

Baseball needs the Lahman CSVs in `data/raw/lahman/`. Football before 1999 needs the Kaggle files in `data/raw/pfr_kaggle/` (optional). Everything else downloads itself.

## How it works

- **Data pipeline** (`scripts/`): one converter per sport turns raw stats into one JSON file per season.
- **Ratings** (`scripts/ratings.py`): each player is compared with players at his position in his own season (a z-score), then mapped to 55-99. A 99 appears about once every 2.5 seasons per sport. Hall of Famers have a floor of 85 in seasons they were regulars.
- **Validation** (`scripts/calibrate.mjs`): team ratings are checked against real records. Correlation between rating and real win %: basketball 0.87, baseball 0.76, football 0.72. The simulator's upset factor per sport is fitted to that data.
- **Game** (`src/`): screens in `src/components/`, rules in plain JavaScript in `src/game/` (draft, league, playoffs, modes, recap).

## Credits

- Baseball: Lahman Baseball Database (SABR), 1950-2025
- Basketball: Basketball-Reference statistics via github.com/sumitrodatta/bball-reference-datasets
- Football: nflverse (1999-2025); "NFL Football Player Stats" on Kaggle, scraped from Pro-Football-Reference (1966-1998)
- Offensive line ratings: u/gyman122's OL Z-Score database (Reddit), extended to 2022-2025 with the same method
- Photos: Wikimedia Commons, credited individually on the in-app Credits page
