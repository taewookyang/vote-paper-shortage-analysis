"""Build an inventory of local NEC mirror datasets and known gaps."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
PUBLIC = ROOT / "dashboard" / "public" / "data"
DOCS = ROOT / "docs"


@dataclass
class MirrorDataset:
    dataset_id: str
    title: str
    file: str
    category: str
    source: str
    current_scope: str
    desired_scope: str
    status: str
    rows: int | None = None
    columns: int | None = None
    size_bytes: int | None = None
    notes: str = ""
    goal_relevant: bool = True


CATALOG: list[MirrorDataset] = [
    MirrorDataset(
        "national_codes",
        "전국 시도/구시군 코드",
        "data/raw/national_codes.json",
        "code",
        "NEC info.nec.go.kr",
        "전국 구시군",
        "전국 구시군",
        "unknown",
    ),
    MirrorDataset(
        "vote_progress_national",
        "시간대별 투표진행상황",
        "data/raw/nec_vote_progress_national_2026.csv",
        "turnout_progress",
        "NEC VCVP01",
        "전국 시도/구시군 시간대",
        "전국 시도/구시군 시간대",
        "unknown",
        notes="투표소 단위가 아니라 구시군 단위로 보는 것이 안전함",
    ),
    MirrorDataset(
        "vote_progress_default",
        "시간대별 투표진행상황 기본 수집",
        "data/raw/nec_vote_progress_2026.csv",
        "turnout_progress",
        "NEC VCVP01",
        "전국+서울 기본 수집",
        "전국 시도/구시군 시간대",
        "unknown",
        notes="초기 기본 수집 산출물. 전국 시간대 미러는 vote_progress_national 사용",
        goal_relevant=False,
    ),
    MirrorDataset(
        "prevote_national",
        "전국 사전투표 진행상황 시간대",
        "data/raw/nec_prevote_2026_national.csv",
        "early_vote",
        "NEC VCAP01",
        "전국/시도별 날짜 1·2·누계 및 07-18시 시간대",
        "전국/시도별 날짜 1·2·누계 및 07-18시 시간대",
        "unknown",
        notes="2일차누계의 전체(time=0)는 NEC 화면에서 제공되지 않아 07-18시 누계만 보존",
    ),
    MirrorDataset(
        "prevote",
        "사전투표 진행상황",
        "data/raw/nec_prevote_2026.csv",
        "early_vote",
        "NEC VCAP01",
        "전국+서울 일부 날짜/시간",
        "전국 시도/구시군 날짜/시간",
        "unknown",
        notes="현재 스크립트는 전국+서울 중심. 전국 전체 날짜/시간 샤딩 확장 필요",
        goal_relevant=False,
    ),
    MirrorDataset(
        "dong_turnout",
        "읍면동 선거인수/선거일 투표수",
        "data/raw/national_dong_turnout.csv",
        "dong_turnout",
        "NEC VCCP08",
        "전국 구시군 읍면동",
        "전국 구시군 읍면동",
        "unknown",
        notes="투표용지 50% 기준과 본투표 수요 분석의 핵심",
    ),
    MirrorDataset(
        "candidate_results_all",
        "전국 전체 선거종류 후보별 개표단위 득표",
        "data/raw/nec_candidate_results_2026_national_all.csv",
        "candidate_results",
        "NEC VCCP08",
        "전국 모든 선거종류",
        "전국 모든 선거종류",
        "unknown",
        notes="collect_nec_candidate_results_all.cjs 샤드 수집 후 merge_nec_candidate_results.py로 생성",
    ),
    MirrorDataset(
        "candidate_results_smoke",
        "전체 후보득표 수집기 smoke 검증",
        "data/raw/nec_candidate_results_2026_smoke.csv",
        "candidate_results",
        "NEC VCCP08",
        "송파구 3개 선거종류 smoke",
        "송파구 3개 선거종류 smoke",
        "unknown",
        notes="전국 전체 실행 전 수집기 선택/파싱 검증용",
        goal_relevant=False,
    ),
    MirrorDataset(
        "candidate_results_metro",
        "전국 광역단체장 후보별 개표단위 득표",
        "data/raw/vote_pattern_results_2026_national_metro.csv",
        "candidate_results",
        "NEC VCCP08",
        "전국 광역단체장",
        "전국 모든 선거종류",
        "unknown",
        notes="현재는 광역단체장만 완성. 전체 선거종류 확장 필요",
        goal_relevant=False,
    ),
    MirrorDataset(
        "candidate_results_shortage_targets",
        "부족 발생 구시군 후보/표차 타깃 수집",
        "data/raw/targeted_election_candidates_2026.csv",
        "candidate_results",
        "NEC VCCP08/EPEI01",
        "부족 발생 구시군 중심",
        "전국 모든 선거종류",
        "unknown",
        notes="부족 발생 구시군 표적 수집 산출물. 전체 후보득표 미러는 candidate_results_all 사용",
        goal_relevant=False,
    ),
    MirrorDataset(
        "candidate_results_songpa_council",
        "송파구 기초의원 후보별 득표",
        "data/raw/songpa_2026_result.csv",
        "candidate_results",
        "NEC VCCP08",
        "송파구 기초의원",
        "전국 모든 선거종류",
        "unknown",
        notes="송파구 기초의원 표적 수집 산출물. 전체 후보득표 미러는 candidate_results_all 사용",
        goal_relevant=False,
    ),
    MirrorDataset(
        "candidate_results_songpa_mayor",
        "송파구 구청장 후보별 득표",
        "data/raw/songpa_2026_mayor_result.csv",
        "candidate_results",
        "NEC VCCP08",
        "송파구 구청장",
        "전국 모든 선거종류",
        "unknown",
        notes="송파구 구청장 표적 수집 산출물. 전체 후보득표 미러는 candidate_results_all 사용",
        goal_relevant=False,
    ),
    MirrorDataset(
        "district_dong_mapping_national",
        "전국 선거구-읍면동 매핑",
        "data/raw/district_dong_mapping_2026_national.csv",
        "mapping",
        "NEC VCCP08 후보별 개표단위 득표 파생",
        "전국 광역의원/기초의원 선거구-읍면동",
        "전국 광역의원/기초의원 선거구-읍면동",
        "unknown",
        notes="후보득표 전국 병합본의 선거구명·읍면동명을 고유 조합으로 추출. 행정구역 법정 매핑과 동일하다고 단정하지 않음",
    ),
    MirrorDataset(
        "district_dong_mapping",
        "선거구-읍면동 매핑",
        "data/raw/district_dong_mapping_2026.csv",
        "mapping",
        "NEC info.nec.go.kr",
        "수집된 타깃 구 중심",
        "전국 선거구-읍면동",
        "unknown",
        notes="초기 타깃 구 중심 매핑. 전국 매핑은 district_dong_mapping_national 사용",
        goal_relevant=False,
    ),
    MirrorDataset(
        "polling_places_national",
        "전국 선거일 투표소 목록",
        "data/raw/nec_polling_places_2026_national.csv",
        "polling_places",
        "NEC public data API PolplcInfoInqireService2",
        "전국 256개 구시군 선거일 투표소",
        "전국 256개 구시군 선거일 투표소",
        "unknown",
        notes="collect_nec_polling_places_national.py 체크포인트 수집. 위치/층/주소는 API 원문 필드 기준",
    ),
    MirrorDataset(
        "shortage_polling_places",
        "부족 발생 구시군 투표소 목록",
        "data/processed/shortage_gu_polling_places.csv",
        "polling_places",
        "NEC 투표소 정보",
        "5개 구 539개 투표소",
        "전국 투표소",
        "unknown",
        notes="부족 발생 5개 구 참조용 목록. 전국 투표소 미러는 polling_places_national 사용",
        goal_relevant=False,
    ),
    MirrorDataset(
        "voter_roll_national",
        "전국 선거인명부 확정상황 원문 행",
        "data/raw/nec_voter_roll_2026_national.csv",
        "voter_roll",
        "NEC BIPB02",
        "전국 256개 구시군 읍면동별 원문 표 행",
        "전국 256개 구시군 읍면동별 원문 표 행",
        "unknown",
        notes="행 병합이 있는 BIPB02 표를 cell_0..cell_N 원문 행으로 보존. 세종/제주는 기초의원선거 해당 없음으로 0행 완료 처리",
    ),
    MirrorDataset(
        "voter_roll_songpa",
        "선거인명부 확정상황",
        "data/raw/nec_voter_roll_2026.csv",
        "voter_roll",
        "NEC BIPB02",
        "송파구 중심",
        "전국 읍면동/구시군",
        "unknown",
        notes="현재 파일이 없으면 전국 확장 전 수집기 보강 필요",
        goal_relevant=False,
    ),
    MirrorDataset(
        "shortage_labels",
        "투표용지 부족 라벨",
        "data/raw/shortage_2026.csv",
        "incident_labels",
        "NEC 브리핑+언론보도",
        "67개 추가송부 라벨",
        "공식/언론/추정 분리된 전체 라벨",
        "unknown",
        notes="투표소명 미확인 항목은 추정하지 않음",
        goal_relevant=False,
    ),
]


def file_stats(path: Path) -> tuple[int | None, int | None, int | None]:
    if not path.exists():
        return None, None, None
    size = path.stat().st_size
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        rows = len(data) if isinstance(data, list) else None
        columns = None
        return rows, columns, size
    if path.suffix.lower() == ".csv":
        frame = pd.read_csv(path, nrows=0)
        columns = len(frame.columns)
        rows = sum(1 for _ in path.open("r", encoding="utf-8-sig", errors="ignore")) - 1
        return max(rows, 0), columns, size
    return None, None, size


def status_for(dataset: MirrorDataset, path: Path, rows: int | None) -> str:
    if not path.exists():
        return "missing"
    if rows is not None and rows <= 0:
        return "empty"
    if dataset.current_scope == dataset.desired_scope:
        return "complete_for_current_goal"
    return "partial"


def build_inventory() -> dict:
    items = []
    for item in CATALOG:
        path = ROOT / item.file
        rows, columns, size = file_stats(path)
        item.rows = rows
        item.columns = columns
        item.size_bytes = size
        item.status = status_for(item, path, rows)
        items.append(asdict(item))

    goal_items = [item for item in items if item["goal_relevant"]]
    reference_items = [item for item in items if not item["goal_relevant"]]
    summary = {
        "datasets": len(items),
        "goal_datasets": len(goal_items),
        "reference_datasets": len(reference_items),
        "complete_for_current_goal": sum(1 for item in goal_items if item["status"] == "complete_for_current_goal"),
        "partial": sum(1 for item in goal_items if item["status"] == "partial"),
        "missing": sum(1 for item in goal_items if item["status"] == "missing"),
        "empty": sum(1 for item in goal_items if item["status"] == "empty"),
        "reference_partial": sum(1 for item in reference_items if item["status"] == "partial"),
        "reference_missing": sum(1 for item in reference_items if item["status"] == "missing"),
        "total_size_bytes": sum(item["size_bytes"] or 0 for item in items),
    }
    return {
        "title": "2026 지방선거 NEC 원자료 미러 인벤토리",
        "disclaimer": "이 인벤토리는 로컬에 보유한 원자료 범위와 공백을 표시한다. 분석 결과나 선거 영향 판단이 아니다.",
        "summary": summary,
        "items": items,
        "recommended_next_steps": [
            "후보득표·사전투표·투표진행·선거인명부·투표소·매핑 전국 미러의 행수와 범위를 정기 감사한다.",
            "BIPB02 선거인명부 raw 행은 행 병합 구조가 있어 별도 정규화 전까지 해석을 제한한다.",
            "전국 매핑은 VCCP08 관측 선거구-읍면동 조합이며 법정 행정구역 매핑과 동일하다고 단정하지 않는다.",
            "레거시 부분 수집물은 참고용으로 유지하되 목표 완료 판정에는 전국 미러 항목을 사용한다.",
        ],
    }


def write_outputs(payload: dict) -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    (PROCESSED / "dashboard").mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)

    json_text = json.dumps(payload, ensure_ascii=False, indent=2)
    for path in [
        PROCESSED / "nec_mirror_inventory_2026.json",
        PROCESSED / "dashboard" / "nec_mirror_inventory_2026.json",
        PUBLIC / "nec_mirror_inventory_2026.json",
    ]:
        path.write_text(json_text, encoding="utf-8")

    rows = pd.DataFrame(payload["items"])
    rows.to_csv(PROCESSED / "nec_mirror_inventory_2026.csv", index=False, encoding="utf-8-sig")

    lines = [
        "# 2026 지방선거 NEC 원자료 미러",
        "",
        payload["disclaimer"],
        "",
        "## 요약",
        "",
        f"- 데이터셋: {payload['summary']['datasets']}개",
        f"- 목표 범위 데이터셋: {payload['summary']['goal_datasets']}개",
        f"- 참고/레거시 데이터셋: {payload['summary']['reference_datasets']}개",
        f"- 현재 목표 기준 완성: {payload['summary']['complete_for_current_goal']}개",
        f"- 목표 기준 부분 수집: {payload['summary']['partial']}개",
        f"- 목표 기준 누락: {payload['summary']['missing']}개",
        f"- 참고 항목 부분/누락: {payload['summary']['reference_partial']} / {payload['summary']['reference_missing']}",
        f"- 총 로컬 크기: {payload['summary']['total_size_bytes']:,} bytes",
        "",
        "## 다음 수집 우선순위",
        "",
        *[f"- {step}" for step in payload["recommended_next_steps"]],
        "",
        "## 데이터셋",
        "",
    ]
    for item in payload["items"]:
        lines.extend([
            f"### {item['title']}",
            "",
            f"- 상태: `{item['status']}`",
            f"- 파일: `{item['file']}`",
            f"- 현재 범위: {item['current_scope']}",
            f"- 목표 범위: {item['desired_scope']}",
            f"- 목표 판정 포함: {item['goal_relevant']}",
            f"- 행/컬럼/크기: {item['rows']} / {item['columns']} / {item['size_bytes']}",
            f"- 비고: {item['notes'] or '-'}",
            "",
        ])
    (DOCS / "NEC_MIRROR.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    payload = build_inventory()
    write_outputs(payload)
    print(json.dumps(payload["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
