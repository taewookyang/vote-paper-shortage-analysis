"""Build the shutdown-area stress-test dataset from auditable source files."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
PUBLIC = ROOT / "dashboard" / "public" / "data"

TARGET_GU = ["송파구", "강남구", "광진구", "서초구", "연수구"]
OFFICIAL_SHUTDOWN = {
    "송파구": 12,
    "강남구": 4,
    "광진구": 2,
    "서초구": 1,
    "연수구": 3,
}
OFFICIAL_SOURCE_URLS = [
    "https://news.sbs.co.kr/news/endPage.do?news_id=N1008597087",
    "https://www.fnnews.com/ampNews/202606052311127041",
]


def clean_bool(value: object) -> bool | None:
    text = str(value).strip().lower()
    if text == "true":
        return True
    if text == "false":
        return False
    return None


def records(frame: pd.DataFrame) -> list[dict]:
    return frame.where(pd.notna(frame), None).to_dict(orient="records")


def main() -> None:
    turnout = pd.read_csv(RAW / "national_dong_turnout.csv")
    shortages = pd.read_csv(RAW / "shortage_2026.csv")
    polling = pd.read_csv(PROCESSED / "shortage_gu_polling_places.csv")

    target = turnout[turnout["구시군"].isin(TARGET_GU)].copy()
    target["risk_ratio"] = (target["당일투표율"] / 50).round(4)

    named = shortages[shortages["투표소명"].notna()].copy()
    named["실제부족확인"] = named["실제부족여부"].map(clean_bool)
    named["투표중단확인"] = named["투표중단여부"].map(clean_bool)

    known_by_dong: dict[tuple[str, str], list[dict]] = {}
    for row in records(named):
        known_by_dong.setdefault((row["구시군"], row["읍면동"]), []).append(row)

    candidates = []
    for row in records(target[target["risk_ratio"] > 1].sort_values("risk_ratio", ascending=False)):
        gu, dong = row["구시군"], row["동"]
        known = known_by_dong.get((gu, dong), [])
        if any(item["투표중단확인"] is True for item in known):
            evidence = "confirmed_shutdown"
        elif any(item["실제부족확인"] is True for item in known):
            evidence = "confirmed_shortage"
        else:
            evidence = "model_candidate"
        places = polling[(polling["wiwName"] == gu) & (polling["emdName"] == dong)]["psName"].tolist()
        candidates.append(
            {
                "gu": gu,
                "dong": dong,
                "risk_ratio": row["risk_ratio"],
                "day_turnout_pct": row["당일투표율"],
                "polling_place_count": len(places),
                "polling_places": places,
                "evidence_level": evidence,
                "known_locations": known,
            }
        )

    known_locations = []
    for row in records(named):
        key = (row["구시군"], row["읍면동"])
        known_locations.append(
            {
                **row,
                "stress_test_candidate": any(
                    item["gu"] == key[0] and item["dong"] == key[1] for item in candidates
                ),
            }
        )

    below = target[target["risk_ratio"] <= 1].groupby("구시군")["risk_ratio"].max().to_dict()
    unresolved = [
        {
            "gu": gu,
            "official_shutdown_count": OFFICIAL_SHUTDOWN[gu],
            "max_dong_risk_ratio": round(float(below.get(gu, 0)), 4),
            "evidence_level": "gu_only",
            "reason": "구별 중단 수만 확인되며, 공개된 동 평균만으로 실제 중단 위치를 식별할 수 없음",
        }
        for gu in ["광진구", "연수구"]
    ]

    payload = {
        "meta": {
            "description": "22곳 중단 지역의 50% 배부 가정 동 단위 스트레스 테스트",
            "interpretation": (
                "실제 중단 위치 예측이 아니다. 동 전체 선거일 투표율이 선거인수의 50%를 "
                "넘었는지 확인하여 추가 조사 후보를 제시한다."
            ),
            "disclaimer": (
                "투표소별 실제 배부량과 전체 중단 위치가 미공개이므로 결과 영향이나 "
                "실제 중단 투표소를 단정할 수 없다."
            ),
            "officialSourceUrls": OFFICIAL_SOURCE_URLS,
            "calculationSources": [
                "data/raw/national_dong_turnout.csv",
                "data/raw/shortage_2026.csv",
                "data/processed/shortage_gu_polling_places.csv",
            ],
            "generated": pd.Timestamp.now().date().isoformat(),
        },
        "official_shutdown": {**OFFICIAL_SHUTDOWN, "합계": sum(OFFICIAL_SHUTDOWN.values())},
        "model_candidates": candidates,
        "known_locations": known_locations,
        "gu_only_unresolved": unresolved,
        "summary": {
            "model_candidate_dongs": len(candidates),
            "candidate_polling_places": sum(item["polling_place_count"] for item in candidates),
            "named_locations": len(known_locations),
            "confirmed_shutdown_named": sum(
                item["투표중단확인"] is True for item in known_locations
            ),
        },
    }

    output_name = "shutdown_stress_test_2026.json"
    for directory in [PROCESSED / "dashboard", PUBLIC]:
        directory.mkdir(parents=True, exist_ok=True)
        (directory / output_name).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    print(f"{output_name}: {len(candidates)} candidate dongs, {len(known_locations)} named locations")


if __name__ == "__main__":
    main()
