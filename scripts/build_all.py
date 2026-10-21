"""
build_all.py
------------
Runs every converter, then the photo script.

    python scripts/build_all.py

Basketball and football download their own data the first time.
Baseball needs the Lahman CSVs in data/raw/lahman/ (see the setup guide).
Football before 1999 needs the Kaggle files in data/raw/pfr_kaggle/ (optional).
"""

import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
LAHMAN = SCRIPTS.parent / "data" / "raw" / "lahman" / "People.csv"

results = {}
for step in ["baseball", "basketball", "football", "photos"]:
    print(f"\n=== {step.upper()} ===")
    if step == "baseball" and not LAHMAN.exists():
        print("Skipped: put the Lahman CSVs in data/raw/lahman/ first.")
        results[step] = "skipped"
        continue
    run = subprocess.run([sys.executable, str(SCRIPTS / f"build_{step}.py")], cwd=SCRIPTS.parent)
    results[step] = "ok" if run.returncode == 0 else "FAILED (see the error above)"

print("\n=== SUMMARY ===")
for step, result in results.items():
    print(f"{step:<11} {result}")
