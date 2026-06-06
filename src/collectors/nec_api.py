"""
중앙선관위 공공데이터포털 API 수집기
data.go.kr API 키 필요: 환경변수 NEC_API_KEY

확인된 엔드포인트 (API 활용가이드 v4.3 기준):
- VoteXmntckInfoInqireService2/getVoteSttusInfoInqire  → 투표결과
- VoteXmntckInfoInqireService2/getXmntckSttusInfoInqire → 개표결과
- PolplcInfoInqireService2/getPolplcOtlnmapTrnsportInfoInqire → 투표소 목록
- PolplcInfoInqireService2/getPrePolplcOtlnmapTrnsportInfoInqire → 사전투표소 목록
"""
import os
import time
import json
import logging
from datetime import datetime
from urllib.parse import urlencode
from urllib.request import urlopen, Request
import xml.etree.ElementTree as ET

RATE_LIMIT_DELAY = 1.0
MAX_RETRY = 3
BASE_URL = "https://apis.data.go.kr/9760000"

SG_ID_8TH = "20220601"  # 8회 지방선거 (2022)
SG_ID_7TH = "20180613"  # 7회 지방선거 (2018)
SG_ID_6TH = "20140604"  # 6회 지방선거 (2014)
SG_ID_9TH = "20260603"  # 9회 지방선거 (2026)
SG_TYPECODE_LOCAL = "3"  # 지방선거

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def load_dotenv_fallback(path: str = ".env") -> None:
    """Load simple KEY=VALUE pairs without requiring python-dotenv."""
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv_fallback()


def get_api_key() -> str:
    key = os.environ.get("NEC_API_KEY", "")
    if not key:
        raise ValueError("NEC_API_KEY 환경변수를 설정하세요.")
    return key


def _strip_namespace(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _xml_element_to_value(element: ET.Element):
    children = list(element)
    if not children:
        return (element.text or "").strip()

    grouped: dict[str, list] = {}
    for child in children:
        key = _strip_namespace(child.tag)
        grouped.setdefault(key, []).append(_xml_element_to_value(child))

    result = {}
    for key, values in grouped.items():
        result[key] = values[0] if len(values) == 1 else values
    return result


def _response_to_dict(text: str) -> dict:
    text = text.strip()
    if not text:
        return {}
    if text.startswith("{"):
        return json.loads(text)
    root = ET.fromstring(text)
    return {_strip_namespace(root.tag): _xml_element_to_value(root)}


def fetch_with_retry(url: str, params: dict, source_label: str) -> dict:
    for attempt in range(MAX_RETRY):
        try:
            time.sleep(RATE_LIMIT_DELAY)
            full_url = f"{url}?{urlencode(params)}"
            req = Request(full_url, headers={"User-Agent": "vote-paper-shortage-analysis/0.1"})
            with urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            data = _response_to_dict(raw)
            logger.info(f"[{source_label}] 수집 완료 (시도 {attempt+1})")
            _log_source(source_label, full_url)
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


def fetch_vote_status(sg_id: str, sd_name: str, wiw_name: str, page_no: int = 1, num_of_rows: int = 100) -> dict:
    """투표현황 조회 — 투표구별 선거인수·투표수·투표율"""
    url = f"{BASE_URL}/VoteXmntckInfoInqireService2/getVoteSttusInfoInqire"
    params = {
        "serviceKey": get_api_key(),
        "sgId": sg_id,
        "sgTypecode": SG_TYPECODE_LOCAL,
        "sdName": sd_name,
        "wiwName": wiw_name,
        "pageNo": page_no,
        "numOfRows": num_of_rows,
    }
    label = f"vote_status_{sg_id}_{sd_name}_{wiw_name}_p{page_no}"
    return fetch_with_retry(url, params, label)


def fetch_all_precincts(sg_id: str, sd_name: str, wiw_name: str) -> list[dict]:
    """페이지네이션 처리하여 구·군 전체 투표구 수집"""
    all_items = []
    page = 1
    while True:
        data = fetch_vote_status(sg_id, sd_name, wiw_name, page_no=page, num_of_rows=100)
        try:
            body = data["response"]["body"]
            items = body.get("items", {}).get("item", [])
            if isinstance(items, dict):
                items = [items]
            total_count = int(body.get("totalCount", 0))
            all_items.extend(items)
            logger.info(f"  p{page}: {len(items)}건 수집 (누적 {len(all_items)}/{total_count})")
            if len(all_items) >= total_count or not items:
                break
            page += 1
        except (KeyError, TypeError) as e:
            logger.error(f"응답 파싱 실패: {e} | 응답: {json.dumps(data, ensure_ascii=False)[:500]}")
            break
    return all_items


def fetch_polling_places(sg_id: str, sd_name: str, wiw_name: str) -> list[dict]:
    """선거일 투표소 목록 조회"""
    url = f"{BASE_URL}/PolplcInfoInqireService2/getPolplcOtlnmapTrnsportInfoInqire"
    all_items = []
    page = 1
    while True:
        params = {
            "serviceKey": get_api_key(),
            "sgId": sg_id,
            "sgTypecode": SG_TYPECODE_LOCAL,
            "sdName": sd_name,
            "wiwName": wiw_name,
            "pageNo": page,
            "numOfRows": 100,
        }
        try:
            data = fetch_with_retry(url, params, f"polling_places_{sg_id}_{sd_name}_{wiw_name}_p{page}")
            body = data["response"]["body"]
            items = body.get("items", {}).get("item", [])
            if isinstance(items, dict):
                items = [items]
            total_count = int(body.get("totalCount", 0))
            all_items.extend(items)
            if len(all_items) >= total_count or not items:
                break
            page += 1
        except Exception as e:
            logger.error(f"투표소 수집 실패: {e}")
            break
    logger.info(f"투표소 {len(all_items)}개 수집 완료")
    return all_items
