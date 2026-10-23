# Era Draft

Draft real players from random teams across history, fill every position, then take your team through a full season, playoffs and awards against the best teams of your chosen era. Baseball, basketball and football; soccer is coming later.

Also includes **The Numbers Game**: each round shows five mystery players from any era (just the year and some of their stats). Pick who was best. Some rounds have no stars, some have three, and about a third are traps, where the stats shown are chosen to make a weaker player look best. You're graded on how close you came to the best team you could've had. Play solo or pass-and-play against a friend.

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
- **The Numbers Game** (`src/game/quiz.js`): the converters also write a pool of full stat lines per sport (`public/data/quiz/`). Each stat is ranked against every season in history; a trap round picks the weaker card whose most flattering stats out-shine the best card's least flattering ones, while always leaving one honest stat (OPS, ERA, TS%, yards per attempt...) visible. In testing, a player who trusts flashy stats picks the best card on 0% of trap rounds; one who reads the honest stats gets 57-78%.

## Credits

- Baseball: Lahman Baseball Database (SABR), 1950-2025
- Basketball: Basketball-Reference statistics via github.com/sumitrodatta/bball-reference-datasets
- Football: nflverse (1999-2025); "NFL Football Player Stats" on Kaggle, scraped from Pro-Football-Reference (1966-1998)
- Offensive line ratings: u/gyman122's OL Z-Score database (Reddit), extended to 2022-2025 with the same method
- Photos: Wikimedia Commons, credited individually on the in-app Credits page
