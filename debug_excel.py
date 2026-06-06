"""엑셀 파일 구조 파악 + API 개표결과 엔드포인트 테스트"""
import pandas as pd
import os, requests, xml.etree.ElementTree as ET
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

# ─── 1. 제8회 개표결과 엑셀 ───
print("="*60)
print("1. 제8회 개표결과.xlsx 구조")
print("="*60)

xlsx_path = Path("data/raw/중앙선거관리위원회_제8회 전국동시지방선거 개표결과_20220601.xlsx")
if xlsx_path.exists():
    xl = pd.ExcelFile(xlsx_path)
    print(f"시트 목록: {xl.sheet_names}")
    for sheet in xl.sheet_names[:5]:
        df = pd.read_excel(xlsx_path, sheet_name=sheet, nrows=5)
        print(f"\n시트: [{sheet}] — shape: {df.shape}")
        print(df.to_string())
else:
    print(f"파일 없음: {xlsx_path}")

# ─── 2. 제8회 투표율 분석 — 선거일 투표 ───
print("\n" + "="*60)
print("2. 선거일 투표.xlsx 구조")
print("="*60)

vote_day_path = Path("data/raw/중앙선거관리위원회_제8회 전국동시지방선거 투표율 분석_20220601/02_선거일 투표/01_선거일 투표.xlsx")
if vote_day_path.exists():
    xl2 = pd.ExcelFile(vote_day_path)
    print(f"시트 목록: {xl2.sheet_names}")
    for sheet in xl2.sheet_names[:3]:
        df2 = pd.read_excel(vote_day_path, sheet_name=sheet, nrows=10)
        print(f"\n시트: [{sheet}]")
        print(df2.to_string())

# ─── 3. API — 개표결과 엔드포인트 (XML 파싱) ───
print("\n" + "="*60)
print("3. API 개표결과 (getXmntckSttusInfoInqire)")
print("="*60)

key = os.environ.get("NEC_API_KEY", "")
url = "https://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2/getXmntckSttusInfoInqire"
params = {
    "serviceKey": key,
    "sgId": "20220601",
    "sgTypecode": "3",
    "sdName": "서울특별시",
    "wiwName": "송파구",
    "pageNo": 1,
    "numOfRows": 5,
}
resp = requests.get(url, params=params, timeout=30)
print(f"Status: {resp.status_code}")
print(f"Body:\n{resp.text[:2000]}")

# ─── 4. 투표현황 XML 파싱해서 컬럼 파악 ───
print("\n" + "="*60)
print("4. 투표현황 XML 파싱")
print("="*60)

url2 = "https://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2/getVoteSttusInfoInqire"
params2 = {
    "serviceKey": key,
    "sgId": "20220601",
    "sgTypecode": "3",
    "sdName": "서울특별시",
    "wiwName": "송파구",
    "pageNo": 1,
    "numOfRows": 100,
}
resp2 = requests.get(url2, params=params2, timeout=30)
root = ET.fromstring(resp2.text)
total_count = root.findtext(".//totalCount")
print(f"totalCount: {total_count}")
items = root.findall(".//item")
print(f"items in page: {len(items)}")
if items:
    print("컬럼:")
    for child in items[0]:
        print(f"  {child.tag}: {child.text}")
