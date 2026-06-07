"""Explore duplicate vote patterns in Songpa council result data.

This is an anomaly-screening helper, not an error or fraud detector.
It works only at the published aggregation level:
election district × dong × counting unit × candidate.
"""
from __future__ import annotations

import json
from itertools import combinations
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
PUBLIC = ROOT / "dashboard" / "public" / "data"
INPUT = RAW / "songpa_2026_result.csv"

COUNTING_UNITS = ["관내사전투표", "선거일투표", "관외사전투표", "거소투표"]
MIN_VOTES_FOR_SINGLE_CANDIDATE_MATCH = 100


def numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(
        series.astype(str).str.replace(",", "", regex=False),
        errors="coerce",
    )


def candidate_order(frame: pd.DataFrame) -> pd.DataFrame:
    return frame.sort_values(["선거구코드", "정당명", "후보명"]).copy()


def build_vectors(frame: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for key, group in frame.groupby(["선거구코드", "선거구명", "읍면동명", "개표단위"], dropna=False):
        ordered = candidate_order(group)
        votes = tuple(int(value) for value in ordered["후보별득표수"])
        candidates = tuple(
            f"{party} {name}" for party, name in zip(ordered["정당명"], ordered["후보명"])
        )
        total = int(ordered["투표수"].iloc[0])
        rows.append({
            "선거구코드": key[0],
            "선거구명": key[1],
            "읍면동명": key[2],
            "개표단위": key[3],
            "투표수": total,
            "후보목록": " | ".join(candidates),
            "득표벡터": " | ".join(map(str, votes)),
            "득표벡터_tuple": votes,
        })
    return pd.DataFrame(rows)


def exact_vector_matches(vectors: pd.DataFrame) -> pd.DataFrame:
    rows = []
    grouped = vectors.groupby(["선거구코드", "선거구명", "개표단위", "득표벡터"], dropna=False)
    for (code, district, unit, vector), group in grouped:
        if len(group) < 2:
            continue
        dongs = group.sort_values("읍면동명")
        rows.append({
            "패턴유형": "전체후보득표동일",
            "선거구코드": code,
            "선거구명": district,
            "개표단위": unit,
            "읍면동목록": ", ".join(dongs["읍면동명"]),
            "투표수목록": ", ".join(map(str, dongs["투표수"])),
            "후보목록": dongs["후보목록"].iloc[0],
            "득표벡터": vector,
            "해석제한": "동일 득표는 이례성 탐색 지표일 뿐 오류나 부정의 증거가 아님",
        })
    return pd.DataFrame(rows)


def single_candidate_matches(frame: pd.DataFrame) -> pd.DataFrame:
    rows = []
    grouped = frame.groupby(["선거구코드", "선거구명", "개표단위", "정당명", "후보명", "후보별득표수"], dropna=False)
    for (code, district, unit, party, candidate, votes), group in grouped:
        if votes < MIN_VOTES_FOR_SINGLE_CANDIDATE_MATCH or len(group) < 2:
            continue
        dongs = sorted(group["읍면동명"].dropna().unique())
        if len(dongs) < 2:
            continue
        rows.append({
            "패턴유형": "단일후보득표동일",
            "선거구코드": code,
            "선거구명": district,
            "개표단위": unit,
            "정당명": party,
            "후보명": candidate,
            "동일득표수": int(votes),
            "읍면동목록": ", ".join(dongs),
            "해석제한": "단일 후보의 같은 득표수 반복은 우연히 발생할 수 있으며 오류나 부정의 증거가 아님",
        })
    return pd.DataFrame(rows)


def near_ratio_pairs(vectors: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (code, district, unit), group in vectors.groupby(["선거구코드", "선거구명", "개표단위"]):
        usable = group[group["투표수"] > 0].copy()
        for _, left in usable.iterrows():
            for _, right in usable[usable["읍면동명"] > left["읍면동명"]].iterrows():
                left_vec = pd.Series(left["득표벡터_tuple"], dtype=float) / left["투표수"]
                right_vec = pd.Series(right["득표벡터_tuple"], dtype=float) / right["투표수"]
                max_gap = float((left_vec - right_vec).abs().max())
                if max_gap <= 0.0025 and left["득표벡터_tuple"] != right["득표벡터_tuple"]:
                    rows.append({
                        "패턴유형": "후보득표율매우유사",
                        "선거구코드": code,
                        "선거구명": district,
                        "개표단위": unit,
                        "읍면동A": left["읍면동명"],
                        "읍면동B": right["읍면동명"],
                        "투표수A": int(left["투표수"]),
                        "투표수B": int(right["투표수"]),
                        "최대후보득표율차": round(max_gap, 5),
                        "해석제한": "비율 유사도는 추가 검토 후보일 뿐 오류나 부정의 증거가 아님",
                    })
    return pd.DataFrame(rows)


def write_csv(path: Path, frame: pd.DataFrame) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False, encoding="utf-8-sig")


def main() -> None:
    frame = pd.read_csv(INPUT)
    frame = frame[frame["개표단위"].isin(COUNTING_UNITS) & frame["읍면동명"].notna()].copy()
    frame["후보별득표수"] = numeric(frame["후보별득표수"]).fillna(-1).astype(int)
    frame["투표수"] = numeric(frame["투표수"]).fillna(0).astype(int)

    vectors = build_vectors(frame)
    exact = exact_vector_matches(vectors)
    single = single_candidate_matches(frame)
    near = near_ratio_pairs(vectors)

    output_csv = PROCESSED / "songpa_vote_pattern_duplicates_2026.csv"
    output_columns = [
        "패턴유형", "선거구코드", "선거구명", "개표단위", "읍면동목록", "투표수목록",
        "후보목록", "득표벡터", "정당명", "후보명", "동일득표수", "읍면동A", "읍면동B",
        "투표수A", "투표수B", "최대후보득표율차", "해석제한",
    ]
    combined = pd.concat([exact, single, near], ignore_index=True, sort=False)
    combined = combined.reindex(columns=output_columns)
    write_csv(output_csv, combined)

    summary = {
        "description": "송파구 구의원 선거 후보별 득표 동일·유사 패턴 탐색",
        "scope": "송파구 구의원 선거, 선거구×읍면동×개표단위 공개 집계",
        "unitLimit": "투표소별 후보 득표는 공개자료에 없어 분석하지 않음",
        "disclaimer": "동일·유사 패턴은 이례성 탐색 지표일 뿐 오류나 부정의 증거가 아님",
        "input": str(INPUT.relative_to(ROOT)),
        "districts": int(frame["선거구명"].nunique()),
        "dongs": int(frame["읍면동명"].nunique()),
        "countingUnits": sorted(frame["개표단위"].unique()),
        "rowsAnalyzed": int(len(frame)),
        "exactVectorMatches": int(len(exact)),
        "singleCandidateMatches": int(len(single)),
        "nearRatioPairs": int(len(near)),
        "items": combined.where(pd.notna(combined), None).to_dict(orient="records"),
    }
    for directory in [PROCESSED / "dashboard", PUBLIC]:
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "songpa_vote_pattern_duplicates_2026.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    md = PROCESSED / "songpa_vote_pattern_duplicates_2026.md"
    md.write_text(
        "\n".join([
            "# 송파구 후보 득표 동일 패턴 탐색",
            "",
            f"- 분석 범위: {summary['scope']}",
            f"- 한계: {summary['unitLimit']}",
            f"- 전체 후보별 행: {summary['rowsAnalyzed']}",
            f"- 전체 후보 득표 벡터 동일: {summary['exactVectorMatches']}건",
            f"- 단일 후보 득표 동일: {summary['singleCandidateMatches']}건",
            f"- 후보 득표율 매우 유사 쌍: {summary['nearRatioPairs']}건",
            "",
            "동일·유사 패턴은 오류나 부정의 증거가 아니다. 실제 개표록, 집계표, 전산 입력 기록 대조가 필요하다.",
        ]),
        encoding="utf-8",
    )
    print(
        f"{output_csv.relative_to(ROOT)}: exact={len(exact)}, "
        f"single={len(single)}, near_ratio={len(near)}"
    )


if __name__ == "__main__":
    main()
