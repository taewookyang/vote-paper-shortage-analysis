"""
중앙선관위 공공데이터포털 API 수집기
data.go.kr API 키 필요: 환경변수 NEC_API_KEY
"""
import os
import time
import json
import logging
from datetime import datetime
import requests

RATE_LIMIT_DELAY = 1.0
MAX_RETRY = 3
BASE_URL = "https://apis.data.go.kr/9760000"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_api_key() -> str:
    key = os.environ.get("NEC_API_KEY", "")
    if not key:
        raise ValueError("NEC_API_KEY 환경변수를 설정하세요.")
    return key


def fetch_with_retry(url: str, params: dict, source_label: str) -> dict:
    for attempt in range(MAX_RETRY):
        try:
            time.sleep(RATE_LIMIT_DELAY)
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"[{source_label}] 수집 완료: {url} (시도 {attempt+1})")
            _log_source(source_label, url)
            return data
        except Exception as e:
            logger.warning(f"[{source_label}] 시도 {attempt+1} 실패: {e}")
            if attempt == MAX_RETRY - 1:
                raise
    return {}


def _log_source(label: str, url: str):
    log_path = "data/raw/collection_log.jsonl"
    os.makedirs("data/raw", exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps({
            "label": label,
            "url": url,
            "collected_at": datetime.now().isoformat()
        }, ensure_ascii=False) + "\n")


def fetch_vote_turnout(election_code: str, district_code: str = "") -> dict:
    """투·개표 정보 수집 (API ID: 15000900)"""
    url = f"{BASE_URL}/LifeElectionInfoInqireService2/getVoteInfo"
    params = {
        "serviceKey": get_api_key(),
        "electionId": election_code,
        "sggCd": district_code,
        "type": "json",
        "numOfRows": 1000,
        "pageNo": 1,
    }
    return fetch_with_retry(url, params, f"turnout_{election_code}")


def fetch_prevote_info(election_code: str) -> dict:
    """사전투표 정보 수집 (API ID: 15040586)"""
    url = f"{BASE_URL}/LifeElectionInfoInqireService2/getPreVoteInfo"
    params = {
        "serviceKey": get_api_key(),
        "electionId": election_code,
        "type": "json",
        "numOfRows": 1000,
        "pageNo": 1,
    }
    return fetch_with_retry(url, params, f"prevote_{election_code}")
