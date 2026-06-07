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
REPORTED_EVENTS = [
    {
        "gu": "송파구",
        "dong": "잠실2동",
        "polling_place": "잠실2동 제6투표소",
        "evidence_level": "media_reported_shutdown",
        "event": "투표 중단",
        "source_actor": "언론 현장 취재",
        "source_url": "https://www.mk.co.kr/news/politics/12064878",
        "note": "기사 사진 설명과 본문에서 투표 중단을 명시",
    },
    {
        "gu": "송파구",
        "dong": "잠실4동",
        "polling_place": "잠실4동 제5투표소",
        "evidence_level": "media_reported_shutdown",
        "event": "투표 일시 중단",
        "source_actor": "언론 현장 취재",
        "source_url": "https://www.donga.com/news/Politics/article/all/20260603/134042934/1",
        "note": "오후 4시 중단, 오후 5시 10분 재개를 명시",
    },
    {
        "gu": "송파구",
        "dong": "잠실7동",
        "polling_place": "잠실7동 제2투표소",
        "evidence_level": "media_reported_shutdown",
        "event": "투표 중단",
        "source_actor": "언론 현장 취재",
        "source_url": "https://www.seoul.co.kr/news/politics/local-election2026/2026/06/04/20260604001003",
        "note": "기사 사진 설명에서 투표 중단 및 오후 10시까지 연장을 명시",
    },
    {
        "gu": "송파구",
        "dong": "가락2동",
        "polling_place": "가락2동 제3투표소",
        "evidence_level": "media_reported_delay",
        "event": "투표 지연",
        "source_actor": "언론 현장 보도",
        "source_url": "https://biz.chosun.com/policy/politics/election/2026/06/03/R4OC75Y73BGQ7C7XA2LS4W3TQM/",
        "note": "용지 부족으로 지연돼 오후 6시 이후에도 투표가 이어졌다고 보도",
    },
    {
        "gu": "송파구",
        "dong": "가락2동",
        "polling_place": "가락2동 제7투표소",
        "evidence_level": "media_reported_delay",
        "event": "투표 지연",
        "source_actor": "언론 현장 보도",
        "source_url": "https://biz.chosun.com/policy/politics/election/2026/06/03/R4OC75Y73BGQ7C7XA2LS4W3TQM/",
        "note": "용지 부족 해결을 기다린 뒤 오후 6시 이후에도 투표가 이어졌다고 보도",
    },
    {
        "gu": "연수구",
        "dong": "송도5동",
        "polling_place": "송도5동 제1투표소",
        "evidence_level": "local_nec_reported_delay",
        "event": "투표 지연",
        "source_actor": "인천선관위 설명을 인용한 언론 보도",
        "source_url": "https://biz.chosun.com/topics/topics_social/2026/06/04/XKNC5TGJ2VCHBENZFULTNNNMBI/",
        "note": "인천선관위 설명상 용지 부족으로 약 20분 대기",
    },
    {
        "gu": "연수구",
        "dong": "동춘1동",
        "polling_place": "동춘1동 제6투표소",
        "evidence_level": "local_nec_reported_delay",
        "event": "투표 지연",
        "source_actor": "인천선관위 설명을 인용한 언론 보도",
        "source_url": "https://biz.chosun.com/topics/topics_social/2026/06/04/XKNC5TGJ2VCHBENZFULTNNNMBI/",
        "note": "인천선관위 설명상 추가 용지까지 소진돼 약 10분 지연",
    },
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
    target["demand_ratio"] = (target["당일투표율"] / 50).round(4)

    named = shortages[shortages["투표소명"].notna()].copy()
    named["실제부족확인"] = named["실제부족여부"].map(clean_bool)
    reported_by_place = {item["polling_place"]: item for item in REPORTED_EVENTS}
    named["보도사건"] = named["투표소명"].map(
        lambda name: reported_by_place.get(name, {}).get("event")
    )
    named["보도증거수준"] = named["투표소명"].map(
        lambda name: reported_by_place.get(name, {}).get("evidence_level")
    )

    known_by_dong: dict[tuple[str, str], list[dict]] = {}
    for row in records(named):
        known_by_dong.setdefault((row["구시군"], row["읍면동"]), []).append(row)

    candidates = []
    for row in records(target[target["demand_ratio"] > 1].sort_values("demand_ratio", ascending=False)):
        gu, dong = row["구시군"], row["동"]
        known = known_by_dong.get((gu, dong), [])
        if any(item.get("보도증거수준") == "media_reported_shutdown" for item in known):
            evidence = "media_reported_shutdown"
        elif any(item.get("보도증거수준") == "local_nec_reported_delay" for item in known):
            evidence = "local_nec_reported_delay"
        elif any(item.get("보도증거수준") == "media_reported_delay" for item in known):
            evidence = "media_reported_delay"
        elif any(item["실제부족확인"] is True for item in known):
            evidence = "reported_shortage"
        else:
            evidence = "model_candidate"
        places = polling[(polling["wiwName"] == gu) & (polling["emdName"] == dong)]["psName"].tolist()
        candidates.append(
            {
                "gu": gu,
                "dong": dong,
                "demand_ratio": row["demand_ratio"],
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

    below = target[target["demand_ratio"] <= 1].groupby("구시군")["demand_ratio"].max().to_dict()
    unresolved = [
        {
            "gu": gu,
            "official_shutdown_count": OFFICIAL_SHUTDOWN[gu],
            "max_dong_demand_ratio": round(float(below.get(gu, 0)), 4),
            "evidence_level": "gu_only",
            "reason": "구별 중단 수만 확인되며, 공개된 동 평균만으로 실제 중단 위치를 식별할 수 없음",
        }
        for gu in ["광진구", "연수구"]
    ]

    payload = {
        "meta": {
            "description": "선관위 공식 구별 중단 집계, 보도상 위치, 모델 조사 후보를 분리한 자료",
            "interpretation": (
                "중앙선관위 공식 자료는 5개 구의 중단 수 합계만 뜻한다. 보도상 위치는 "
                "기사 또는 지역선관위 설명 인용으로 장소가 특정된 사례이며, 모델 후보는 "
                "동 전체 선거일 투표율로 좁힌 조사 대상일 뿐 실제 중단 위치가 아니다."
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
        "reported_events": REPORTED_EVENTS,
        "model_candidates": candidates,
        "known_locations": known_locations,
        "gu_only_unresolved": unresolved,
        "summary": {
            "model_candidate_dongs": len(candidates),
            "candidate_polling_places": sum(item["polling_place_count"] for item in candidates),
            "named_locations": len(known_locations),
            "officially_named_shutdown_locations": 0,
            "media_reported_shutdown_locations": sum(
                item["evidence_level"] == "media_reported_shutdown" for item in REPORTED_EVENTS
            ),
            "local_nec_reported_delay_locations": sum(
                item["evidence_level"] == "local_nec_reported_delay" for item in REPORTED_EVENTS
            ),
            "media_reported_delay_locations": sum(
                item["evidence_level"] == "media_reported_delay" for item in REPORTED_EVENTS
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
