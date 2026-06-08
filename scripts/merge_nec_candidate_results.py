"""Merge sharded NEC candidate-result mirror CSV files."""
from __future__ import annotations

import os
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"


def main() -> None:
    scope = os.environ.get("SCOPE", "national_all")
    pattern = f"nec_candidate_results_2026_{scope}_worker_*_of_*.csv"
    shards = sorted(RAW.glob(pattern))
    if not shards:
        raise SystemExit(f"No shards found: {pattern}")

    frame = pd.concat([pd.read_csv(path) for path in shards], ignore_index=True, sort=False)
    frame = frame.drop_duplicates()
    out = RAW / f"nec_candidate_results_2026_{scope}.csv"
    frame.to_csv(out, index=False, encoding="utf-8-sig")
    print(f"{out.relative_to(ROOT)}: shards={len(shards)}, rows={len(frame)}")


if __name__ == "__main__":
    main()
