# 배포 전 정리 체크리스트

## 기본 원칙

- `dashboard/public/data`는 Vercel이 실제 제공하는 정적 데이터다.
- 화면·검증 코드·수집기·재생성 데이터는 가능한 한 별도 커밋으로 관리한다.
- 배포 전에 엄격 검증과 프로덕션 빌드를 모두 통과시킨다.

## 변경 묶음

### 1. 화면과 문서 표현

- 송파구 수치를 전국 수치처럼 읽히지 않도록 범위를 명시한다.
- `배분이 틀렸다`, `50%를 넘으면 부족하다` 같은 단정 표현을 검토 필요 표현으로 바꾼다.
- 전국 수집 대상은 256개 구시군으로 통일한다.

### 2. 데이터 파이프라인 검증

- `validate_pipeline.py`
- `src/validate/pipeline_audit.py`
- `docs/DATA_PIPELINE.md`
- `data/processed/pipeline_audit.json`
- `data/processed/pipeline_audit.md`

### 3. 수집 및 분석 기준 수정

- 동별 2026 수요는 구의원 결과가 아니라 구청장 결과를 사용한다.
- 전국 코드 수집에서 드롭다운 선택 항목을 제외한다.
- 부족 추정값은 정수 원자료로 직접 계산한다.

### 4. 재생성 데이터

- `phase2_prototype.py` 및 `run_pipeline.py` 실행으로 변경된 CSV/JSON이다.
- 코드 변경과 별도 커밋으로 분리하는 것이 좋다.
- `sensitivity_detail.json`은 약 13MB이므로 배포 필요 여부를 다시 확인한다.

## 현재 파이프라인의 남은 구조적 문제

현재 대시보드가 직접 읽는 다음 파일은 저장소에 존재하지만, 모두를 재생성하는 단일
빌드 스크립트는 없다.

- `songpa_2026_actuals.json`
- `dong_analysis_2026.json`
- `vote_progress_timeline_2026.json`
- `retally_analysis.json`
- `seoul_analysis_2026.json`
- `yearly_comparison.json`

반면 `run_pipeline.py`가 생성하는 기존 민감도 분석 JSON 대부분은 현재
`Dashboard.jsx`가 읽지 않는다. 다음 배포 이후에는 현재 화면용 JSON 생성기를 하나로
통합해야 한다.

## 권장 변경 순서

1. `fix: clarify dashboard scope and claims`
2. `feat: add data pipeline audit`
3. `fix: use mayor results and correct national collectors`
4. `data: regenerate validated dashboard artifacts`
