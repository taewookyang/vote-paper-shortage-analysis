"""Join named shortage locations to council districts and boundary margins."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
PUBLIC = ROOT / "dashboard" / "public" / "data"


def bool_value(value: object) -> bool | None:
    text = str(value).strip().lower()
    return True if text == "true" else False if text == "false" else None


def evidence(row: pd.Series) -> str:
    if row["투표중단확인"] is True:
        return "실제중단확인"
    if row["실제부족확인"] is True:
        return "실제부족확인"
    return "추가송부확인"


def review_grade(row: pd.Series) -> str:
    margin = row["표차"]
    if pd.isna(margin):
        return "자료확인필요"
    if row["증거수준"] == "실제중단확인" and margin <= 500:
        return "최우선확인"
    if margin <= 500:
        return "우선조사"
    if margin <= 1000:
        return "검토"
    return "참고"


def normalize_dong(value: object) -> str:
    text = str(value).strip()
    for number in range(1, 10):
        text = text.replace(f"제{number}동", f"{number}동")
    return text


def main() -> None:
    shortage = pd.read_csv(RAW / "shortage_2026.csv")
    mapping = pd.read_csv(RAW / "district_dong_mapping_2026.csv")
    margins = pd.read_csv(PROCESSED / "targeted_margin_screening_2026.csv")

    named = shortage[shortage["투표소명"].notna()].copy()
    named["실제부족확인"] = named["실제부족여부"].map(bool_value)
    named["투표중단확인"] = named["투표중단여부"].map(bool_value)
    named["증거수준"] = named.apply(evidence, axis=1)
    named["읍면동_정규화"] = named["읍면동"].map(normalize_dong)
    mapping["읍면동_정규화"] = mapping["읍면동"].map(normalize_dong)
    mapping = mapping[mapping["읍면동"].ne("무투표선거구입니다.")].copy()

    joined = named.merge(
        mapping,
        on=["구시군", "읍면동_정규화"],
        how="left",
        suffixes=("", "_매핑"),
        validate="many_to_many",
    )
    joined = joined.merge(
        margins[[
            "구시군", "선거종류", "선거구코드", "선거구명", "경계당선자",
            "첫낙선자", "당선권경계표차", "출처URL",
        ]],
        on=["구시군", "선거종류", "선거구코드", "선거구명"],
        how="left",
        suffixes=("", "_결과"),
        validate="many_to_one",
    )
    joined = joined.rename(columns={
        "경계당선자": "당선자",
        "첫낙선자": "낙선자",
        "당선권경계표차": "표차",
        "출처URL": "위치출처URL",
        "출처URL_결과": "결과출처URL",
    })
    joined["검토등급"] = joined.apply(review_grade, axis=1)
    joined["해석제한"] = "표차가 작다는 사실만으로 투표용지 부족이 선거 결과에 영향을 미쳤다고 단정할 수 없음"
    columns = [
        "시도", "구시군", "읍면동", "투표소명", "증거수준", "실제부족확인", "투표중단확인",
        "선거종류", "선거구코드", "선거구명", "당선자", "낙선자", "표차", "검토등급",
        "위치출처URL", "결과출처URL", "해석제한",
    ]
    joined["_검토순서"] = joined["검토등급"].map({
        "최우선확인": 0,
        "우선조사": 1,
        "검토": 2,
        "참고": 3,
        "자료확인필요": 4,
    })
    result = joined.sort_values(
        ["_검토순서", "표차", "구시군", "읍면동", "투표소명", "선거종류"],
        na_position="last",
    )[columns]
    csv_path = PROCESSED / "known_location_margin_mapping_2026.csv"
    result.to_csv(csv_path, index=False, encoding="utf-8-sig")

    payload = {
        "meta": {
            "description": "이름이 공개된 실제 부족·중단 투표소의 광역·기초의원 선거구 및 표차 매핑",
            "disclaimer": "표차가 작다는 사실만으로 결과 영향을 단정할 수 없음",
            "namedPollingPlaces": int(named["투표소명"].nunique()),
            "mappedRows": int(result["선거구코드"].notna().sum()),
            "generated": pd.Timestamp.now().isoformat(),
        },
        "items": result.where(pd.notna(result), None).to_dict(orient="records"),
    }
    for directory in [PROCESSED / "dashboard", PUBLIC]:
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "known_location_margin_mapping_2026.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    print(f"{csv_path.relative_to(ROOT)}: {len(result)} rows, {result['선거구코드'].notna().sum()} mapped")


if __name__ == "__main__":
    main()
