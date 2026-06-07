"""Audit raw election data before analysis and dashboard export."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"


@dataclass
class Check:
    dataset: str
    check: str
    status: str
    severity: str
    detail: str


def _check(dataset: str, name: str, passed: bool, detail: str, severity: str = "error") -> Check:
    return Check(dataset, name, "pass" if passed else "fail", severity, detail)


def _skip(dataset: str, name: str, detail: str) -> Check:
    return Check(dataset, name, "skip", "info", detail)


def _numbers(frame: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    clean = frame.copy()
    for column in columns:
        clean[column] = pd.to_numeric(
            clean[column].astype(str).str.replace(",", "", regex=False),
            errors="coerce",
        )
    return clean


def _required_columns(dataset: str, frame: pd.DataFrame, required: list[str]) -> Check:
    missing = sorted(set(required) - set(frame.columns))
    return _check(dataset, "required_columns", not missing, f"missing={missing}")


def audit_songpa_mayor(path: Path) -> list[Check]:
    dataset = "songpa_2026_mayor_result"
    if not path.exists():
        return [_skip(dataset, "file_exists", f"missing: {path}")]
    frame = pd.read_csv(path, dtype=str)
    required = ["시도", "구시군", "선거명", "읍면동명", "개표단위", "선거인수", "투표수", "출처URL"]
    checks = [_required_columns(dataset, frame, required)]
    if checks[0].status == "fail":
        return checks

    frame = _numbers(frame, ["선거인수", "투표수"])
    dongs = frame[frame["읍면동명"].notna() & frame["읍면동명"].ne("")]
    checks.append(_check(dataset, "songpa_27_dongs", dongs["읍면동명"].nunique() == 27, f"dongs={dongs['읍면동명'].nunique()}"))
    duplicates = frame.duplicated(["읍면동명", "개표단위"], keep=False).sum()
    checks.append(_check(dataset, "unique_dong_counting_unit", duplicates == 0, f"duplicate_rows={duplicates}"))

    expected_units = {"계", "관내사전투표", "선거일투표"}
    unit_sets = dongs.groupby("읍면동명")["개표단위"].agg(set)
    incomplete = unit_sets[unit_sets.map(lambda values: not expected_units.issubset(values))]
    checks.append(_check(dataset, "dong_unit_coverage", incomplete.empty, f"incomplete_dongs={incomplete.index.tolist()}"))

    mismatches = []
    for dong, group in dongs.groupby("읍면동명"):
        by_unit = group.set_index("개표단위")
        if not expected_units.issubset(by_unit.index):
            continue
        for column in ["선거인수", "투표수"]:
            total = by_unit.at["계", column]
            parts = by_unit.at["관내사전투표", column] + by_unit.at["선거일투표", column]
            if pd.notna(total) and pd.notna(parts) and total != parts:
                mismatches.append(f"{dong}:{column}:{total}!={parts}")
    checks.append(_check(dataset, "dong_total_equals_advance_plus_election_day", not mismatches, f"mismatches={mismatches[:10]}"))

    special_units = {"거소투표", "관외사전투표", "잘못 투입·구분된 투표지"}
    global_total = frame[(frame["읍면동명"].isna() | frame["읍면동명"].eq("")) & frame["개표단위"].eq("합계")]
    component = frame[
        ((frame["읍면동명"].notna() & frame["읍면동명"].ne("")) & frame["개표단위"].eq("계"))
        | (frame["개표단위"].isin(special_units))
    ]
    aggregate_mismatch = []
    if len(global_total) == 1:
        for column in ["선거인수", "투표수"]:
            expected = component[column].sum(min_count=1)
            actual = global_total.iloc[0][column]
            if pd.notna(expected) and pd.notna(actual) and expected != actual:
                aggregate_mismatch.append(f"{column}:{actual}!={expected}")
    else:
        aggregate_mismatch.append(f"global_total_rows={len(global_total)}")
    checks.append(_check(dataset, "district_total_reconciliation", not aggregate_mismatch, f"mismatches={aggregate_mismatch}"))
    return checks


def audit_songpa_council(path: Path) -> list[Check]:
    dataset = "songpa_2026_council_result"
    if not path.exists():
        return [_skip(dataset, "file_exists", f"missing: {path}")]
    frame = pd.read_csv(path, dtype=str)
    required = [
        "선거구코드", "선거구명", "읍면동명", "개표단위", "선거인수", "투표수",
        "정당명", "후보명", "후보별득표수", "후보득표계", "무효투표수", "기권자수",
        "당락결과", "출처URL",
    ]
    checks = [_required_columns(dataset, frame, required)]
    if checks[0].status == "fail":
        return checks

    numeric = ["선거인수", "투표수", "후보별득표수", "후보득표계", "무효투표수", "기권자수"]
    frame = _numbers(frame, numeric)
    checks.append(_check(dataset, "district_coverage", frame["선거구코드"].nunique() == 10, f"districts={frame['선거구코드'].nunique()}"))
    duplicates = frame.duplicated(["선거구코드", "읍면동명", "개표단위", "정당명", "후보명"], keep=False).sum()
    checks.append(_check(dataset, "unique_candidate_unit_rows", duplicates == 0, f"duplicate_rows={duplicates}"))

    voted = frame[frame["개표단위"].ne("무투표당선")].copy()
    unit_key = ["선거구코드", "읍면동명", "개표단위"]
    common_inconsistent = []
    for column in ["선거인수", "투표수", "후보득표계", "무효투표수", "기권자수"]:
        bad = voted.groupby(unit_key, dropna=False)[column].nunique(dropna=True)
        if (bad > 1).any():
            common_inconsistent.append(column)
    checks.append(_check(dataset, "common_fields_consistent_across_candidates", not common_inconsistent, f"inconsistent={common_inconsistent}"))

    grouped = voted.groupby(unit_key, dropna=False).agg(
        candidate_sum=("후보별득표수", "sum"),
        candidate_total=("후보득표계", "first"),
        votes=("투표수", "first"),
        invalid=("무효투표수", "first"),
        electors=("선거인수", "first"),
        abstention=("기권자수", "first"),
    ).reset_index()
    candidate_bad = grouped[grouped["candidate_sum"].ne(grouped["candidate_total"])]
    checks.append(_check(dataset, "candidate_sum_equals_candidate_total", candidate_bad.empty, f"mismatches={len(candidate_bad)}"))
    vote_bad = grouped[grouped["votes"].ne(grouped["candidate_total"] + grouped["invalid"])]
    checks.append(_check(dataset, "votes_equal_valid_plus_invalid", vote_bad.empty, f"mismatches={len(vote_bad)}"))
    elector_rows = grouped.dropna(subset=["electors", "votes", "abstention"])
    elector_bad = elector_rows[elector_rows["electors"].ne(elector_rows["votes"] + elector_rows["abstention"])]
    checks.append(_check(dataset, "electors_equal_votes_plus_abstention", elector_bad.empty, f"mismatches={len(elector_bad)}"))

    districts_without_outside = []
    for district, group in voted.groupby("선거구코드"):
        if not group["개표단위"].eq("관외사전투표").any():
            districts_without_outside.append(str(district))
    checks.append(_check(dataset, "outside_advance_vote_preserved_by_district", not districts_without_outside, f"missing={districts_without_outside}"))
    return checks


def audit_national_turnout(path: Path, codes_path: Path) -> list[Check]:
    dataset = "national_dong_turnout"
    if not path.exists():
        return [_skip(dataset, "file_exists", f"missing: {path}")]
    frame = pd.read_csv(path)
    required = ["시도", "구시군", "동", "선거인수", "투표수", "당일투표율", "50%초과", "부족추정", "cityCode", "townCode"]
    checks = [_required_columns(dataset, frame, required)]
    if checks[0].status == "fail":
        return checks

    duplicates = frame.duplicated(["cityCode", "townCode", "동"], keep=False).sum()
    checks.append(_check(dataset, "unique_dong_rows", duplicates == 0, f"duplicate_rows={duplicates}"))
    calculated_rate = (frame["투표수"] / frame["선거인수"] * 100).round(2)
    rate_bad = (calculated_rate - frame["당일투표율"]).abs() > 0.011
    checks.append(_check(dataset, "turnout_rate_formula", not rate_bad.any(), f"mismatches={int(rate_bad.sum())}"))
    expected_over = frame["당일투표율"] > 50
    over_bad = expected_over.ne(frame["50%초과"].eq("Y"))
    checks.append(_check(dataset, "over_50_flag_formula", not over_bad.any(), f"mismatches={int(over_bad.sum())}"))

    # The collector uses JavaScript Math.round, which rounds positive .5 upward.
    shortage_gap = (frame["투표수"] - frame["선거인수"] * 0.5).clip(lower=0)
    expected_shortage = (shortage_gap + 0.5).astype(int)
    shortage_bad = expected_shortage.ne(frame["부족추정"])
    checks.append(_check(dataset, "shortage_proxy_formula", not shortage_bad.any(), f"mismatches={int(shortage_bad.sum())}"))

    collected_towns = frame[["cityCode", "townCode"]].drop_duplicates().shape[0]
    if codes_path.exists():
        codes = json.loads(codes_path.read_text(encoding="utf-8-sig"))
        expected_towns = sum(len(city.get("towns", [])) for city in codes)
        complete = collected_towns == expected_towns
        checks.append(_check(dataset, "national_town_coverage", complete, f"collected={collected_towns}, expected={expected_towns}", severity="warning"))
    else:
        checks.append(_skip(dataset, "national_town_coverage", "national_codes.json missing"))
    return checks


def audit_vote_progress(path: Path) -> list[Check]:
    dataset = "nec_vote_progress_2026"
    if not path.exists():
        return [_skip(dataset, "file_exists", f"missing: {path}")]
    frame = pd.read_csv(path, dtype=str)
    required = [
        "시도", "조회시간", "구시군명", "선거일투표_선거인수", "사전투표_선거인수",
        "합계_선거인수", "선거일_투표자수", "사전투표_접수수", "합계_투표자수", "투표율", "출처URL",
    ]
    checks = [_required_columns(dataset, frame, required)]
    if checks[0].status == "fail":
        return checks

    duplicates = frame.duplicated(["시도", "조회시간", "구시군명"], keep=False).sum()
    checks.append(_check(dataset, "unique_scope_time_rows", duplicates == 0, f"duplicate_rows={duplicates}"))
    numeric = [
        "선거일투표_선거인수", "사전투표_선거인수", "합계_선거인수",
        "선거일_투표자수", "사전투표_접수수", "합계_투표자수",
    ]
    frame = _numbers(frame, numeric)
    elector_bad = frame["합계_선거인수"].ne(frame["선거일투표_선거인수"] + frame["사전투표_선거인수"])
    voter_bad = frame["합계_투표자수"].ne(frame["선거일_투표자수"] + frame["사전투표_접수수"])
    checks.append(_check(dataset, "voter_roll_identity", not elector_bad.any(), f"mismatches={int(elector_bad.sum())}"))
    checks.append(_check(dataset, "voter_count_identity", not voter_bad.any(), f"mismatches={int(voter_bad.sum())}"))

    hour = pd.to_numeric(frame["조회시간"].str.extract(r"(\d+)")[0], errors="coerce")
    timed = frame[hour.between(7, 18)].copy()
    timed["hour"] = hour[hour.between(7, 18)]
    monotonic_bad = 0
    for _, group in timed.sort_values("hour").groupby(["시도", "구시군명"]):
        if (group["합계_투표자수"].diff().dropna() < 0).any():
            monotonic_bad += 1
    checks.append(_check(dataset, "cumulative_voters_monotonic", monotonic_bad == 0, f"groups_with_decrease={monotonic_bad}"))
    return checks


def audit_shortages(path: Path) -> list[Check]:
    dataset = "shortage_2026"
    if not path.exists():
        return [_skip(dataset, "file_exists", f"missing: {path}")]
    frame = pd.read_csv(path)
    checks = [_required_columns(dataset, frame, ["시도", "구시군", "읍면동", "투표소명", "실제부족여부", "투표중단여부", "출처URL"])]
    checks.append(_check(dataset, "official_additional_sent_count", len(frame) == 67, f"rows={len(frame)}"))
    actual = frame["실제부족여부"].astype(str).str.lower().eq("true").sum()
    checks.append(_check(dataset, "official_actual_shortage_count", actual == 50, f"actual_shortage={actual}"))
    unused = frame["실제부족여부"].astype(str).str.lower().eq("false").sum()
    checks.append(_check(dataset, "official_unused_sent_count", unused == 17, f"unused_sent={unused}"))
    missing_sources = frame["출처URL"].isna().sum() + frame["출처URL"].astype(str).str.strip().eq("").sum()
    checks.append(_check(dataset, "source_url_present", missing_sources == 0, f"missing_sources={missing_sources}"))
    named = frame["투표소명"].notna().sum()
    checks.append(_check(dataset, "named_polling_place_coverage", named == 67, f"named={named}/67", severity="warning"))
    return checks


def audit_shutdown_stress_test(path: Path) -> list[Check]:
    dataset = "shutdown_stress_test_2026"
    if not path.exists():
        return [_skip(dataset, "file_exists", f"missing: {path}")]
    payload = json.loads(path.read_text(encoding="utf-8"))
    official = payload.get("official_shutdown", {})
    reported = payload.get("reported_events", [])
    candidates = payload.get("model_candidates", [])
    known = payload.get("known_locations", [])
    checks = [
        _check(dataset, "official_shutdown_total", official.get("합계") == 22, f"total={official.get('합계')}"),
        _check(dataset, "official_shutdown_gu_count", len(official) - int("합계" in official) == 5, f"gu={len(official) - int('합계' in official)}"),
        _check(dataset, "media_reported_shutdown_locations", sum(item.get("evidence_level") == "media_reported_shutdown" for item in reported) == 3, f"reported={len(reported)}"),
        _check(dataset, "local_nec_reported_delay_locations", sum(item.get("evidence_level") == "local_nec_reported_delay" for item in reported) == 2, f"reported={len(reported)}"),
        _check(dataset, "media_reported_delay_locations", sum(item.get("evidence_level") == "media_reported_delay" for item in reported) == 2, f"reported={len(reported)}"),
        _check(dataset, "reported_event_sources_present", all(item.get("source_url") and item.get("source_actor") for item in reported), f"reported={len(reported)}"),
        _check(dataset, "candidate_evidence_level_present", all(item.get("evidence_level") for item in candidates), f"candidates={len(candidates)}"),
        _check(dataset, "known_location_source_present", all(item.get("출처URL") for item in known), f"known={len(known)}"),
        _check(
            dataset,
            "candidate_polling_place_count_matches",
            all(item.get("polling_place_count") == len(item.get("polling_places", [])) for item in candidates),
            f"candidates={len(candidates)}",
        ),
    ]
    return checks


def audit_known_location_mapping(path: Path) -> list[Check]:
    dataset = "known_location_margin_mapping_2026"
    if not path.exists():
        return [_skip(dataset, "file_exists", f"missing: {path}")]
    frame = pd.read_csv(path)
    required = [
        "구시군", "읍면동", "투표소명", "증거수준", "선거종류", "선거구코드",
        "선거구명", "표차", "검토등급", "위치출처URL", "결과출처URL", "해석제한",
    ]
    checks = [_required_columns(dataset, frame, required)]
    if checks[0].status == "fail":
        return checks
    named = frame["투표소명"].nunique()
    checks.extend([
        _check(dataset, "all_named_locations_covered", named == 16, f"named={named}/16"),
        _check(dataset, "all_rows_mapped_to_district", frame["선거구코드"].notna().all(), f"mapped={frame['선거구코드'].notna().sum()}/{len(frame)}"),
        _check(dataset, "all_rows_have_margin", frame["표차"].notna().all(), f"margin={frame['표차'].notna().sum()}/{len(frame)}"),
        _check(dataset, "source_urls_present", frame[["위치출처URL", "결과출처URL"]].notna().all().all(), "location and result sources"),
        _check(dataset, "no_duplicate_location_district", not frame.duplicated(["투표소명", "선거종류", "선거구코드"]).any(), f"duplicates={frame.duplicated(['투표소명', '선거종류', '선거구코드']).sum()}"),
    ])
    return checks


def historical_context() -> dict:
    try:
        from src.analysis.historical_baseline import build_songpa_historical_baseline

        history, _ = build_songpa_historical_baseline()
    except Exception as exc:
        return {"status": "unavailable", "reason": str(exc)}

    rows = []
    for year, group in history.groupby("year"):
        rows.append(
            {
                "year": int(year),
                "dongs": int(len(group)),
                "dongsOver50PercentDemand": int((group["electionDayDemandRatio"] > 0.5).sum()),
                "maxElectionDayDemandRatio": round(float(group["electionDayDemandRatio"].max()), 4),
                "minimumMarginAt50": int(group["marginAt50"].min()),
            }
        )
    current_path = RAW_DIR / "national_dong_turnout.csv"
    if current_path.exists():
        current = pd.read_csv(current_path)
        songpa = current[(current["시도"] == "서울특별시") & (current["구시군"] == "송파구")]
        if not songpa.empty:
            rows.append(
                {
                    "year": 2026,
                    "dongs": int(len(songpa)),
                    "dongsOver50PercentDemand": int(songpa["50%초과"].eq("Y").sum()),
                    "maxElectionDayDemandRatio": round(float(songpa["당일투표율"].max()) / 100, 4),
                    "minimumMarginAt50": -int(songpa["부족추정"].max()),
                }
            )
    return {
        "status": "available",
        "interpretation": (
            "과거 선거에서 문제가 없었다는 사실은 공개자료만으로 단정할 수 없다. "
            "2018년에도 송파구 일부 동의 선거일 수요가 50%를 넘었으므로, 50% 하한과 "
            "실제 투표소별 배부량은 같은 값이 아니었을 가능성이 크다. 실제 배부량과 "
            "비상공급 기록을 확보해야 연도별 차이의 원인을 설명할 수 있다."
        ),
        "years": rows,
    }


def run_audit(fail_on_error: bool = False) -> dict:
    checks: list[Check] = []
    checks.extend(audit_songpa_mayor(RAW_DIR / "songpa_2026_mayor_result.csv"))
    checks.extend(audit_songpa_council(RAW_DIR / "songpa_2026_result.csv"))
    checks.extend(audit_national_turnout(RAW_DIR / "national_dong_turnout.csv", RAW_DIR / "national_codes.json"))
    checks.extend(audit_vote_progress(RAW_DIR / "nec_vote_progress_2026.csv"))
    checks.extend(audit_shortages(RAW_DIR / "shortage_2026.csv"))
    checks.extend(audit_shutdown_stress_test(PROCESSED_DIR / "dashboard" / "shutdown_stress_test_2026.json"))
    checks.extend(audit_known_location_mapping(PROCESSED_DIR / "known_location_margin_mapping_2026.csv"))

    failures = [check for check in checks if check.status == "fail"]
    errors = [check for check in failures if check.severity == "error"]
    warnings = [check for check in failures if check.severity == "warning"]
    report = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "summary": {
            "checks": len(checks),
            "passed": sum(check.status == "pass" for check in checks),
            "failed": len(failures),
            "errors": len(errors),
            "warnings": len(warnings),
            "skipped": sum(check.status == "skip" for check in checks),
        },
        "checks": [asdict(check) for check in checks],
        "historicalContext": historical_context(),
        "nextExpansionGate": (
            "전국 분석 전 national_town_coverage를 통과시키고, 각 구시군별 동 수와 "
            "합계 대조를 통과한 데이터만 분석 테이블로 승격한다."
        ),
    }

    json_path = PROCESSED_DIR / "pipeline_audit.json"
    if json_path.exists():
        existing = json.loads(json_path.read_text(encoding="utf-8"))
        existing_comparable = {key: value for key, value in existing.items() if key != "generatedAt"}
        report_comparable = {key: value for key, value in report.items() if key != "generatedAt"}
        if existing_comparable == report_comparable:
            report["generatedAt"] = existing.get("generatedAt", report["generatedAt"])

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    markdown_path = PROCESSED_DIR / "pipeline_audit.md"
    markdown_path.write_text(render_markdown(report), encoding="utf-8")

    if fail_on_error and errors:
        raise RuntimeError(f"Pipeline audit failed with {len(errors)} error(s). See {json_path}")
    return report


def render_markdown(report: dict) -> str:
    summary = report["summary"]
    lines = [
        "# 데이터 파이프라인 검증 보고서",
        "",
        f"- 생성: {report['generatedAt']}",
        f"- 검사: {summary['checks']}개",
        f"- 통과: {summary['passed']}개",
        f"- 오류: {summary['errors']}개",
        f"- 경고: {summary['warnings']}개",
        "",
        "## 검사 결과",
        "",
        "| 데이터셋 | 검사 | 상태 | 심각도 | 상세 |",
        "|---|---|---|---|---|",
    ]
    for check in report["checks"]:
        detail = str(check["detail"]).replace("|", "/")
        lines.append(f"| {check['dataset']} | {check['check']} | {check['status']} | {check['severity']} | {detail} |")
    lines.extend([
        "",
        "## 과거 선거 비교 해석",
        "",
        report["historicalContext"].get("interpretation", report["historicalContext"].get("reason", "")),
    ])
    for year in report["historicalContext"].get("years", []):
        lines.append(
            f"- {year['year']}: {year['dongs']}개 동, 50% 초과 {year['dongsOver50PercentDemand']}개 동, "
            f"최대 선거일 수요율 {year['maxElectionDayDemandRatio']:.1%}, "
            f"50% 기준 최소 여유 {year['minimumMarginAt50']:,}장"
        )
    lines.extend([
        "",
        "## 전국 확장 조건",
        "",
        report["nextExpansionGate"],
        "",
    ])
    return "\n".join(lines)
