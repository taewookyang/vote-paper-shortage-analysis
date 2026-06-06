"""Sensitivity analysis helpers for the Songpa pilot dashboard."""
from __future__ import annotations

import math
from dataclasses import dataclass

import pandas as pd


SUPPLY_RATIOS = [0.50, 0.55, 0.60]
DEMAND_GROWTH_RATES = [0.00, 0.05, 0.10, 0.15]
ATTRITION_RATES = [0.00, 0.05, 0.10]
MARGIN_THRESHOLDS = [50, 100, 300, 500]

PRESIDENTIAL_2025_REFERENCE = {
    "label": "2025 대선 오후 유입 참고선",
    "fourPmTurnout": 0.715,
    "finalTurnout": 0.794,
    "lateInflowAfterFourPm": 0.079,
    "use": "지방선거 예측값이 아니라 오후 피크 유입 스트레스 테스트용 참고선",
    "sources": [
        "https://imnews.imbc.com/news/2025/politics/article/6722020_36711.html",
        "https://www.chosun.com/politics/election2025/2025/06/04/RQQFQANTABATTKIQIGHGNILFRU/",
    ],
}


@dataclass(frozen=True)
class Scenario:
    supply_ratio: float
    demand_growth: float
    attrition_rate: float
    margin_threshold: int

    @property
    def label(self) -> str:
        return (
            f"배부 {int(self.supply_ratio * 100)}%, "
            f"수요 +{int(self.demand_growth * 100)}%, "
            f"이탈 {int(self.attrition_rate * 100)}%, "
            f"표차 {self.margin_threshold}표"
        )


def estimated_ballots(voters: float, supply_ratio: float) -> int | None:
    if pd.isna(voters):
        return None
    return math.floor((float(voters) * supply_ratio) / 100) * 100


def risk_grade(ratio: float | None, confirmed_shortage: bool) -> str:
    if confirmed_shortage:
        return "RED"
    if ratio is None or pd.isna(ratio):
        return "UNKNOWN"
    if ratio > 1.1:
        return "ORANGE"
    if ratio >= 0.9:
        return "YELLOW"
    return "GREEN"


def scenario_grid() -> list[Scenario]:
    return [
        Scenario(supply, growth, attrition, margin)
        for supply in SUPPLY_RATIOS
        for growth in DEMAND_GROWTH_RATES
        for attrition in ATTRITION_RATES
        for margin in MARGIN_THRESHOLDS
    ]


def apply_scenario(risk: pd.DataFrame, scenario: Scenario) -> pd.DataFrame:
    frame = risk.copy()
    ballots = frame["estimated_voters_per_polling_place"].map(
        lambda voters: estimated_ballots(voters, scenario.supply_ratio)
    )
    expected = frame["expected_election_day_votes_m2_proxy"] * (1 + scenario.demand_growth)
    gap = expected - ballots
    frame["scenario_label"] = scenario.label
    frame["scenario_supply_ratio"] = scenario.supply_ratio
    frame["scenario_demand_growth"] = scenario.demand_growth
    frame["scenario_attrition_rate"] = scenario.attrition_rate
    frame["scenario_margin_threshold"] = scenario.margin_threshold
    frame["scenario_ballots"] = ballots
    frame["scenario_expected_votes"] = expected.round(2)
    frame["scenario_spare_ballots"] = (ballots - expected).round(2)
    frame["scenario_shortage_gap"] = gap.clip(lower=0).round(2)
    frame["scenario_potential_affected"] = (
        frame["scenario_shortage_gap"] * scenario.attrition_rate
    ).round(2)
    frame["scenario_risk_ratio"] = (expected / ballots).replace(
        [float("inf"), -float("inf")], None
    ).round(4)
    frame["scenario_supply_pressure"] = frame["scenario_risk_ratio"]
    frame["scenario_risk_grade"] = [
        risk_grade(ratio, confirmed)
        for ratio, confirmed in zip(
            frame["scenario_risk_ratio"], frame["confirmed_shortage_named"]
        )
    ]
    frame["scenario_priority_score"] = (
        frame["scenario_potential_affected"] / scenario.margin_threshold
    ).round(4)
    frame["scenario_priority_band"] = frame["scenario_priority_score"].map(
        priority_band
    )
    return frame


def priority_band(score: float) -> str:
    if pd.isna(score):
        return "자료 부족"
    if score >= 1:
        return "추가 사실조사 우선"
    if score >= 0.25:
        return "검토 필요"
    return "낮음"


def summarize_scenarios(risk: pd.DataFrame) -> tuple[list[dict], pd.DataFrame]:
    summaries: list[dict] = []
    detail_frames = []
    for scenario in scenario_grid():
        detail = apply_scenario(risk, scenario)
        detail_frames.append(detail)
        grade_counts = detail["scenario_risk_grade"].value_counts().to_dict()
        priority_counts = detail["scenario_priority_band"].value_counts().to_dict()
        confirmed = detail[detail["confirmed_shortage_named"]]
        confirmed_yellow_or_higher = confirmed[
            confirmed["scenario_risk_grade"].isin(["RED", "ORANGE", "YELLOW"])
        ]
        summaries.append(
            {
                "label": scenario.label,
                "supplyRatio": scenario.supply_ratio,
                "demandGrowth": scenario.demand_growth,
                "attritionRate": scenario.attrition_rate,
                "marginThreshold": scenario.margin_threshold,
                "riskCounts": {
                    "red": int(grade_counts.get("RED", 0)),
                    "orange": int(grade_counts.get("ORANGE", 0)),
                    "yellow": int(grade_counts.get("YELLOW", 0)),
                    "green": int(grade_counts.get("GREEN", 0)),
                    "unknown": int(grade_counts.get("UNKNOWN", 0)),
                },
                "plainLanguage": {
                    "supplyPressure": "예상 본투표자 수가 준비된 투표용지에 얼마나 가까운지",
                    "spareBallots": "시나리오상 남거나 모자랄 수 있는 투표용지 장수",
                    "possibleShortagePlaces": "예상 여유 투표용지가 0장 미만인 투표소 수",
                    "priority": "잠재 영향 인원이 작은 표차와 비교해 추가 조사가 필요한지",
                    "demandGrowthBase": "2022년 송파구 읍면동별 선거일투표자 수를 같은 동 투표소 수로 나눈 proxy",
                    "attritionEffect": "예상 여유 투표용지가 0장 미만인 시나리오에서만 추가 조사 우선순위에 영향을 줌",
                },
                "spareBallots": {
                    "min": round(float(detail["scenario_spare_ballots"].min()), 2),
                    "median": round(float(detail["scenario_spare_ballots"].median()), 2),
                },
                "possibleShortagePlaces": int((detail["scenario_spare_ballots"] < 0).sum()),
                "maxPotentialAffected": round(float(detail["scenario_potential_affected"].max()), 2),
                "maxSupplyPressure": round(float(detail["scenario_supply_pressure"].max()), 4),
                "priorityCounts": {
                    "high": int(priority_counts.get("추가 사실조사 우선", 0)),
                    "review": int(priority_counts.get("검토 필요", 0)),
                    "low": int(priority_counts.get("낮음", 0)),
                    "unknown": int(priority_counts.get("자료 부족", 0)),
                },
                "confirmedShortageCoverage": (
                    round(len(confirmed_yellow_or_higher) / len(confirmed), 4)
                    if len(confirmed)
                    else None
                ),
                "maxPriorityScore": round(float(detail["scenario_priority_score"].max()), 4),
            }
        )
    return summaries, pd.concat(detail_frames, ignore_index=True)
