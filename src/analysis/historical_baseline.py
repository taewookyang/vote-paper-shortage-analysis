"""Historical local-election baseline for Songpa district."""
from __future__ import annotations

import math
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"

ELECTION_FILES = {
    2018: RAW_DIR / "중앙선거관리위원회_제7회 전국동시지방선거 개표결과_20180613.xlsx",
    2022: RAW_DIR / "중앙선거관리위원회_제8회 전국동시지방선거 개표결과_20220601.xlsx",
}


def parse_int(value) -> int:
    if pd.isna(value):
        return 0
    return int(str(value).replace(",", "").strip())


def baseline_ballots(voters: float, supply_ratio: float = 0.5) -> int:
    return math.floor((float(voters) * supply_ratio) / 100) * 100


def load_songpa_emd_year(year: int) -> pd.DataFrame:
    path = ELECTION_FILES[year]
    raw = pd.read_excel(path, sheet_name="구·시·군의장", header=None)

    if year == 2018:
        sd_col, wiw_col, emd_col, type_col, voters_col, votes_col = 3, 4, 5, 6, 7, 8
    elif year == 2022:
        sd_col, wiw_col, emd_col, type_col, voters_col, votes_col = 0, 1, 3, 4, 5, 6
    else:
        raise ValueError(f"Unsupported election year: {year}")

    df = raw[(raw[sd_col] == "서울특별시") & (raw[wiw_col] == "송파구")].copy()
    df = df[df[emd_col].notna() & df[type_col].isin(["소계", "선거일투표"])].copy()
    df["voters"] = df[voters_col].map(parse_int)
    df["votes"] = df[votes_col].map(parse_int)

    rows = []
    for emd_name, group in df.groupby(emd_col):
        total = group[group[type_col] == "소계"]
        vote_day = group[group[type_col] == "선거일투표"]
        if total.empty or vote_day.empty:
            continue
        total_voters = int(total.iloc[0]["voters"])
        election_day_eligible = int(vote_day.iloc[0]["voters"])
        election_day_votes = int(vote_day.iloc[0]["votes"])
        ballots_50 = baseline_ballots(total_voters, 0.5)
        rows.append(
            {
                "year": year,
                "emdName": emd_name,
                "voters": total_voters,
                "electionDayEligible": election_day_eligible,
                "electionDayVotes": election_day_votes,
                "electionDayDemandRatio": (
                    election_day_votes / total_voters if total_voters else None
                ),
                "ballotsAt50": ballots_50,
                "marginAt50": ballots_50 - election_day_votes,
                "riskRatioAt50": (
                    election_day_votes / ballots_50 if ballots_50 else None
                ),
            }
        )
    return pd.DataFrame(rows)


def build_songpa_historical_baseline() -> tuple[pd.DataFrame, pd.DataFrame]:
    history = pd.concat(
        [load_songpa_emd_year(year) for year in ELECTION_FILES], ignore_index=True
    )

    summary = (
        history.groupby("emdName")
        .agg(
            years=("year", "count"),
            avgDemandRatio=("electionDayDemandRatio", "mean"),
            maxDemandRatio=("electionDayDemandRatio", "max"),
            minMarginAt50=("marginAt50", "min"),
            maxRiskRatioAt50=("riskRatioAt50", "max"),
            avgElectionDayVotes=("electionDayVotes", "mean"),
            avgVoters=("voters", "mean"),
        )
        .reset_index()
    )
    for column in [
        "avgDemandRatio",
        "maxDemandRatio",
        "maxRiskRatioAt50",
        "avgElectionDayVotes",
        "avgVoters",
    ]:
        summary[column] = summary[column].round(4)
    summary["baselineBand"] = summary["maxRiskRatioAt50"].map(classify_baseline)
    return history, summary


def classify_baseline(risk_ratio: float) -> str:
    if pd.isna(risk_ratio):
        return "자료 부족"
    if risk_ratio >= 1:
        return "과거 기준 초과"
    if risk_ratio >= 0.9:
        return "여유폭 작음"
    return "여유 있음"
