"""
투표소별 50% 위험 리포트
확정 지표와 추정 지표를 명확히 분리한다.

확정: BIPB02 기반 선거인수, 배부 기준(50/60/70%) 장수
추정: 동 단위 실제 투표수를 선거인수 비율로 배분한 값 (실측값 아님)

입력:
  data/processed/bipb02_normalized.csv
  data/raw/nec_polling_places_2026_national.csv
  data/raw/shortage_2026.csv
  data/raw/national_dong_turnout.csv

출력:
  data/processed/polling_place_risk_2026.csv      — 전국 투표소별 위험 테이블
  data/processed/shortage_summary_2026.csv        — 부족/중단 투표소 요약
  data/processed/top100_risk_2026.csv             — 선거인수 상위 100 투표소
  data/processed/risk_report_2026.json            — 검증·해석 리포트
"""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data/processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DISCLAIMER = (
    "BIPB02는 선거인명부 확정상황 기준이며 실제 투표용지 배부량과 동일하지 않음. "
    "투표소별 실제 선거일 투표수는 미공개이므로 추정 투표수는 "
    "동 단위 투표수를 선거인수 비율로 배분한 값이며 실측값이 아님. "
    "배부 기준 초과 여부는 추정값 기반이며 실제 부족을 확정하지 않음."
)

# ---------------------------------------------------------------------------
# 1. BIPB02 — 투표구별 선거인수 (계 행만)
# ---------------------------------------------------------------------------
print("[1/6] BIPB02 로드...")
bipb02 = pd.read_csv(ROOT / "data/processed/bipb02_normalized.csv", dtype=str)
prec = bipb02[
    (bipb02["row_type"] == "투표구") & (bipb02["성별"] == "계")
].copy()
prec["확정선거인수"] = pd.to_numeric(prec["확정선거인수"], errors="coerce")
prec = prec.dropna(subset=["확정선거인수", "구시군코드", "읍면동명", "ps_name_key"])
# 같은 동이 여러 선거구 소계에 중복 등장하는 경우 dedup (첫 번째 소계 기준)
prec = prec.drop_duplicates(subset=["구시군코드", "읍면동명", "투표구순서"], keep="first")
print(f"  → 투표구 행: {len(prec):,} (dedup 후)")

# ---------------------------------------------------------------------------
# 2. 투표소 목록 — 주소 등 메타
# ---------------------------------------------------------------------------
print("[2/6] 투표소 목록 로드...")
polling = pd.read_csv(
    ROOT / "data/raw/nec_polling_places_2026_national.csv", dtype=str
)
polling["_key"] = polling["psName"].str.replace(" ", "")
# alt key: 읍/면 단독 투표소
polling["_key_alt"] = polling.apply(
    lambda r: r["emdName"] + "제1투" if str(r["_key"]).endswith("투표소") else None,
    axis=1,
)
print(f"  → 투표소: {len(polling):,}")

# ---------------------------------------------------------------------------
# 3. 매칭: BIPB02 투표구 + 투표소 목록
# ---------------------------------------------------------------------------
print("[3/6] BIPB02 ↔ 투표소 매칭...")
poll_map = polling.drop_duplicates("_key").set_index("_key")[["placeName", "addr", "floor", "emdName", "구시군코드"]].rename(
    columns={"구시군코드": "poll_구시군코드", "emdName": "poll_emdName"}
)
poll_map_alt = (
    polling.dropna(subset=["_key_alt"])
    .set_index("_key_alt")[["placeName", "addr", "floor", "emdName", "구시군코드"]]
    .rename(columns={"구시군코드": "poll_구시군코드", "emdName": "poll_emdName"})
)

prec = prec.join(poll_map, on="ps_name_key", how="left")
# alt 키로 보완 (중복 인덱스 방지)
poll_map_alt_u = poll_map_alt[~poll_map_alt.index.duplicated(keep="first")]
if "ps_name_key_alt" in prec.columns:
    mask = prec["placeName"].isna() & prec["ps_name_key_alt"].notna()
    if mask.any():
        for col in ["placeName", "addr", "floor", "poll_구시군코드", "poll_emdName"]:
            if col in poll_map_alt_u.columns:
                prec.loc[mask, col] = prec.loc[mask, "ps_name_key_alt"].map(poll_map_alt_u[col])
matched = prec["placeName"].notna().sum()
print(f"  → 매칭: {matched:,}/{len(prec):,} ({matched/len(prec):.1%})")

