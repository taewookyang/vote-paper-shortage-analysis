"""Analyze exact duplicate candidate vote vectors in collected vote-pattern data."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
PUBLIC = ROOT / "dashboard" / "public" / "data"


def n(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series.astype(str).str.replace(",", "", regex=False), errors="coerce")


def vector_frame(frame: pd.DataFrame, unit: str) -> pd.DataFrame:
    use = frame[frame["개표단위"].eq(unit) & frame["읍면동명"].notna() & frame["읍면동명"].ne("")].copy()
    use["정당명"] = use["정당명"].fillna("").astype(str).replace("nan", "")
    use["후보명"] = use["후보명"].fillna("").astype(str).replace("nan", "")
    use["후보별득표수"] = n(use["후보별득표수"]).fillna(-1).astype(int)
    use["투표수"] = n(use["투표수"]).fillna(0).astype(int)
    rows = []
    keys = ["시도", "구시군", "선거종류", "선거코드", "읍면동명", "개표단위"]
    for key, group in use.groupby(keys):
        ordered = group.sort_values(["정당명", "후보명"])
        rows.append({
            **dict(zip(keys, key)),
            "투표수": int(ordered["투표수"].iloc[0]),
            "후보목록": " | ".join(" ".join(part for part in [p, c] if part) for p, c in zip(ordered["정당명"], ordered["후보명"])),
            "득표벡터": " | ".join(map(str, ordered["후보별득표수"])),
            "주요2후보벡터": " | ".join(map(str, ordered.sort_values("후보별득표수", ascending=False)["후보별득표수"].head(2))),
        })
    return pd.DataFrame(rows)


def exact_matches(vectors: pd.DataFrame, vector_col: str, label: str) -> pd.DataFrame:
    rows = []
    group_cols = ["시도", "선거종류", "선거코드", vector_col]
    for key, group in vectors.groupby(group_cols):
        if len(group) < 2:
            continue
        # Keep exact repeats across different town/dong combinations. Same town repeats are also useful.
        ordered = group.sort_values(["구시군", "읍면동명"])
        rows.append({
            "패턴유형": label,
            "시도": key[0],
            "선거종류": key[1],
            "선거코드": key[2],
            "개표단위": ordered["개표단위"].iloc[0],
            "반복지역수": int(len(ordered)),
            "구시군_읍면동": " / ".join(f"{r.구시군} {r.읍면동명}" for r in ordered.itertuples()),
            "투표수목록": " / ".join(map(str, ordered["투표수"])),
            "후보목록": ordered["후보목록"].iloc[0],
            "득표벡터": key[3],
            "해석제한": "동일 득표 패턴은 이례성 탐색 지표일 뿐 오류나 부정의 증거가 아님",
        })
    return pd.DataFrame(rows)


def article_checks(vectors: pd.DataFrame) -> list[dict]:
    checks = [
        {
            "name": "연수구 송도1동-송도2동 인천시장 관내사전 주요2후보",
            "city": "인천광역시", "townA": "연수구", "dongA": "송도1동", "townB": "연수구", "dongB": "송도2동",
            "expected": "3030 | 1440",
        },
        {
            "name": "신안군 하의면-여수시 상일동 전남 광역단체장 관내사전 주요2후보",
            "city": "전라남도", "townA": "신안군", "dongA": "하의면", "townB": "여수시", "dongB": "삼일동",
            "reportedDongB": "상일동",
            "expected": "506 | 42",
            "note": "기사에는 여수시 상일동으로 표기되어 있으나, 선관위 원자료에서 506 | 42와 대응되는 관내사전투표 읍면동은 여수시 삼일동으로 확인됨",
        },
        {
            "name": "함평군 엄다면-장성군 북하면 전남 광역단체장 관내사전 주요2후보",
            "city": "전라남도", "townA": "함평군", "dongA": "엄다면", "townB": "장성군", "dongB": "북하면",
            "expected": "606 | 57",
        },
        {
            "name": "보성군 노동면-신안군 팔금면 전남 광역단체장 관내사전 주요2후보",
            "city": "전라남도", "townA": "보성군", "dongA": "노동면", "townB": "신안군", "dongB": "팔금면",
            "expected": "356 | 42",
        },
        {
            "name": "광주 광산구 송정1동-전남 고흥군 금산면 기사 주장",
            "cityA": "광주광역시", "townA": "광산구", "dongA": "송정1동",
            "cityB": "전라남도", "townB": "고흥군", "dongB": "금산면",
            "expected": "1401 | 120",
            "note": "기사 표현은 광주광역시와 전라남도 사례를 같은 후보명으로 묶고 있어, 같은 선거·같은 후보 벡터 비교로 단정할 수 없음",
        },
    ]
    out = []
    for check in checks:
        city_a = check.get("cityA", check.get("city"))
        city_b = check.get("cityB", check.get("city"))
        a = vectors[
            vectors["시도"].eq(city_a) & vectors["구시군"].eq(check["townA"]) & vectors["읍면동명"].eq(check["dongA"])
        ]
        b = vectors[
            vectors["시도"].eq(city_b) & vectors["구시군"].eq(check["townB"]) & vectors["읍면동명"].eq(check["dongB"])
        ]
        vec_a = a["주요2후보벡터"].iloc[0] if not a.empty else None
        vec_b = b["주요2후보벡터"].iloc[0] if not b.empty else None
        candidates_a = a["후보목록"].iloc[0] if not a.empty else None
        candidates_b = b["후보목록"].iloc[0] if not b.empty else None
        out.append({
            **check,
            "observedA": vec_a,
            "observedB": vec_b,
            "candidatesA": candidates_a,
            "candidatesB": candidates_b,
            "matchesEachOther": bool(vec_a and vec_b and vec_a == vec_b),
            "matchesArticleExpected": bool(
                vec_a == check["expected"]
                and vec_b == check["expected"]
                and candidates_a == candidates_b
            ),
        })
    return out


def main() -> None:
    scope = os.environ.get("SCOPE", "pilot")
    input_path = RAW / f"vote_pattern_results_2026_{scope}.csv"
    frame = pd.read_csv(input_path)
    vectors = vector_frame(frame, "관내사전투표")
    full = exact_matches(vectors, "득표벡터", "전체후보득표벡터동일")
    top2 = exact_matches(vectors, "주요2후보벡터", "주요2후보득표벡터동일")
    combined = pd.concat([full, top2], ignore_index=True, sort=False)

    out_csv = PROCESSED / f"vote_pattern_duplicates_2026_{scope}.csv"
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(out_csv, index=False, encoding="utf-8-sig")
    payload = {
        "description": "후보별 관내사전투표 득표 동일 패턴 탐색",
        "scope": scope,
        "input": str(input_path.relative_to(ROOT)),
        "unit": "관내사전투표",
        "disclaimer": "동일 득표 패턴은 이례성 탐색 지표일 뿐 오류나 부정의 증거가 아님",
        "rowsAnalyzed": int(len(frame)),
        "vectorRows": int(len(vectors)),
        "fullVectorMatches": int(len(full)),
        "top2VectorMatches": int(len(top2)),
        "articleChecks": article_checks(vectors) if scope == "pilot" else [],
        "items": combined.where(pd.notna(combined), None).to_dict(orient="records"),
    }
    for directory in [PROCESSED / "dashboard", PUBLIC]:
        directory.mkdir(parents=True, exist_ok=True)
        (directory / f"vote_pattern_duplicates_2026_{scope}.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    print(f"{out_csv.relative_to(ROOT)}: full={len(full)}, top2={len(top2)}, vectors={len(vectors)}")


if __name__ == "__main__":
    main()
