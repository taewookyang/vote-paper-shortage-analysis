# Claude 인계 메모 (2026-06-06 보관본)

> 이 문서는 당시 작업 상태를 보존한 기록이다. 현재 상태와 우선순위는
> `docs/CURRENT_STATUS.md` 및 `docs/DASHBOARD_EDITORIAL_GUIDE.md`를 따른다.

기준일: 2026-06-06

## 현재 상태

- 송파구 파일럿과 서울 25개 구 분석은 유지된다.
- 부족 발생 27개 구시군의 광역·기초의원 212개 선거구를 추가 수집했다.
- 다인 선거구는 마지막 당선자와 첫 낙선자의 표차를 사용한다.
- 500표 이하 선거구는 19개다.
- 이 결과는 영향 확인이 아니라 추가 사실조사 우선순위다.

## 주요 커밋

- `36a9a02 feat: prepare geographic Songpa map`
- `f7e12dd feat: screen margins in shortage jurisdictions`

## 새 파일

- `scripts/collect_targeted_margins.cjs`
  - 추가 송부 발생 구시군의 광역·기초의원 결과 수집
  - 체크포인트, 재시도, 지역 단위 재개, 무투표 선거구 처리
- `data/processed/targeted_margin_screening_2026.csv`
- `dashboard/public/data/targeted_margin_screening_2026.json`
- `docs/TARGETED_MARGIN_SCREENING.md`
- `docs/MAP_DATA_DECISION.md`

## 지도 경계 데이터

- `vuski/admdongkor` 사용 조건 문의: https://github.com/vuski/admdongkor/issues/14
- 답변 전까지 경계 데이터 산출물을 저장소나 배포본에 포함하지 않는다.
- 지도 데이터가 없으면 송파구 27개 동 막대그래프를 표시한다.

## 중요한 해석 제한

- 67개 추가 송부 중 상세 투표소명이 확인된 것은 일부뿐이다.
- 표차가 작은 선거구에 실제 부족 투표소가 포함됐는지는 투표소명·읍면동 공개 후 별도 매핑해야 한다.
- 실제 투표 포기 인원과 중단 시간 기록이 없으므로 선거 결과 영향을 단정하지 않는다.

## 다음 우선순위

1. 언론·선관위 후속 공개자료에서 67개 투표소 상세 명단과 22개 중단 기록 보강
2. 상세 투표소를 광역·기초의원 선거구에 실제 매핑
3. 지도 데이터 라이선스 답변 후 전국/송파 경계 지도 활성화
4. 현재 화면용 JSON을 단일 빌드 파이프라인으로 통합

## 검증 명령

```bash
python validate_pipeline.py --strict
cd dashboard
npm run build
npm run dev:local
```
