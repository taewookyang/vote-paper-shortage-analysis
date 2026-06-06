"""Export static dashboard JSON for the Songpa pilot."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from phase2_prototype import build_polling_risk, compute_metrics
from src.analysis.historical_baseline import build_songpa_historical_baseline
from src.analysis.sensitivity import PRESIDENTIAL_2025_REFERENCE, summarize_scenarios


ROOT = Path(__file__).resolve().parents[2]
PROCESSED_DIR = ROOT / "data" / "processed"
DASHBOARD_DIR = PROCESSED_DIR / "dashboard"
PUBLIC_DASHBOARD_DIR = ROOT / "dashboard" / "public" / "data"
PUBLIC_PAYLOADS = {"confirmed_shortages.json"}


def to_records(frame: pd.DataFrame, limit: int | None = None) -> list[dict]:
    if limit is not None:
        frame = frame.head(limit)
    clean = frame.where(pd.notna(frame), None)
    return clean.to_dict(orient="records")


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def build_payloads() -> dict[str, object]:
    risk, shortage = build_polling_risk()
    metrics = compute_metrics(risk, shortage)
    scenarios, scenario_detail = summarize_scenarios(risk)
    history, historical_summary = build_songpa_historical_baseline()

    confirmed = risk[risk["confirmed_shortage_named"]].copy()
    top_risk = risk.sort_values("risk_ratio", ascending=False, na_position="last")

    source_gaps = [
        {"item": "67개 추가 송부 투표소 전체 명단", "status": "partial", "known": 16, "required": 67},
        {"item": "50개 실제 부족 투표소 전체 명단", "status": "partial", "known": 16, "required": 50},
        {"item": "22개 투표 중단/대기 투표소 명단", "status": "partial", "known": 3, "required": 22},
        {"item": "투표소별 선거인수", "status": "missing", "known": 1, "required": 67},
        {"item": "투표소별 최초 배부량", "status": "missing", "known": 1, "required": 67},
        {"item": "추가 송부 요청/도착 시각", "status": "missing", "known": 0, "required": 67},
        {"item": "투표 중단/재개 시각", "status": "partial", "known": 1, "required": 22},
        {"item": "대기 또는 이탈 유권자 기록", "status": "missing", "known": 0, "required": 22},
    ]

    emd_summary = (
        risk.groupby("emdName")
        .agg(
            pollingPlaces=("psName", "count"),
            confirmedShortages=("confirmed_shortage_named", "sum"),
            maxRiskRatio=("risk_ratio", "max"),
            yellowOrHigher=("risk_grade", lambda values: int(values.isin(["RED", "ORANGE", "YELLOW"]).sum())),
        )
        .reset_index()
    )
    emd_summary["maxRiskRatio"] = emd_summary["maxRiskRatio"].round(4)

    emd_positions = {
        "풍납1동": [1, 1],
        "풍납2동": [1, 2],
        "잠실4동": [1, 4],
        "잠실6동": [1, 5],
        "잠실2동": [2, 3],
        "잠실3동": [2, 4],
        "잠실7동": [2, 5],
        "방이1동": [2, 1],
        "방이2동": [2, 2],
        "오륜동": [3, 1],
        "송파1동": [3, 2],
        "송파2동": [3, 3],
        "석촌동": [3, 4],
        "삼전동": [3, 5],
        "잠실본동": [3, 6],
        "오금동": [4, 1],
        "가락본동": [4, 2],
        "가락1동": [4, 3],
        "가락2동": [4, 4],
        "문정1동": [5, 2],
        "문정2동": [5, 3],
        "장지동": [5, 4],
        "거여1동": [5, 5],
        "거여2동": [5, 6],
        "마천1동": [6, 5],
        "마천2동": [6, 6],
        "위례동": [6, 4],
    }
    emd_summary["mapRow"] = emd_summary["emdName"].map(lambda name: emd_positions.get(name, [0, 0])[0])
    emd_summary["mapCol"] = emd_summary["emdName"].map(lambda name: emd_positions.get(name, [0, 0])[1])
    emd_summary["mapGrade"] = emd_summary.apply(
        lambda row: "confirmed"
        if row["confirmedShortages"] > 0
        else ("watch" if row["yellowOrHigher"] > 0 else "low"),
        axis=1,
    )

    facts = {
        "title": "6·3 지방선거 투표용지 부족 사태 공개자료 현황",
        "scope": "송파구 파일럿 및 전국 공개 집계",
        "national": {
            "pollingPlaces": 14288,
            "additionalSent": 67,
            "actualShortage": 50,
            "suspendedOrDelayed": 22,
            "unusedSent": 17,
        },
        "songpa": {
            "pollingPlaces2026": int(len(risk)),
            "officialActualShortage": 14,
            "namedShortages": int(len(confirmed)),
            "labelCoverage": metrics["label_coverage_of_songpa_actual_shortages"],
        },
        "disclaimer": (
            "본 대시보드는 선거 결과나 특정 후보 유불리를 단정하지 않는다. "
            "공개자료와 보수적 가정에 따른 민감도 및 추가 사실조사 우선순위를 보여준다."
        ),
    }

    election_layers = [
        {
            "name": "서울시장",
            "scale": "서울 전체",
            "whyItMatters": "표차가 클 가능성이 커 송파구 일부 투표소 영향은 전체 표차에 묻힐 수 있다.",
            "marginDataStatus": "미연결",
        },
        {
            "name": "송파구청장",
            "scale": "송파구 전체",
            "whyItMatters": "서울시장보다 작은 단위라 부족 투표소 집중이 표차 검토와 연결될 수 있다.",
            "marginDataStatus": "공식 최종 표차 미연결",
            "interimReport": {
                "description": "언론 보도상 87.32% 개표 시점에 169,849표 대 151,392표로 보도됨. 최종 공식 표차가 아니므로 계산에는 사용하지 않음.",
                "source": "https://v.daum.net/v/20260604114122103",
            },
        },
        {
            "name": "서울시의원 지역구",
            "scale": "송파구 내 복수 선거구",
            "whyItMatters": "몇 개 동 단위 선거구라 표차가 작으면 추가 조사 우선순위가 올라갈 수 있다.",
            "marginDataStatus": "미연결",
        },
        {
            "name": "송파구의원 지역구",
            "scale": "가장 작은 지역 선거구",
            "whyItMatters": "다인 선거구와 작은 표차가 결합될 수 있어 표차 자료 연결 우선순위가 가장 높다.",
            "marginDataStatus": "미연결",
        },
    ]

    return {
        "meta.json": {
            "generatedAt": pd.Timestamp.now().isoformat(),
            "version": "songpa-pilot-v1",
            "sourceLimit": "투표소별 선거인수·최초 배부량·완전 라벨이 공개되지 않아 정식 Backtesting 지표는 null로 둔다.",
        },
        "facts.json": facts,
        "presidential_reference.json": PRESIDENTIAL_2025_REFERENCE,
        "election_layers.json": {
            "items": election_layers,
            "nextDataNeeded": [
                "2026 송파구청장 당선-차점 표차",
                "2026 서울시의원 송파구 각 선거구 당선-차점 표차",
                "2026 송파구의원 각 선거구 당선권-차점권 표차",
                "부족 투표소별 선거구 매핑",
            ],
        },
        "source_gaps.json": {"items": source_gaps},
        "metrics.json": metrics,
        "polling_places.json": {
            "items": to_records(
                top_risk[
                    [
                        "psName",
                        "emdName",
                        "placeName",
                        "addr",
                        "risk_ratio",
                        "risk_grade",
                        "confirmed_shortage_named",
                        "estimated_voters_per_polling_place",
                        "expected_election_day_votes_m2_proxy",
                        "estimated_ballots_m1",
                    ]
                ]
            )
        },
        "emd_summary.json": {
            "items": to_records(emd_summary.sort_values(["mapRow", "mapCol"]))
        },
        "historical_baseline.json": {
            "history": to_records(history.sort_values(["emdName", "year"])),
            "summary": to_records(
                historical_summary.sort_values(
                    ["maxRiskRatioAt50", "minMarginAt50"], ascending=[False, True]
                )
            ),
            "note": "최근 2회 지방선거(2018, 2022)의 송파구 읍면동별 선거일투표 수요를 50% 배부 기준과 비교한 기준선이다.",
        },
        "confirmed_shortages.json": {
            "items": to_records(
                confirmed[
                    [
                        "psName",
                        "emdName",
                        "placeName",
                        "addr",
                        "투표소명",
                        "출처URL",
                    ]
                ]
            )
        },
        "sensitivity.json": {
            "scenarios": scenarios,
        },
        "sensitivity_detail.json": {
            "detail": to_records(
                scenario_detail[
                    [
                        "psName",
                        "emdName",
                        "scenario_supply_ratio",
                        "scenario_demand_growth",
                        "scenario_attrition_rate",
                        "scenario_margin_threshold",
                        "scenario_ballots",
                        "scenario_expected_votes",
                        "scenario_risk_ratio",
                        "scenario_supply_pressure",
                        "scenario_spare_ballots",
                        "scenario_risk_grade",
                        "scenario_potential_affected",
                        "scenario_priority_score",
                        "scenario_priority_band",
                        "confirmed_shortage_named",
                    ]
                ]
            ),
        },
    }


def main() -> None:
    payloads = build_payloads()
    for name, payload in payloads.items():
        write_json(DASHBOARD_DIR / name, payload)
        if name in PUBLIC_PAYLOADS:
            write_json(PUBLIC_DASHBOARD_DIR / name, payload)
    print(f"Exported {len(payloads)} dashboard JSON files")
    print(f"- {DASHBOARD_DIR}")
    print(f"- {PUBLIC_DASHBOARD_DIR}")


if __name__ == "__main__":
    main()
