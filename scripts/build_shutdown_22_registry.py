"""Build a 22-slot registry without guessing unpublished polling-place names."""
from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
PUBLIC = ROOT / "dashboard" / "public" / "data"
STRESS_PATH = PROCESSED / "dashboard" / "shutdown_stress_test_2026.json"


def main() -> None:
    stress = json.loads(STRESS_PATH.read_text(encoding="utf-8"))
    official = {
        gu: count for gu, count in stress["official_shutdown"].items() if gu != "합계"
    }
    reported_shutdowns = [
        event for event in stress["reported_events"]
        if event["evidence_level"] == "media_reported_shutdown"
    ]
    related_delays = [
        event for event in stress["reported_events"]
        if event["evidence_level"] in {"media_reported_delay", "local_nec_reported_delay"}
    ]

    shutdowns_by_gu: dict[str, list[dict]] = {}
    for event in reported_shutdowns:
        shutdowns_by_gu.setdefault(event["gu"], []).append(event)

    rows = []
    for gu, count in official.items():
        events = shutdowns_by_gu.get(gu, [])
        for slot in range(1, count + 1):
            event = events[slot - 1] if slot <= len(events) else None
            rows.append({
                "구시군": gu,
                "공식중단순번": f"{slot}/{count}",
                "읍면동": event["dong"] if event else "",
                "투표소명": event["polling_place"] if event else "",
                "위치연결상태": "언론보도상중단위치연결" if event else "위치미공개",
                "증거수준": event["evidence_level"] if event else "official_gu_count_only",
                "사건표현": event["event"] if event else "",
                "출처주체": event["source_actor"] if event else "중앙선관위 구별 집계",
                "출처URL": event["source_url"] if event else stress["meta"]["officialSourceUrls"][0],
                "비고": event["note"] if event else "중앙선관위 투표소명 명단 미공개",
            })

    columns = list(rows[0])
    csv_path = PROCESSED / "shutdown_22_registry_2026.csv"
    with csv_path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)

    payload = {
        "meta": {
            "description": "중앙선관위 구별 중단 수 합계 22곳을 기준으로 만든 추적 레지스트리",
            "interpretation": "언론 보도상 중단이 명시된 위치만 공식 집계 슬롯에 연결하며 나머지는 비워둔다.",
            "disclaimer": "언론 보도 위치 연결은 중앙선관위의 투표소명 22개 공식 명단 확인을 뜻하지 않는다.",
            "officialTotal": len(rows),
            "linkedReportedShutdownLocations": sum(bool(row["투표소명"]) for row in rows),
            "unpublishedLocations": sum(not row["투표소명"] for row in rows),
            "relatedDelayLocationsNotAssigned": len(related_delays),
            "generated": stress["meta"]["generated"],
        },
        "officialByGu": official,
        "items": rows,
        "relatedDelayEvents": related_delays,
    }
    for directory in [PROCESSED / "dashboard", PUBLIC]:
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "shutdown_22_registry_2026.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    print(
        f"{csv_path.relative_to(ROOT)}: {len(rows)} slots, "
        f"{payload['meta']['linkedReportedShutdownLocations']} linked, "
        f"{payload['meta']['unpublishedLocations']} unpublished"
    )


if __name__ == "__main__":
    main()
