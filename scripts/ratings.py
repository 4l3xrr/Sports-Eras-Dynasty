"""
ratings.py
----------
The rating scale every sport shares.

How a rating is made:
  1. Each sport's converter scores every player on the stats that matter for his
     position (for example OPS+ for hitters, sacks for pass rushers).
  2. That score becomes a z-score: how many standard deviations above or below the
     average player at his position, in his own season. 0 = average, 2 = best in the
     league that year, 3 = historic.
  3. The z-score is turned into a 55-99 rating. Anchors are tuned per sport so that a
     99 shows up about once every SEASONS_PER_99 seasons and the 90+ and 95+ tiers hold
     the same share of players in every sport.

Hall of Fame floor: a Hall of Famer's rating can't drop below HOF_FLOOR in a season
where he was a regular. Stats above the floor always win.
"""

import numpy as np
import pandas as pd

# ------------------------------------------------------------------
# SETTINGS (shared by every sport; change here, then rebuild)
# ------------------------------------------------------------------
SEASONS_PER_99 = 2.5     # one 99 every 2.5 seasons per sport, on average
AVERAGE_RATING = 72      # rating of a perfectly average regular (z = 0)
LOWEST_RATING = 55
HOF_FLOOR = 85
SHARE_95_PLUS = 0.005    # top 0.5% of player-seasons rate 95 or higher
SHARE_90_PLUS = 0.025    # top 2.5% rate 90 or higher


def zscore(values, groups=None):
    """Standard score, optionally within groups (for example season + position)."""
    values = pd.Series(values, dtype=float)
    if groups is None:
        sd = values.std()
        return (values - values.mean()) / sd if sd > 0 else values * 0
    grouped = values.groupby(groups)
    mean, sd = grouped.transform("mean"), grouped.transform("std")
    return ((values - mean) / sd.replace(0, np.nan)).fillna(0)


def blend(parts, weights=None):
    """Weighted average of several z-scores, re-standardised later by the caller."""
    frame = pd.concat(parts, axis=1)
    if weights is None:
        return frame.mean(axis=1, skipna=True)
    w = pd.Series(weights, index=frame.columns)
    present = frame.notna()
    return (frame.fillna(0) * w).sum(axis=1) / (present * w).sum(axis=1).replace(0, np.nan)


def calibrate(z, n_seasons, share=1.0):
    """Anchor points for turning z-scores into ratings.
    99 is reserved for about one player every SEASONS_PER_99 seasons; 95 and 90 sit at
    fixed shares of all player-seasons, so every sport has the same tier sizes.
    Between anchors the line is straight, so bigger gaps in z still mean bigger gaps in rating.
    share: when calibrating one position group on its own, the group's share of all players,
    so it gets its fair share of the sport's 99s."""
    z = np.sort(np.asarray(pd.Series(z).dropna()))[::-1]
    wanted = max(1, round(share * n_seasons / SEASONS_PER_99))
    z99 = float(z[min(wanted, len(z)) - 1])
    z95 = min(float(np.quantile(z, 1 - SHARE_95_PLUS)), z99 - 0.05)
    z90 = min(float(np.quantile(z, 1 - SHARE_90_PLUS)), z95 - 0.05)
    return [(-10.0, 0.0), (0.0, AVERAGE_RATING), (z90, 90.0), (z95, 95.0), (z99, 99.0), (z99 + 10, 101.0)]


def to_ovr(z, anchors):
    """Piecewise straight line through the anchors. Only z at or above the 99 anchor reaches 99."""
    xs, ys = zip(*anchors)
    raw = np.interp(np.asarray(z, dtype=float), xs, ys)
    z99 = anchors[-2][0]
    ovr = np.clip(np.floor(raw + 0.5), LOWEST_RATING, 98).astype(int)
    return pd.Series(np.where(np.asarray(z) >= z99, 99, ovr), index=getattr(z, "index", None))


def apply_floor(ovr, is_hof, is_regular, floor=HOF_FLOOR):
    """Raise Hall of Famers to the floor in seasons where they were regulars.
    Returns (new ratings, which rows the floor actually raised)."""
    raised = is_hof & is_regular & (ovr < floor)
    return ovr.where(~raised, floor), raised


def report(sport, ovr, n_seasons):
    counts = {label: int(((ovr >= lo) & (ovr <= hi)).sum())
              for label, lo, hi in [("99", 99, 99), ("95-98", 95, 98), ("90-94", 90, 94)]}
    per = {k: round(v / n_seasons, 2) for k, v in counts.items()}
    print(f"\n{sport}: {counts['99']} players rated 99 across {n_seasons} seasons "
          f"(one every {n_seasons / max(counts['99'], 1):.1f} seasons). "
          f"Per season: {per['95-98']} at 95-98, {per['90-94']} at 90-94.")
