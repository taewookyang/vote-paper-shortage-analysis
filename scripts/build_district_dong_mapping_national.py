"""Build a national election-district to eup/myeon/dong mapping from NEC VCCP08 rows."""
from __future__ import annotations

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "raw" / "nec_candidate_results_2026_national_all.csv"
OUT = ROOT / "data" / "raw" / "district_dong_mapping_2026_national.csv"
DISTRICT_ELECTION_CODES = {"5", "6"}
EXCLUDED_UNITS = {"합계", "거소투표", "관외사전투표", "잘못 투입·구분된 투표지"}


def main() -> None:
    mapping: dict[tuple[str, str, str, str, str, str], dict[str, str]] = {}
    with SOURCE.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("선거코드") not in DISTRICT_ELECTION_CODES:
                continue
            dong = (row.get("읍면동명") or "").strip()
            unit = (row.get("개표단위") or "").strip()
            if not dong or unit in EXCLUDED_UNITS:
                continue
            key = (
                row.get("시도", ""),
                row.get("구시군", ""),
                row.get("선거코드", ""),
                row.get("선거종류", ""),
                row.get("선거구코드", ""),
                row.get("선거구명", ""),
                dong,
            )
            current = mapping.setdefault(
                key,
                {
                    "시도": key[0],
                    "구시군": key[1],
                    "선거코드": key[2],
                    "선거종류": key[3],
                    "선거구코드": key[4],
                    "선거구명": key[5],
                    "읍면동명": key[6],
                    "관측개표단위수": "0",
                    "source": "NEC VCCP08 후보별 개표단위 득표",
                    "source_file": str(SOURCE.relative_to(ROOT)).replace("\\", "/"),
                },
            )
            current["관측개표단위수"] = str(int(current["관측개표단위수"]) + 1)

    columns = ["시도", "구시군", "선거코드", "선거종류", "선거구코드", "선거구명", "읍면동명", "관측개표단위수", "source", "source_file"]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(sorted(mapping.values(), key=lambda row: tuple(row[column] for column in columns[:7])))
    print(f"saved {OUT} rows={len(mapping)}")


if __name__ == "__main__":
    main()
