"""M1: 선관위 지침 기준선 모델"""
import math


def m1_baseline(선거인수: int) -> int:
    """
    선관위 내부 지침 그대로 재현.
    출처: 중앙선관위 2026.6.5. 브리핑
    """
    raw = 선거인수 * 0.50
    return math.floor(raw / 100) * 100  # 100매 미만 절삭
