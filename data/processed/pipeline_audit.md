# 데이터 파이프라인 검증 보고서

- 생성: 2026-06-07T01:31:21
- 검사: 42개
- 통과: 41개
- 오류: 0개
- 경고: 1개

## 검사 결과

| 데이터셋 | 검사 | 상태 | 심각도 | 상세 |
|---|---|---|---|---|
| songpa_2026_mayor_result | required_columns | pass | error | missing=[] |
| songpa_2026_mayor_result | songpa_27_dongs | pass | error | dongs=27 |
| songpa_2026_mayor_result | unique_dong_counting_unit | pass | error | duplicate_rows=0 |
| songpa_2026_mayor_result | dong_unit_coverage | pass | error | incomplete_dongs=[] |
| songpa_2026_mayor_result | dong_total_equals_advance_plus_election_day | pass | error | mismatches=[] |
| songpa_2026_mayor_result | district_total_reconciliation | pass | error | mismatches=[] |
| songpa_2026_council_result | required_columns | pass | error | missing=[] |
| songpa_2026_council_result | district_coverage | pass | error | districts=10 |
| songpa_2026_council_result | unique_candidate_unit_rows | pass | error | duplicate_rows=0 |
| songpa_2026_council_result | common_fields_consistent_across_candidates | pass | error | inconsistent=[] |
| songpa_2026_council_result | candidate_sum_equals_candidate_total | pass | error | mismatches=0 |
| songpa_2026_council_result | votes_equal_valid_plus_invalid | pass | error | mismatches=0 |
| songpa_2026_council_result | electors_equal_votes_plus_abstention | pass | error | mismatches=0 |
| songpa_2026_council_result | outside_advance_vote_preserved_by_district | pass | error | missing=[] |
| national_dong_turnout | required_columns | pass | error | missing=[] |
| national_dong_turnout | unique_dong_rows | pass | error | duplicate_rows=0 |
| national_dong_turnout | turnout_rate_formula | pass | error | mismatches=0 |
| national_dong_turnout | over_50_flag_formula | pass | error | mismatches=0 |
| national_dong_turnout | shortage_proxy_formula | pass | error | mismatches=0 |
| national_dong_turnout | national_town_coverage | pass | warning | collected=256, expected=256 |
| nec_vote_progress_2026 | required_columns | pass | error | missing=[] |
| nec_vote_progress_2026 | unique_scope_time_rows | pass | error | duplicate_rows=0 |
| nec_vote_progress_2026 | voter_roll_identity | pass | error | mismatches=0 |
| nec_vote_progress_2026 | voter_count_identity | pass | error | mismatches=0 |
| nec_vote_progress_2026 | cumulative_voters_monotonic | pass | error | groups_with_decrease=0 |
| shortage_2026 | required_columns | pass | error | missing=[] |
| shortage_2026 | official_additional_sent_count | pass | error | rows=67 |
| shortage_2026 | official_actual_shortage_count | pass | error | actual_shortage=50 |
| shortage_2026 | official_unused_sent_count | pass | error | unused_sent=17 |
| shortage_2026 | source_url_present | pass | error | missing_sources=0 |
| shortage_2026 | named_polling_place_coverage | fail | warning | named=16/67 |
| shutdown_stress_test_2026 | official_shutdown_total | pass | error | total=22 |
| shutdown_stress_test_2026 | official_shutdown_gu_count | pass | error | gu=5 |
| shutdown_stress_test_2026 | candidate_evidence_level_present | pass | error | candidates=18 |
| shutdown_stress_test_2026 | known_location_source_present | pass | error | known=16 |
| shutdown_stress_test_2026 | candidate_polling_place_count_matches | pass | error | candidates=18 |
| known_location_margin_mapping_2026 | required_columns | pass | error | missing=[] |
| known_location_margin_mapping_2026 | all_named_locations_covered | pass | error | named=16/16 |
| known_location_margin_mapping_2026 | all_rows_mapped_to_district | pass | error | mapped=31/31 |
| known_location_margin_mapping_2026 | all_rows_have_margin | pass | error | margin=31/31 |
| known_location_margin_mapping_2026 | source_urls_present | pass | error | location and result sources |
| known_location_margin_mapping_2026 | no_duplicate_location_district | pass | error | duplicates=0 |

## 과거 선거 비교 해석

과거 선거에서 문제가 없었다는 사실은 공개자료만으로 단정할 수 없다. 2018년에도 송파구 일부 동의 선거일 수요가 50%를 넘었으므로, 50% 하한과 실제 투표소별 배부량은 같은 값이 아니었을 가능성이 크다. 실제 배부량과 비상공급 기록을 확보해야 연도별 차이의 원인을 설명할 수 있다.
- 2018: 27개 동, 50% 초과 7개 동, 최대 선거일 수요율 55.3%, 50% 기준 최소 여유 -1,501장
- 2022: 27개 동, 50% 초과 0개 동, 최대 선거일 수요율 46.9%, 50% 기준 최소 여유 426장
- 2026: 27개 동, 50% 초과 6개 동, 최대 선거일 수요율 56.7%, 50% 기준 최소 여유 -1,677장

## 전국 확장 조건

전국 분석 전 national_town_coverage를 통과시키고, 각 구시군별 동 수와 합계 대조를 통과한 데이터만 분석 테이블로 승격한다.
