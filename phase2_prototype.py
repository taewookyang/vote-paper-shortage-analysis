"""
Phase 2: 송파구 샘플 M1~M3 프로토타입.

주의:
- 선관위 API는 투표소별 선거인수를 제공하지 않는다.
- 이 스크립트는 2022년 읍면동 선거일투표 데이터를 같은 읍면동의 투표소 수로
  균등 배분해 만든 설명용 프로토타입이다.
- 정확도 지표는 완전한 backtesting이 아니라 "가능성 점검"으로만 사용한다.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

import pandas as pd

from src.models.baseline import m1_baseline
from src.models.risk_score import m3_risk_score


ROOT = Path(__file__).parent
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

SHORTAGE_CSV = RAW_DIR / "shortage_2026.csv"
POLLING_2022_CSV = PROCESSED_DIR / "songpa_2022_polling_places.csv"
POLLING_2026_CSV = PROCESSED_DIR / "songpa_2026_polling_places.csv"
RESULT_XLSX = RAW_DIR / "중앙선거관리위원회_제8회 전국동시지방선거 개표결과_20220601.xlsx"
RESULT_2026_CSV = RAW_DIR / "songpa_2026_result.csv"


def normalize_polling_name(value: str) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+", "", text)
    text = text.replace("투표소", "투")
    return text


def parse_int(value) -> int:
    if pd.isna(value):
        return 0
    return int(str(value).replace(",", "").strip())


def load_songpa_emd_2026() -> pd.DataFrame:
    """2026 실제 개표결과 CSV에서 동별 선거인수 + 선거일투표수 추출.

    동일 읍면동이 여러 선거구에 걸칠 수 있으므로 구·시·군의회의원선거의
    첫 번째 선거구 기준으로 중복 제거 후 집계한다.
    """
    df = pd.read_csv(RESULT_2026_CSV, dtype=str)
    df = df[df["구시군"] == "송파구"].copy()
    df = df[df["선거명"].str.contains("구·시·군의회의원", na=False)].copy()
    df["선거인수"] = df["선거인수"].map(lambda v: int(str(v).replace(",", "").strip()) if pd.notna(v) and str(v).strip() else 0)
    df["투표수"] = df["투표수"].map(lambda v: int(str(v).replace(",", "").strip()) if pd.notna(v) and str(v).strip() else 0)

    rows = []
    for emd_name, group in df.groupby("읍면동명"):
        if not emd_name or str(emd_name).strip() == "":
            continue
        total = group[group["개표단위"] == "계"]
        vote_day = group[group["개표단위"] == "선거일투표"]
        if total.empty or vote_day.empty:
            continue
        # 동이 여러 선거구에 속할 경우 첫 번째만 사용
        total_voters = int(total.iloc[0]["선거인수"])
        election_day_votes = int(vote_day.iloc[0]["투표수"])
        election_day_eligible = int(vote_day.iloc[0]["선거인수"])
        rows.append({
            "emdName": emd_name,
            "voters_2026": total_voters,
            "election_day_eligible_2026": election_day_eligible,
            "election_day_votes_2026": election_day_votes,
            "election_day_turnout_2026": (
                election_day_votes / election_day_eligible if election_day_eligible else None
            ),
        })
    return pd.DataFrame(rows)


def load_songpa_emd_2022() -> pd.DataFrame:
    df = pd.read_excel(RESULT_XLSX, sheet_name="구·시·군의장", header=None)
    df = df[(df[0] == "서울특별시") & (df[1] == "송파구")].copy()
    df = df[df[3].notna() & df[4].isin(["소계", "선거일투표"])].copy()
    df["선거인수"] = df[5].map(parse_int)
    df["투표수"] = df[6].map(parse_int)

    rows = []
    for emd_name, group in df.groupby(3):
        total = group[group[4] == "소계"]
        vote_day = group[group[4] == "선거일투표"]
        if total.empty or vote_day.empty:
            continue
        total_voters = int(total.iloc[0]["선거인수"])
        election_day_eligible = int(vote_day.iloc[0]["선거인수"])
        election_day_votes = int(vote_day.iloc[0]["투표수"])
        rows.append(
            {
                "emdName": emd_name,
                "voters_2022": total_voters,
                "election_day_eligible_2022": election_day_eligible,
                "election_day_votes_2022": election_day_votes,
                "election_day_turnout_2022": (
                    election_day_votes / election_day_eligible
                    if election_day_eligible
                    else None
                ),
            }
        )
    return pd.DataFrame(rows)


def load_named_songpa_shortages() -> pd.DataFrame:
    shortage = pd.read_csv(SHORTAGE_CSV)
    shortage = shortage[
        (shortage["구시군"] == "송파구")
        & shortage["투표소명"].notna()
        & (shortage["투표소명"].astype(str).str.len() > 0)
    ].copy()
    shortage["normalized_psName"] = shortage["투표소명"].map(normalize_polling_name)
    return shortage


def build_polling_risk() -> tuple[pd.DataFrame, pd.DataFrame]:
    polling_2022 = pd.read_csv(POLLING_2022_CSV)
    polling_source = POLLING_2026_CSV if POLLING_2026_CSV.exists() else POLLING_2022_CSV
    polling = pd.read_csv(polling_source)
    polling["polling_source_year"] = "2026" if polling_source == POLLING_2026_CSV else "2022"
    polling["normalized_psName"] = polling["psName"].map(normalize_polling_name)

    # 수요 측: 2026 실제 개표결과 우선, 없으면 2022 proxy
    if RESULT_2026_CSV.exists():
        emd = load_songpa_emd_2026()
        voters_col = "voters_2026"
        votes_col = "election_day_votes_2026"
        demand_source = "2026_actual"
    else:
        emd = load_songpa_emd_2022()
        voters_col = "voters_2022"
        votes_col = "election_day_votes_2022"
        demand_source = "2022_proxy"

    polling_counts = (
        polling_2022.groupby("emdName")
        .size()
        .reset_index(name="polling_place_count_2022")
    )
    emd = emd.merge(polling_counts, on="emdName", how="left")
    emd["estimated_voters_per_polling_place"] = (
        emd[voters_col] / emd["polling_place_count_2022"]
    )
    emd["estimated_election_day_votes_per_polling_place"] = (
        emd[votes_col] / emd["polling_place_count_2022"]
    )
    emd["demand_source"] = demand_source

    risk = polling.merge(emd, on="emdName", how="left")
    risk["estimated_ballots_m1"] = risk["estimated_voters_per_polling_place"].map(
        lambda value: m1_baseline(int(round(value))) if pd.notna(value) else None
    )
    risk["expected_election_day_votes_m2_proxy"] = risk[
        "estimated_election_day_votes_per_polling_place"
    ]

    shortage = load_named_songpa_shortages()
    risk = risk.merge(
        shortage[
            [
                "normalized_psName",
                "투표소명",
                "실제부족여부",
                "투표중단여부",
                "출처URL",
            ]
        ],
        on="normalized_psName",
        how="left",
    )
    risk["confirmed_shortage_named"] = risk["실제부족여부"].eq(True) | risk[
        "실제부족여부"
    ].astype(str).str.lower().eq("true")

    grades = []
    for row in risk.itertuples(index=False):
        expected = getattr(row, "expected_election_day_votes_m2_proxy")
        ballots = getattr(row, "estimated_ballots_m1")
        if pd.isna(expected) or pd.isna(ballots) or ballots <= 0:
            grades.append({"risk_ratio": None, "risk_grade": "", "is_fact": False})
            continue
        result = m3_risk_score(
            expected,
            int(ballots),
            is_confirmed_shortage=bool(getattr(row, "confirmed_shortage_named")),
        )
        grades.append(
            {
                "risk_ratio": result.risk_ratio,
                "risk_grade": result.grade,
                "is_fact": result.is_fact,
            }
        )
    risk = pd.concat([risk, pd.DataFrame(grades)], axis=1)
    return risk, shortage


def compute_metrics(risk: pd.DataFrame, shortage: pd.DataFrame) -> dict:
    songpa_actual_shortage_total = 14
    named_positive_total = int(shortage["실제부족여부"].astype(str).str.lower().eq("true").sum())
    matched_positive_total = int(risk["confirmed_shortage_named"].sum())

    ranked = risk.sort_values("risk_ratio", ascending=False, na_position="last")
    top_14 = ranked.head(songpa_actual_shortage_total)
    recall_at_14 = (
        int(top_14["confirmed_shortage_named"].sum()) / matched_positive_total
        if matched_positive_total
        else None
    )
    top_20 = ranked.head(20)
    recall_at_20 = (
        int(top_20["confirmed_shortage_named"].sum()) / matched_positive_total
        if matched_positive_total
        else None
    )

    return {
        "scope": "송파구 2026 실제 개표단위 수요 기반 투표소 균등배분 프로토타입 (공급 측 M1 추정)",
        "songpa_actual_shortage_total_official": songpa_actual_shortage_total,
        "named_shortage_rows_in_csv": named_positive_total,
        "matched_named_shortage_rows": matched_positive_total,
        "label_coverage_of_songpa_actual_shortages": round(
            matched_positive_total / songpa_actual_shortage_total, 4
        ),
        "recall_at_14_positive_only": None if recall_at_14 is None else round(recall_at_14, 4),
        "recall_at_20_positive_only": None if recall_at_20 is None else round(recall_at_20, 4),
        "precision": None,
        "recall": None,
        "f1": None,
        "auc_roc": None,
        "why_standard_metrics_are_null": (
            "투표소별 완전한 실제 부족/비부족 라벨과 투표소별 선거인수가 공개되지 않아 "
            "Precision/Recall/F1/AUC는 아직 유효하게 계산하지 않는다."
        ),
    }


def main() -> None:
    risk, shortage = build_polling_risk()

    risk_out = PROCESSED_DIR / "songpa_phase2_risk_prototype.csv"
    match_out = PROCESSED_DIR / "songpa_shortage_matches.csv"
    metrics_out = PROCESSED_DIR / "phase2_metrics.json"

    risk.to_csv(risk_out, index=False, encoding="utf-8-sig")
    risk[risk["confirmed_shortage_named"]].to_csv(
        match_out, index=False, encoding="utf-8-sig"
    )

    metrics = compute_metrics(risk, shortage)
    metrics_out.write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("Phase 2 prototype complete")
    print(f"- risk rows: {len(risk)} -> {risk_out}")
    print(f"- matched named shortage rows: {int(risk['confirmed_shortage_named'].sum())} -> {match_out}")
    print(f"- metrics -> {metrics_out}")
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
