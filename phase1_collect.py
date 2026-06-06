"""
Phase 1: 데이터 수집 및 구조 파악
  1. 송파구 2022 (8회) 전체 투표구 데이터 수집
  2. 데이터 단위·컬럼 구조 확인
  3. 67개 부족 투표소 → 투표구 코드 매핑 가능성 검토

실행: python phase1_collect.py
"""
import json
import os
import sys
import pandas as pd
from pathlib import Path

# 프로젝트 루트를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent))

from src.collectors.nec_api import (
    SG_ID_8TH, SG_ID_7TH,
    fetch_all_precincts,
    fetch_polling_places,
)

OUTPUT_DIR = Path("data/processed")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────────────────────
# Step 1: 송파구 2022 투표구별 데이터 수집
# ─────────────────────────────────────────────────────────
print("\n" + "="*60)
print("Step 1: 송파구 2022 투표구 데이터 수집")
print("="*60)

items = fetch_all_precincts(SG_ID_8TH, "서울특별시", "송파구")

if not items:
    print("❌ 데이터 수집 실패. API 응답을 확인하세요.")
    sys.exit(1)

df = pd.DataFrame(items)
print(f"\n✅ 총 {len(df)}개 투표구 수집")
print(f"\n컬럼 목록:")
for col in df.columns:
    sample = df[col].iloc[0] if len(df) > 0 else "N/A"
    print(f"  {col}: {sample}")

# CSV 저장
out_path = OUTPUT_DIR / "songpa_2022_precincts.csv"
df.to_csv(out_path, index=False, encoding="utf-8-sig")
print(f"\n💾 저장: {out_path}")

# ─────────────────────────────────────────────────────────
# Step 2: 데이터 단위 파악
# ─────────────────────────────────────────────────────────
print("\n" + "="*60)
print("Step 2: 데이터 단위 파악")
print("="*60)

# 숫자 컬럼 찾기
for col in df.columns:
    try:
        numeric = pd.to_numeric(df[col])
        print(f"  {col}: min={numeric.min()}, max={numeric.max()}, mean={numeric.mean():.1f}")
    except Exception:
        pass

# 투표구명 샘플
name_cols = [c for c in df.columns if '명' in c or 'name' in c.lower() or '동' in c or '구' in c]
if name_cols:
    print(f"\n투표구 이름 샘플 (첫 5개):")
    for col in name_cols[:3]:
        print(f"  [{col}]: {df[col].head(5).tolist()}")

# ─────────────────────────────────────────────────────────
# Step 3: 부족 투표소 매핑 가능성 검토
# ─────────────────────────────────────────────────────────
print("\n" + "="*60)
print("Step 3: 67개 부족 투표소 매핑 가능성 검토")
print("="*60)

# 선관위 브리핑 확인된 사실 (FACT)
CONFIRMED_SHORTAGE = [
    "잠실7동 제2투표소",  # 가장 대표적, 선관위 브리핑 명시
]

# 투표구명 컬럼 파악
all_cols_str = " | ".join(df.columns.tolist())
print(f"\n전체 컬럼: {all_cols_str}")

# 투표구 코드 컬럼 확인
code_cols = [c for c in df.columns if '코드' in c or 'code' in c.lower() or 'cd' in c.lower() or 'id' in c.lower()]
print(f"\n코드 관련 컬럼: {code_cols}")

# 투표구 이름으로 검색 가능성
name_candidates = [c for c in df.columns if any(k in c for k in ['투표구', '동', '명', '소명'])]
print(f"이름 관련 컬럼: {name_candidates}")

if name_candidates:
    search_col = name_candidates[0]
    for target in CONFIRMED_SHORTAGE:
        dong = target.split(" ")[0]  # "잠실7동"
        matches = df[df[search_col].str.contains(dong, na=False)]
        print(f"\n  '{dong}' 검색 결과: {len(matches)}건")
        if len(matches) > 0:
            print(matches[[search_col] + code_cols].to_string())

# ─────────────────────────────────────────────────────────
# Step 4: 투표소 목록도 확인 (투표소명 매핑)
# ─────────────────────────────────────────────────────────
print("\n" + "="*60)
print("Step 4: 투표소 목록 수집 (투표소명 매핑 확인)")
print("="*60)

polling = fetch_polling_places(SG_ID_8TH, "서울특별시", "송파구")
if polling:
    df_polling = pd.DataFrame(polling)
    print(f"\n투표소 {len(df_polling)}개 수집")
    print(f"컬럼: {df_polling.columns.tolist()}")

    # 잠실7동 제2투표소 검색
    for col in df_polling.columns:
        try:
            matches = df_polling[df_polling[col].str.contains("잠실7동|잠실 7동", na=False, regex=True)]
            if len(matches) > 0:
                print(f"\n  컬럼 [{col}]에서 '잠실7동' {len(matches)}건 발견:")
                print(matches.to_string())
        except Exception:
            pass

    out_path2 = OUTPUT_DIR / "songpa_2022_polling_places.csv"
    df_polling.to_csv(out_path2, index=False, encoding="utf-8-sig")
    print(f"\n💾 저장: {out_path2}")
else:
    print("투표소 목록 수집 실패 또는 데이터 없음")

# ─────────────────────────────────────────────────────────
# Phase 1 결과 요약
# ─────────────────────────────────────────────────────────
print("\n" + "="*60)
print("Phase 1 결과 요약")
print("="*60)
print(f"  투표구 데이터: {len(df)}개 수집 → {OUTPUT_DIR}/songpa_2022_precincts.csv")
print(f"  투표소 데이터: {len(polling) if polling else 0}개 수집")
print(f"  다음 단계: 컬럼 구조 확인 후 M1 적용 + 역대 데이터 확장")
