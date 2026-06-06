"""개표결과 엑셀 — 데이터 세분화 수준 파악"""
import pandas as pd
from pathlib import Path

xlsx = Path("data/raw/중앙선거관리위원회_제8회 전국동시지방선거 개표결과_20220601.xlsx")

# 구시군의장 시트 — 읍면동 단위 확인 (더 많은 행)
df = pd.read_excel(xlsx, sheet_name="구·시·군의장", header=None)
print(f"전체 shape: {df.shape}")
print(f"\n처음 20행:")
print(df.head(20).to_string())

# 송파구만 필터
# 헤더가 어디서 시작하는지 파악
for i, row in df.iterrows():
    if "송파구" in str(row.values):
        print(f"\n  행 {i}: {row.values[:8]}")
        if i > 50:
            break
