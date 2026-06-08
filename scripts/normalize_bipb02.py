"""
BIPB02 선거인명부 확정상황 정규화
raw HTML 병합 셀 → 투표구별 선거인수 정규화 테이블

입력: data/raw/nec_voter_roll_2026_national.csv (49,183행)
출력:
  data/processed/bipb02_normalized.csv  — 정규화 결과
  data/processed/bipb02_validation.json — 검증 리포트
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_FILE = ROOT / "data/raw/nec_voter_roll_2026_national.csv"
OUT_CSV = ROOT / "data/processed/bipb02_normalized.csv"
OUT_VAL = ROOT / "data/processed/bipb02_validation.json"
POLLING_FILE = ROOT / "data/raw/nec_polling_places_2026_national.csv"


# ---------------------------------------------------------------------------
# 파싱 헬퍼
# ---------------------------------------------------------------------------

_NUM_RE = re.compile(r"^([\d,]+)\s*(?:\(\s*(\d+)\s*,\s*(\d+)\s*\))?$")


def parse_number(text):
    """'9,547 (451 , 186)' → (9547, 451, 186). 파싱 불가 시 (None, None, None)."""
    if not text or str(text).strip() in ("", "-"):
        return None, None, None
    t = str(text).strip().replace("\xa0", "")
    m = _NUM_RE.match(t)
    if m:
        main = int(m.group(1).replace(",", ""))
        overseas = int(m.group(2)) if m.group(2) else 0
        foreign = int(m.group(3)) if m.group(3) else 0
        return main, overseas, foreign
    return None, None, None


def parse_rate(text):
    if not text or str(text).strip() in ("", "-"):
        return None
    try:
        return float(str(text).strip())
    except ValueError:
        return None


def safe_str(val):
    return "" if pd.isna(val) else str(val).strip()


# ---------------------------------------------------------------------------
# 행 유형 판별
# ---------------------------------------------------------------------------

def classify_row(c0, c1):
    """
    cell_count=8인 '계' 행의 유형 반환.
    반환값: '합계' | '소계' | '읍면동' | '투표구'
    """
    if c0 == "소계":
        return "소계"
    if c0 not in ("", "남", "여", "계"):
        return "읍면동"
    # cell_0이 빈칸: 합계(구시군 전체) 또는 투표구
    try:
        n = int(str(c1).replace(",", "").strip())
    except ValueError:
        return "합계"
    return "투표구" if n == 1 else "합계"


# ---------------------------------------------------------------------------
# 메인 정규화
# ---------------------------------------------------------------------------

def normalize(df_raw: pd.DataFrame):
    rows = []
    errors = []

    for (sido_code, gugu_code, election_code), grp in df_raw.groupby(
        ["시도코드", "구시군코드", "선거코드"], sort=False
    ):
        sido = grp["시도"].iloc[0]
        gugu = grp["구시군"].iloc[0]
        election_type = grp["선거종류"].iloc[0]

        grp = grp.assign(_row_idx_int=grp["row_index"].astype(int)).sort_values("_row_idx_int").drop(columns="_row_idx_int").reset_index(drop=True)

        current_dong = None
        dong_precinct_counter = 0
        sogyue_idx = 0
        parent = {}  # 계 행 컨텍스트 → 남/여 행에 상속

        for _, row in grp.iterrows():
            try:
                cell_count = int(row["cell_count"])
            except Exception:
                continue

            src_idx = int(row["row_index"])
            cells = [safe_str(row.get(f"cell_{j}")) for j in range(8)]

            base = dict(
                시도코드=sido_code, 시도=sido,
                구시군코드=gugu_code, 구시군=gugu,
                선거코드=election_code, 선거종류=election_type,
                source_row_index=src_idx,
            )

            if cell_count == 8:
                # '계' 행
                c0, c1 = cells[0], cells[1]
                rtype = classify_row(c0, c1)

                if rtype == "소계":
                    sogyue_idx += 1
                    current_dong = None
                    dong_precinct_counter = 0
                    dong_name = f"소계{sogyue_idx}"
                    precinct_label = "소계"
                    precinct_seq = None
                elif rtype == "읍면동":
                    current_dong = c0
                    dong_precinct_counter = 0
                    dong_name = current_dong
                    precinct_label = "읍면동합계"
                    precinct_seq = None
                elif rtype == "투표구":
                    dong_precinct_counter += 1
                    dong_name = current_dong
                    precinct_label = f"제{dong_precinct_counter}투"
                    precinct_seq = dong_precinct_counter
                else:  # 합계
                    dong_name = None
                    precinct_label = "합계"
                    precinct_seq = None

                인구수, 인구_재외, 인구_외국 = parse_number(cells[2])
                선거인수, 선거인_재외, 선거인_외국 = parse_number(cells[4])
                거소, 거소_재외, _ = parse_number(cells[5])
                비율 = parse_rate(cells[6])
                세대수, 세대_재외, 세대_외국 = parse_number(cells[7])

                try:
                    투표구수 = int(str(c1).replace(",", "").strip())
                except ValueError:
                    투표구수 = None

                # 조인 키: 소계 인덱스를 포함해 같은 동이 두 선거구에 걸쳐도 고유하게
                join_key = (
                    f"{gugu_code}_s{sogyue_idx}_{current_dong}_{dong_precinct_counter}"
                    if rtype == "투표구" and current_dong
                    else None
                )
                ps_name_key = (
                    f"{current_dong}제{dong_precinct_counter}투"
                    if rtype == "투표구" and current_dong
                    else None
                )

                parent = dict(
                    row_type=rtype, 읍면동명=dong_name,
                    투표구번호=precinct_label, 투표구순서=precinct_seq,
                    인구수=인구수, 인구수_재외국민=인구_재외, 인구수_외국인=인구_외국,
                    선거인수비율=비율,
                    세대수=세대수, 세대수_재외국민=세대_재외, 세대수_외국인=세대_외국,
                    투표구수=투표구수, join_key=join_key, ps_name_key=ps_name_key,
                )

                rows.append({
                    **base, **parent,
                    "성별": "계",
                    "확정선거인수": 선거인수,
                    "확정선거인수_재외국민": 선거인_재외,
                    "확정선거인수_외국인": 선거인_외국,
                    "거소투표신고인수": 거소,
                    "거소투표신고인수_재외국민": 거소_재외,
                })

            elif cell_count == 3:
                # 남/여 행
                c0 = cells[0]
                if c0 not in ("남", "여"):
                    continue
                선거인수, 선거인_재외, 선거인_외국 = parse_number(cells[1])
                거소, 거소_재외, _ = parse_number(cells[2])

                rows.append({
                    **base,
                    "row_type": parent.get("row_type", ""),
                    "읍면동명": parent.get("읍면동명"),
                    "투표구번호": parent.get("투표구번호"),
                    "투표구순서": parent.get("투표구순서"),
                    "성별": c0,
                    "인구수": parent.get("인구수"),
                    "인구수_재외국민": parent.get("인구수_재외국민"),
                    "인구수_외국인": parent.get("인구수_외국인"),
                    "확정선거인수": 선거인수,
                    "확정선거인수_재외국민": 선거인_재외,
                    "확정선거인수_외국인": 선거인_외국,
                    "거소투표신고인수": 거소,
                    "거소투표신고인수_재외국민": 거소_재외,
                    "선거인수비율": parent.get("선거인수비율"),
                    "세대수": parent.get("세대수"),
                    "세대수_재외국민": parent.get("세대수_재외국민"),
                    "세대수_외국인": parent.get("세대수_외국인"),
                    "투표구수": parent.get("투표구수"),
                    "join_key": parent.get("join_key"),
                    "ps_name_key": parent.get("ps_name_key"),
                })
            else:
                errors.append({
                    "구시군": gugu, "선거코드": election_code,
                    "row_index": src_idx, "cell_count": cell_count,
                    "note": "예상치 못한 cell_count",
                })

    return pd.DataFrame(rows), errors


# ---------------------------------------------------------------------------
# 검증
# ---------------------------------------------------------------------------

def validate(df_norm: pd.DataFrame, df_polling: pd.DataFrame):
    report = {"passed": [], "warnings": [], "errors": []}

    # 1. 전국 구시군 수 확인
    gugu_count = df_norm["구시군코드"].nunique()
    # 세종·제주는 기초의원 선거 없어 BIPB02 0행 → 253이 정상
    if gugu_count >= 253:
        report["passed"].append(f"전국 구시군 수: {gugu_count}개 ✓ (세종·제주 기초의원 제외)")
    else:
        report["warnings"].append(f"전국 구시군 수: {gugu_count}개 (기대 ≥253)")

    # 2. 투표구 행만 필터 (계 행)
    df_prec = df_norm[(df_norm["row_type"] == "투표구") & (df_norm["성별"] == "계")]

    # 3. 선거인수 null 비율
    null_rate = df_prec["확정선거인수"].isna().mean()
    if null_rate < 0.01:
        report["passed"].append(f"투표구 선거인수 null 비율: {null_rate:.2%} ✓")
    else:
        report["warnings"].append(f"투표구 선거인수 null 비율: {null_rate:.2%}")

    # 4. join_key 생성률
    key_rate = df_prec["ps_name_key"].notna().mean()
    if key_rate > 0.99:
        report["passed"].append(f"ps_name_key 생성률: {key_rate:.2%} ✓")
    else:
        report["warnings"].append(f"ps_name_key 생성률: {key_rate:.2%}")

    # 5. 투표소 목록과 매칭률 (이름 기반)
    if df_polling is not None and "psName" in df_polling.columns:
        bipb02_keys = set(df_prec["ps_name_key"].dropna())
        polling_keys = set(df_polling["psName"].str.replace(" ", ""))
        matched = bipb02_keys & polling_keys
        match_rate = len(matched) / len(bipb02_keys) if bipb02_keys else 0
        report["passed" if match_rate > 0.9 else "warnings"].append(
            f"투표소 목록 이름 매칭률: {match_rate:.2%} "
            f"({len(matched)}/{len(bipb02_keys)})"
        )
        unmatched = list(bipb02_keys - polling_keys)[:20]
        if unmatched:
            report["warnings"].append(
                f"미매칭 BIPB02 키 샘플(최대20): {unmatched}"
            )

    # 6. 구시군별 투표구 수 대조
    mismatch_gugun = []
    if df_polling is not None:
        polling_cnt = (
            df_polling.groupby("구시군코드")["psName"].count().rename("polling_cnt")
        )
        bipb02_cnt = (
            df_prec.groupby("구시군코드")["투표구번호"].count().rename("bipb02_cnt")
        )
        cmp = pd.concat([polling_cnt, bipb02_cnt], axis=1).dropna()
        mismatches = cmp[cmp["polling_cnt"] != cmp["bipb02_cnt"]]
        if mismatches.empty:
            report["passed"].append("구시군별 투표구 수 일치 ✓")
        else:
            for code, r in mismatches.iterrows():
                mismatch_gugun.append({
                    "구시군코드": code,
                    "투표소목록": int(r["polling_cnt"]),
                    "BIPB02": int(r["bipb02_cnt"]),
                })
            report["warnings"].append(
                f"투표구 수 불일치 구시군: {len(mismatch_gugun)}개"
            )
            report["mismatch_detail"] = mismatch_gugun

    # 7. 남+여 = 계 검증 (샘플링)
    df_계 = df_norm[df_norm["성별"] == "계"][["join_key", "확정선거인수"]].dropna()
    df_남 = df_norm[df_norm["성별"] == "남"][["join_key", "확정선거인수"]].dropna()
    df_여 = df_norm[df_norm["성별"] == "여"][["join_key", "확정선거인수"]].dropna()
    merged = df_계.merge(
        df_남.rename(columns={"확정선거인수": "남"}), on="join_key", how="inner"
    ).merge(df_여.rename(columns={"확정선거인수": "여"}), on="join_key", how="inner")
    if not merged.empty:
        merged["sum_남여"] = merged["남"] + merged["여"]
        bad = merged[merged["확정선거인수"] != merged["sum_남여"]]
        if bad.empty:
            report["passed"].append("남+여=계 선거인수 일치 ✓")
        else:
            report["errors"].append(
                f"남+여≠계 불일치: {len(bad)}행, 샘플: {bad.head(3).to_dict('records')}"
            )

    return report


# ---------------------------------------------------------------------------
# 실행
# ---------------------------------------------------------------------------

def main():
    print(f"[1/4] 원자료 로드: {RAW_FILE}")
    df_raw = pd.read_csv(RAW_FILE, dtype=str, low_memory=False)
    print(f"  → {len(df_raw):,}행")

    print("[2/4] 정규화 중...")
    df_norm, errors = normalize(df_raw)
    print(f"  → 정규화 행: {len(df_norm):,}행 / 파싱 오류: {len(errors)}건")

    print(f"[3/4] 출력 저장: {OUT_CSV}")
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    df_norm.to_csv(OUT_CSV, index=False, encoding="utf-8-sig")
    print(f"  → {OUT_CSV.name} 저장 완료")

    print("[4/4] 검증 중...")
    df_polling = None
    if POLLING_FILE.exists():
        df_polling = pd.read_csv(POLLING_FILE, dtype=str, low_memory=False)
        df_polling["구시군코드"] = df_polling["구시군코드"].astype(str)

    report = validate(df_norm, df_polling)
    report["parse_errors"] = errors
    report["output_rows"] = len(df_norm)
    report["source_rows"] = len(df_raw)
    report["interpretation_limits"] = [
        "BIPB02는 선거인명부 확정 기준일 기준이며 실제 투표용지 배부량과 동일하지 않음",
        "투표구 순서(제1투, 제2투...)는 BIPB02 표 내 등장 순서 기반이며 투표소 번호와 일치한다고 단정할 수 없음",
        "ps_name_key를 통한 투표소 목록 연결은 이름 동일성 가정이며 억지 매칭 아님 — 불일치 시 수작업 확인 필요",
        "소계 행의 선거구 명칭은 BIPB02에 표시되지 않아 district_dong_mapping과 별도 교차 필요",
    ]

    with open(OUT_VAL, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"  → {OUT_VAL.name} 저장 완료")

    # 결과 요약
    prec_rows = df_norm[(df_norm["row_type"] == "투표구") & (df_norm["성별"] == "계")]
    print("\n=== 결과 요약 ===")
    print(f"  전체 정규화 행: {len(df_norm):,}")
    print(f"  투표구 계 행: {len(prec_rows):,}")
    print(f"  구시군 수: {df_norm['구시군코드'].nunique()}")
    print(f"  통과: {len(report['passed'])} / 경고: {len(report['warnings'])} / 오류: {len(report['errors'])}")
    for p in report["passed"]:
        print(f"    ✓ {p}")
    for w in report["warnings"]:
        print(f"    ⚠ {w}")
    for e in report["errors"]:
        print(f"    ✗ {e}")

    if report["errors"]:
        sys.exit(1)
    print("\n정규화 완료.")


if __name__ == "__main__":
    main()
