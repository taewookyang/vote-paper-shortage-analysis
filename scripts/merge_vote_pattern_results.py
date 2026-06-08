"""Merge sharded vote-pattern raw CSV files into a canonical input file."""
from __future__ import annotations

import os
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"


def main() -> None:
    scope = os.environ.get("SCOPE", "national_metro")
    pattern = f"vote_pattern_results_2026_{scope}_worker_*_of_*.csv"
    shards = sorted(RAW.glob(pattern))
    if not shards:
        raise SystemExit(f"No shard CSV files found for {pattern}")

    frames = [pd.read_csv(path) for path in shards]
    merged = pd.concat(frames, ignore_index=True, sort=False)
    merged = merged.drop_duplicates()

    out = RAW / f"vote_pattern_results_2026_{scope}.csv"
    merged.to_csv(out, index=False, encoding="utf-8-sig")
    print(f"{out.relative_to(ROOT)}: shards={len(shards)}, rows={len(merged)}")


if __name__ == "__main__":
    main()