# ---------------------------------------------------------------------------
# 4. 확정 지표: 50/60/70% 배부 기준
# ---------------------------------------------------------------------------
print("[4/6] 확정 지표 계산...")
prec["확정_50pct_기준장수"] = (prec["확정선거인수"] * 0.50).astype(int)
prec["확정_60pct_기준장수"] = (prec["확정선거인수"] * 0.60).astype(int)
prec["확정_70pct_기준장수"] = (prec["확정선거인수"] * 0.70).astype(int)

# 전국 선거인수 분위
prec["확정_선거인수_전국분위"] = prec["확정선거인수"].rank(pct=True).round(4)

# 구시군별 분위
prec["확정_선거인수_구시군분위"] = prec.groupby("구시군코드")["확정선거인수"].rank(pct=True).round(4)

# 읍면동별 분위
prec["확정_선거인수_동분위"] = prec.groupby(["구시군코드", "읍면동명"])["확정선거인수"].rank(pct=True).round(4)

# ---------------------------------------------------------------------------
# 5. 추정 지표: 동 단위 투표수 → 투표소별 배분
# ---------------------------------------------------------------------------
print("[5/6] 추정 지표 계산 (동 투표수 비례 배분)...")
dong_turn = pd.read_csv(ROOT / "data/raw/national_dong_turnout.csv", dtype=str)
dong_turn["선거인수"] = pd.to_numeric(dong_turn["선거인수"], errors="coerce")
dong_turn["투표수"] = pd.to_numeric(dong_turn["투표수"], errors="coerce")
dong_turn = dong_turn.rename(columns={"townCode": "구시군코드", "동": "읍면동명"})

# 동별 총 선거인수 합산 (투표구별 합계 = 동합계여야 함)
dong_prec_sum = prec.groupby(["구시군코드", "읍면동명"])["확정선거인수"].sum().rename("dong_prec_total")
dong_turn = dong_turn.join(dong_prec_sum, on=["구시군코드", "읍면동명"])

# 투표소별 선거인수 비율 계산용
prec = prec.join(
    dong_turn.set_index(["구시군코드", "읍면동명"])[["투표수", "dong_prec_total"]].rename(
        columns={"투표수": "동_실제투표수", "dong_prec_total": "동_prec_합계"}
    ),
    on=["구시군코드", "읍면동명"],
)

prec["추정_투표소비율"] = (prec["확정선거인수"] / prec["동_prec_합계"]).round(4)
prec["추정_선거일투표수"] = (prec["동_실제투표수"] * prec["추정_투표소비율"]).round(0)
prec["추정_50pct초과여부"] = prec["추정_선거일투표수"] > prec["확정_50pct_기준장수"]
prec["추정_배부기준대비초과량"] = (
    prec["추정_선거일투표수"] - prec["확정_50pct_기준장수"]
).clip(lower=0).round(0)
prec["추정값_주의"] = DISCLAIMER

# ---------------------------------------------------------------------------
# 6. 부족/중단 투표소 매칭
# ---------------------------------------------------------------------------
print("[6/6] 부족 투표소 매칭...")
shortage = pd.read_csv(ROOT / "data/raw/shortage_2026.csv", dtype=str)
# 행정동 명칭 정규화: "구의3동"→"구의제3동", "노량진1동"→"노량진제1동" 등
_DONG_ALIASES = {
    "구의3동": "구의제3동",
    "구의2동": "구의제2동",
    "구의1동": "구의제1동",
    "노량진1동": "노량진제1동",
    "노량진2동": "노량진제2동",
}

def normalize_ps_key(name):
    if not name or str(name).strip() == "":
        return ""
    s = str(name).strip()
    for old, new in _DONG_ALIASES.items():
        s = s.replace(old, new)
    return s.replace(" ", "").replace("투표소", "투")

shortage["_ps_key"] = shortage["투표소명"].fillna("").apply(normalize_ps_key)
named = shortage[shortage["투표소명"].notna()].copy()
shortage_keys = set(named["_ps_key"])
shortage_shutdown_keys = set(
    named[named["투표중단여부"] == "True"]["_ps_key"]
)

prec["라벨_부족확인"] = prec["ps_name_key"].isin(shortage_keys)
prec["라벨_투표중단"] = prec["ps_name_key"].isin(shortage_shutdown_keys)

# 구시군 단위 부족 플래그 (이름 미확인 포함)
shortage_gugun = set(
    shortage[shortage["실제부족여부"] == "True"]["구시군"].str.strip()
)
prec["라벨_부족구시군"] = prec["구시군"].isin(shortage_gugun)

