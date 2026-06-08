# 2026 지방선거 NEC 원자료 미러

이 인벤토리는 로컬에 보유한 원자료 범위와 공백을 표시한다. 분석 결과나 선거 영향 판단이 아니다.

## 요약

- 데이터셋: 19개
- 목표 범위 데이터셋: 8개
- 참고/레거시 데이터셋: 11개
- 현재 목표 기준 완성: 8개
- 목표 기준 부분 수집: 0개
- 목표 기준 누락: 0개
- 참고 항목 부분/누락: 9 / 1
- 총 로컬 크기: 127,787,227 bytes

## 다음 수집 우선순위

- 후보득표·사전투표·투표진행·선거인명부·투표소·매핑 전국 미러의 행수와 범위를 정기 감사한다.
- BIPB02 선거인명부 raw 행은 행 병합 구조가 있어 별도 정규화 전까지 해석을 제한한다.
- 전국 매핑은 VCCP08 관측 선거구-읍면동 조합이며 법정 행정구역 매핑과 동일하다고 단정하지 않는다.
- 레거시 부분 수집물은 참고용으로 유지하되 목표 완료 판정에는 전국 미러 항목을 사용한다.

## 데이터셋

### 전국 시도/구시군 코드

- 상태: `complete_for_current_goal`
- 파일: `data/raw/national_codes.json`
- 현재 범위: 전국 구시군
- 목표 범위: 전국 구시군
- 목표 판정 포함: True
- 행/컬럼/크기: 17 / None / 19368
- 비고: -

### 시간대별 투표진행상황

- 상태: `complete_for_current_goal`
- 파일: `data/raw/nec_vote_progress_national_2026.csv`
- 현재 범위: 전국 시도/구시군 시간대
- 목표 범위: 전국 시도/구시군 시간대
- 목표 판정 포함: True
- 행/컬럼/크기: 3511 / 12 / 548513
- 비고: 투표소 단위가 아니라 구시군 단위로 보는 것이 안전함

### 시간대별 투표진행상황 기본 수집

- 상태: `partial`
- 파일: `data/raw/nec_vote_progress_2026.csv`
- 현재 범위: 전국+서울 기본 수집
- 목표 범위: 전국 시도/구시군 시간대
- 목표 판정 포함: False
- 행/컬럼/크기: 572 / 12 / 91919
- 비고: 초기 기본 수집 산출물. 전국 시간대 미러는 vote_progress_national 사용

### 전국 사전투표 진행상황 시간대

- 상태: `complete_for_current_goal`
- 파일: `data/raw/nec_prevote_2026_national.csv`
- 현재 범위: 전국/시도별 날짜 1·2·누계 및 07-18시 시간대
- 목표 범위: 전국/시도별 날짜 1·2·누계 및 07-18시 시간대
- 목표 판정 포함: True
- 행/컬럼/크기: 11134 / 12 / 2385604
- 비고: 2일차누계의 전체(time=0)는 NEC 화면에서 제공되지 않아 07-18시 누계만 보존

### 사전투표 진행상황

- 상태: `partial`
- 파일: `data/raw/nec_prevote_2026.csv`
- 현재 범위: 전국+서울 일부 날짜/시간
- 목표 범위: 전국 시도/구시군 날짜/시간
- 목표 판정 포함: False
- 행/컬럼/크기: 220 / 8 / 37418
- 비고: 현재 스크립트는 전국+서울 중심. 전국 전체 날짜/시간 샤딩 확장 필요

### 읍면동 선거인수/선거일 투표수

- 상태: `complete_for_current_goal`
- 파일: `data/raw/national_dong_turnout.csv`
- 현재 범위: 전국 구시군 읍면동
- 목표 범위: 전국 구시군 읍면동
- 목표 판정 포함: True
- 행/컬럼/크기: 3558 / 10 / 241909
- 비고: 투표용지 50% 기준과 본투표 수요 분석의 핵심

### 전국 전체 선거종류 후보별 개표단위 득표

- 상태: `complete_for_current_goal`
- 파일: `data/raw/nec_candidate_results_2026_national_all.csv`
- 현재 범위: 전국 모든 선거종류
- 목표 범위: 전국 모든 선거종류
- 목표 판정 포함: True
- 행/컬럼/크기: 317798 / 18 / 78529999
- 비고: collect_nec_candidate_results_all.cjs 샤드 수집 후 merge_nec_candidate_results.py로 생성

### 전체 후보득표 수집기 smoke 검증

- 상태: `complete_for_current_goal`
- 파일: `data/raw/nec_candidate_results_2026_smoke.csv`
- 현재 범위: 송파구 3개 선거종류 smoke
- 목표 범위: 송파구 3개 선거종류 smoke
- 목표 판정 포함: False
- 행/컬럼/크기: 759 / 18 / 191508
- 비고: 전국 전체 실행 전 수집기 선택/파싱 검증용

### 전국 광역단체장 후보별 개표단위 득표

