"""Collect the 2026 NEC election-day polling-place list as a national CSV mirror.

The source is the NEC public-data API endpoint wrapped by src.collectors.nec_api.
Rows are stored as raw mirror data; no database is introduced.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.collectors.nec_api import SG_ID_9TH, fetch_polling_places  # noqa: E402

CODES_PATH = ROOT / "data" / "raw" / "national_codes.json"
OUT_PATH = ROOT / "data" / "raw" / "nec_polling_places_2026_national.csv"
CHECKPOINT_PATH = ROOT / "data" / "raw" / "nec_polling_places_2026_national_checkpoint.json"
SOURCE = "NEC public data API PolplcInfoInqireService2/getPolplcOtlnmapTrnsportInfoInqire"


def load_targets() -> list[dict[str, str]]:
    cities = json.loads(CODES_PATH.read_text(encoding="utf-8"))
    return [
        {
            "city_code": city["code"],
            "city_name": city["name"],
            "town_code": town["code"],
            "town_name": town["name"],
        }
        for city in cities
        for town in city["towns"]
    ]


def load_checkpoint() -> dict:
    if not CHECKPOINT_PATH.exists():
        return {"rows": [], "completed": [], "failures": []}
    return json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))


def save_checkpoint(state: dict) -> None:
    CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
    CHECKPOINT_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def write_csv(rows: list[dict]) -> None:
    columns = [
        "시도코드",
        "시도",
        "구시군코드",
        "구시군",
        "num",
        "sgId",
        "psName",
        "sdName",
        "wiwName",
        "emdName",
        "placeName",
        "addr",
        "floor",
        "raw",
        "source",
    ]
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    targets = load_targets()
    state = load_checkpoint()
    rows: list[dict] = state["rows"]
    completed = set(state["completed"])

    for index, target in enumerate(targets, start=1):
        key = f"{target['city_code']}|{target['town_code']}"
        if key in completed:
            continue
        try:
            items = fetch_polling_places(SG_ID_9TH, target["city_name"], target["town_name"])
            for item in items:
                rows.append(
                    {
                        "시도코드": target["city_code"],
                        "시도": target["city_name"],
                        "구시군코드": target["town_code"],
                        "구시군": target["town_name"],
                        **item,
                        "raw": json.dumps(item, ensure_ascii=False, sort_keys=True),
                        "source": SOURCE,
                    }
                )
            completed.add(key)
            state["failures"] = [failure for failure in state["failures"] if failure.get("key") != key]
            print(f"{index}/{len(targets)} {target['city_name']} {target['town_name']}: {len(items)} rows")
        except Exception as exc:
            state["failures"].append({"key": key, "target": target, "error": str(exc)})
            print(f"{index}/{len(targets)} {target['city_name']} {target['town_name']}: failed {exc}")
        state["rows"] = rows
        state["completed"] = sorted(completed)
        save_checkpoint(state)
        write_csv(rows)

    print(f"saved {OUT_PATH} rows={len(rows)} completed={len(completed)} failures={len(state['failures'])}")


if __name__ == "__main__":
    main()