# ---------------------------------------------------------------------------
# 저장
# ---------------------------------------------------------------------------
col_order = [
    "시도코드", "시도", "구시군코드", "구시군", "읍면동명", "투표구번호",
    "ps_name_key", "ps_name_key_alt", "placeName", "addr",
    # 확정
    "확정선거인수",
    "확정_50pct_기준장수", "확정_60pct_기준장수", "확정_70pct_기준장수",
    "확정_선거인수_전국분위", "확정_선거인수_구시군분위", "확정_선거인수_동분위",
    # 추정
    "동_실제투표수", "추정_투표소비율", "추정_선거일투표수",
    "추정_50pct초과여부", "추정_배부기준대비초과량", "추정값_주의",
    # 라벨
    "라벨_부족확인", "라벨_투표중단", "라벨_부족구시군",
]
available = [c for c in col_order if c in prec.columns]
out = prec[available]

out.to_csv(OUT_DIR / "polling_place_risk_2026.csv", index=False, encoding="utf-8-sig")
print(f"  → polling_place_risk_2026.csv: {len(out):,}행")

# 부족 확인 투표소 요약
shortage_out = out[out["라벨_부족확인"]].copy()
shortage_out.to_csv(OUT_DIR / "shortage_summary_2026.csv", index=False, encoding="utf-8-sig")
print(f"  → shortage_summary_2026.csv: {len(shortage_out)}행")

# 전국 상위 100 (선거인수 기준)
top100 = out.nlargest(100, "확정선거인수")[available]
top100.to_csv(OUT_DIR / "top100_risk_2026.csv", index=False, encoding="utf-8-sig")
print(f"  → top100_risk_2026.csv: 100행")

# 검증 리포트
report = {
    "생성일": "2026-06-08",
    "총_투표구": len(out),
    "투표소_매칭률": f"{matched/len(prec):.1%}",
    "부족확인_투표소": int(out["라벨_부족확인"].sum()),
    "투표중단_투표소": int(out["라벨_투표중단"].sum()),
    "추정_50pct초과": int(out["추정_50pct초과여부"].sum()),
    "부족확인_투표소_전국분위_중앙값": float(
        shortage_out["확정_선거인수_전국분위"].median()
    ) if len(shortage_out) else None,
    "부족확인_투표소_전국분위_최솟값": float(
        shortage_out["확정_선거인수_전국분위"].min()
    ) if len(shortage_out) else None,
    "해석_제한": [
        "BIPB02는 선거인명부 확정 기준이며 실제 배부량과 동일하지 않음",
        "투표소별 실제 선거일 투표수는 미공개 — 추정값은 동 단위 비례 배분",
        "추정_50pct초과여부는 실제 부족 확정이 아님",
        "투표중단 22곳 중 이름 공개된 곳만 라벨_투표중단=True",
        "투표구 수 불일치 87개 구시군은 집계 시 주의 필요",
    ],
    "확정_지표": ["확정선거인수", "확정_50/60/70pct_기준장수", "확정_선거인수_분위"],
    "추정_지표": ["추정_선거일투표수", "추정_50pct초과여부", "추정_배부기준대비초과량"],
}

with open(OUT_DIR / "risk_report_2026.json", "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print()
print("=== 결과 요약 ===")
print(f"  전체 투표구: {report['총_투표구']:,}")
print(f"  부족 확인 투표소: {report['부족확인_투표소']}개")
print(f"  투표 중단 투표소(이름 공개): {report['투표중단_투표소']}개")
print(f"  추정 50% 초과 투표소: {report['추정_50pct초과']:,}개")
if report["부족확인_투표소_전국분위_중앙값"]:
    print(f"  부족확인 투표소 전국 선거인수 분위 중앙값: {report['부족확인_투표소_전국분위_중앙값']:.1%}")
print()

# 부족 확인 투표소 상세 출력
if len(shortage_out):
    cols_show = ["구시군", "읍면동명", "투표구번호", "확정선거인수",
                 "확정_50pct_기준장수", "추정_선거일투표수",
                 "추정_배부기준대비초과량", "확정_선거인수_전국분위"]
    show_cols = [c for c in cols_show if c in shortage_out.columns]
    print("=== 부족 확인 투표소 ===")
    print(shortage_out[show_cols].sort_values("확정선거인수", ascending=False).to_string(index=False))
