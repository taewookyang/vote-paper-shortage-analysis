"""Merge sharded nationwide overnight collection outputs."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"


def merge_csv(
    pattern: str,
    output: Path,
    keys: list[str],
    *,
    use_existing: bool = False,
) -> pd.DataFrame:
    files = sorted(ROOT.glob(pattern))
    if not files:
        if use_existing and output.exists():
            frame = pd.read_csv(output)
            print(f"{output.relative_to(ROOT)}: using existing {len(frame):,} rows")
            return frame
        raise FileNotFoundError(f"No files matched {pattern}")

    frame = pd.concat((pd.read_csv(file) for file in files), ignore_index=True)
    frame = frame.drop_duplicates(keys).sort_values(keys).reset_index(drop=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output, index=False, encoding="utf-8-sig")
    print(f"{output.relative_to(ROOT)}: {len(frame):,} rows from {len(files)} workers")
    return frame


def main() -> None:
    margins = merge_csv(
        "data/processed/national_margin_screening_2026_worker_*.csv",
        PROCESSED / "national_margin_screening_2026.csv",
        ["시도", "구시군", "선거종류", "선거구코드"],
        use_existing=True,
    )
    timeline = merge_csv(
        "data/raw/nec_vote_progress_2026_worker_*.csv",
        RAW / "nec_vote_progress_national_2026.csv",
        ["시도", "조회시간", "구시군명"],
        use_existing=True,
    )
    turnout = merge_csv(
        "data/raw/national_dong_turnout_worker_*.csv",
        RAW / "national_dong_turnout.csv",
        ["cityCode", "townCode", "동"],
        use_existing=True,
    )

    payload = {
        "generatedAt": pd.Timestamp.now().isoformat(),
        "scope": "전국 광역·기초의원 당선권 경계 표차 기준선",
        "items": margins.where(pd.notna(margins), None).to_dict(orient="records"),
    }
    output = PROCESSED / "dashboard" / "national_margin_screening_2026.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Timeline rows: {len(timeline):,}; turnout rows: {len(turnout):,}")


if __name__ == "__main__":
    main()