- 상태: `partial`
- 파일: `data/raw/vote_pattern_results_2026_national_metro.csv`
- 현재 범위: 전국 광역단체장
- 목표 범위: 전국 모든 선거종류
- 목표 판정 포함: False
- 행/컬럼/크기: 38487 / 17 / 9731969
- 비고: 현재는 광역단체장만 완성. 전체 선거종류 확장 필요

### 부족 발생 구시군 후보/표차 타깃 수집

- 상태: `partial`
- 파일: `data/raw/targeted_election_candidates_2026.csv`
- 현재 범위: 부족 발생 구시군 중심
- 목표 범위: 전국 모든 선거종류
- 목표 판정 포함: False
- 행/컬럼/크기: 715 / 14 / 154339
- 비고: 부족 발생 구시군 표적 수집 산출물. 전체 후보득표 미러는 candidate_results_all 사용

### 송파구 기초의원 후보별 득표

- 상태: `partial`
- 파일: `data/raw/songpa_2026_result.csv`
- 현재 범위: 송파구 기초의원
- 목표 범위: 전국 모든 선거종류
- 목표 판정 포함: False
- 행/컬럼/크기: 333 / 18 / 135930
- 비고: 송파구 기초의원 표적 수집 산출물. 전체 후보득표 미러는 candidate_results_all 사용

### 송파구 구청장 후보별 득표

- 상태: `partial`
- 파일: `data/raw/songpa_2026_mayor_result.csv`
- 현재 범위: 송파구 구청장
- 목표 범위: 전국 모든 선거종류
- 목표 판정 포함: False
- 행/컬럼/크기: 85 / 8 / 19506
- 비고: 송파구 구청장 표적 수집 산출물. 전체 후보득표 미러는 candidate_results_all 사용

### 전국 선거구-읍면동 매핑

- 상태: `complete_for_current_goal`
- 파일: `data/raw/district_dong_mapping_2026_national.csv`
- 현재 범위: 전국 광역의원/기초의원 선거구-읍면동
- 목표 범위: 전국 광역의원/기초의원 선거구-읍면동
- 목표 판정 포함: True
- 행/컬럼/크기: 6127 / 10 / 1098713
- 비고: 후보득표 전국 병합본의 선거구명·읍면동명을 고유 조합으로 추출. 행정구역 법정 매핑과 동일하다고 단정하지 않음

### 선거구-읍면동 매핑

- 상태: `partial`
- 파일: `data/raw/district_dong_mapping_2026.csv`
- 현재 범위: 수집된 타깃 구 중심
- 목표 범위: 전국 선거구-읍면동
- 목표 판정 포함: False
- 행/컬럼/크기: 214 / 7 / 39648
- 비고: 초기 타깃 구 중심 매핑. 전국 매핑은 district_dong_mapping_national 사용

### 전국 선거일 투표소 목록

- 상태: `complete_for_current_goal`
- 파일: `data/raw/nec_polling_places_2026_national.csv`
- 현재 범위: 전국 256개 구시군 선거일 투표소
- 목표 범위: 전국 256개 구시군 선거일 투표소
- 목표 판정 포함: True
- 행/컬럼/크기: 14288 / 15 / 8882070
- 비고: collect_nec_polling_places_national.py 체크포인트 수집. 위치/층/주소는 API 원문 필드 기준

### 부족 발생 구시군 투표소 목록

- 상태: `partial`
- 파일: `data/processed/shortage_gu_polling_places.csv`
- 현재 범위: 5개 구 539개 투표소
- 목표 범위: 전국 투표소
- 목표 판정 포함: False
- 행/컬럼/크기: 539 / 9 / 96587
- 비고: 부족 발생 5개 구 참조용 목록. 전국 투표소 미러는 polling_places_national 사용

### 전국 선거인명부 확정상황 원문 행

- 상태: `complete_for_current_goal`
- 파일: `data/raw/nec_voter_roll_2026_national.csv`
- 현재 범위: 전국 256개 구시군 읍면동별 원문 표 행
- 목표 범위: 전국 256개 구시군 읍면동별 원문 표 행
- 목표 판정 포함: True
- 행/컬럼/크기: 49183 / 20 / 25575328
- 비고: 행 병합이 있는 BIPB02 표를 cell_0..cell_N 원문 행으로 보존. 세종/제주는 기초의원선거 해당 없음으로 0행 완료 처리

### 선거인명부 확정상황

- 상태: `missing`
- 파일: `data/raw/nec_voter_roll_2026.csv`
- 현재 범위: 송파구 중심
- 목표 범위: 전국 읍면동/구시군
- 목표 판정 포함: False
- 행/컬럼/크기: None / None / None
- 비고: 현재 파일이 없으면 전국 확장 전 수집기 보강 필요

### 투표용지 부족 라벨

- 상태: `partial`
- 파일: `data/raw/shortage_2026.csv`
- 현재 범위: 67개 추가송부 라벨
- 목표 범위: 공식/언론/추정 분리된 전체 라벨
- 목표 판정 포함: False
- 행/컬럼/크기: 67 / 7 / 6899
- 비고: 투표소명 미확인 항목은 추정하지 않음
