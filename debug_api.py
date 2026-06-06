import os, requests
from dotenv import load_dotenv

load_dotenv()
key = os.environ.get("NEC_API_KEY", "")
print(f"Key loaded: {bool(key)}, len={len(key)}")
print(f"Key preview: {key[:20]}...")

url = "https://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2/getVoteSttusInfoInqire"
params = {
    "serviceKey": key,
    "sgId": "20220601",
    "sgTypecode": "3",
    "sdName": "서울특별시",
    "wiwName": "송파구",
    "pageNo": 1,
    "numOfRows": 5,
    "type": "json",
}
resp = requests.get(url, params=params, timeout=30)
print(f"Status: {resp.status_code}")
print(f"Content-Type: {resp.headers.get('Content-Type')}")
print(f"Encoding: {resp.encoding}")
print(f"Body length: {len(resp.text)}")
print(f"Body:\n{resp.text[:2000]}")
