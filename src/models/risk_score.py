"""M3: 위험도 스코어링"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class RiskResult:
    risk_ratio: float
    grade: str
    is_fact: bool
    confidence_interval: Optional[tuple]
    disclaimer: str


def m3_risk_score(예상_본투표수: float, 배부량_추정: int,
                  ci_lower: float = None, ci_upper: float = None,
                  is_confirmed_shortage: bool = False) -> RiskResult:
    """
    위험도 = 예상_본투표수 / 배부량_추정
    RED만 사실, 나머지 전부 추정.
    """
    if 배부량_추정 <= 0:
        raise ValueError("배부량_추정은 0보다 커야 합니다.")

    ratio = 예상_본투표수 / 배부량_추정

    if is_confirmed_shortage:
        grade = "RED"
        is_fact = True
    elif ratio > 1.1:
        grade = "ORANGE"
        is_fact = False
    elif ratio >= 0.9:
        grade = "YELLOW"
        is_fact = False
    else:
        grade = "GREEN"
        is_fact = False

    ci = (ci_lower, ci_upper) if ci_lower is not None else None

    return RiskResult(
        risk_ratio=round(ratio, 4),
        grade=grade,
        is_fact=is_fact,
        confidence_interval=ci,
        disclaimer="추정값. 실제 배부량은 선관위 미공개.",
    )
