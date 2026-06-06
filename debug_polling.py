"""투표소 목록 API 테스트 + 결과 저장"""
import os, requests, xml.etree.ElementTree as ET, json
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()
key = os.environ.get("NEC_API_KEY", "")

# 선거일 투표소 목록
url = "https://apis.data.go.kr/9760000/PolplcInfoInqireService2/getPolplcOtlnmapTrnsportInfoInqire"
params = {
    "serviceKey": key,
    "sgId": "20220601",
    "sgTypecode": "3",
    "sdName": "서울특별시",
    "wiwName": "송파구",
    "pageNo": 1,
    "numOfRows": 20,
}
resp = requests.get(url, params=params, timeout=30)
print(f"Status: {resp.status_code}")
print(f"Body:\n{resp.text[:3000]}")

# XML 파싱
try:
    root = ET.fromstring(resp.text)
    total = root.findtext(".//totalCount")
    items = root.findall(".//item")
    print(f"\ntotalCount: {total}")
    print(f"items: {len(items)}")
    if items:
        print("\n첫 번째 투표소 필드:")
        for child in items[0]:
            print(f"  {child.tag}: {child.text}")
        print("\n투표소명 목록 (잠실7동 검색):")
        for item in items:
            name_tags = ["polplcNm", "polplcSe", "dongNm", "emdNm"]
            for tag in name_tags:
                val = item.findtext(tag)
                if val and "잠실" in val:
                    print(f"  {tag}={val}")
except Exception as e:
    print(f"파싱 오류: {e}")
