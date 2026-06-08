# 후보별 득표 동일 패턴 분석

## 목적

언론 보도에서 제기된 관내사전투표 후보별 득표수 동일 사례를 선관위 공개 원자료 기준으로 재현하고, 같은 기준을 전국 광역단체장 선거에 확장해 스캔한다.

이 분석은 동일하거나 유사한 득표 패턴을 **추가 검토 후보**로 찾기 위한 것이다. 동일 패턴 자체는 오류, 조작, 부정의 증거가 아니다.

## 현재 구현

- 수집: `scripts/collect_vote_pattern_results.cjs`
- 샤드 병합: `scripts/merge_vote_pattern_results.py`
- 분석: `scripts/analyze_vote_pattern_results.py`
- 파일럿 원자료: `data/raw/vote_pattern_results_2026_pilot.csv`
- 전국 원자료: `data/raw/vote_pattern_results_2026_national_metro.csv`
- 공개 JSON:
  - `dashboard/public/data/vote_pattern_duplicates_2026_pilot.json`
  - `dashboard/public/data/vote_pattern_duplicates_2026_national_metro.json`

`data/raw/`는 git에 올리지 않는다. 공개/배포 대상은 해석 제한이 포함된 JSON 산출물이다.

## 분석 단위

- 선거: 제9회 전국동시지방선거
- 화면: 중앙선관위 `VCCP08` 개표 단위별 후보자 득표
- 단위: 읍면동별 `관내사전투표`
- 비교 1: 전체 후보 득표 벡터 동일
- 비교 2: 주요 2후보 득표 벡터 동일

## 현재 결과

파일럿 범위는 송파구 서울시장·송파구청장, 연수구 인천시장, 보도에 등장한 전남·광주 지역을 포함한다.

전국 광역단체장 스캔 결과:

- 원자료 행: 38,487
- 관내사전투표 벡터: 3,558
- 전체 후보 득표 벡터 동일: 0건
- 주요 2후보 득표 벡터 동일: 4건

주요 2후보 동일 4건:

- 인천광역시 연수구 송도1동 / 연수구 송도2동: `3030 | 1440`
- 전라남도 보성군 노동면 / 신안군 팔금면: `356 | 42`
- 전라남도 신안군 하의면 / 여수시 삼일동: `506 | 42`
- 전라남도 장성군 북하면 / 함평군 엄다면: `606 | 57`

파이낸스투데이 기사에는 `여수시 상일동`으로 표기되어 있으나, 선관위 원자료에서 `506 | 42`에 대응되는 지역은 `여수시 삼일동`으로 확인된다.

## 실행 예시

파일럿:

```powershell
$env:SCOPE='pilot'
node scripts/collect_vote_pattern_results.cjs
python scripts/analyze_vote_pattern_results.py
```

전국 광역단체장 4샤드:

```powershell
$env:SCOPE='national_metro'
$env:SHARD_COUNT='4'
$env:SHARD_INDEX='0'; node scripts/collect_vote_pattern_results.cjs
$env:SHARD_INDEX='1'; node scripts/collect_vote_pattern_results.cjs
$env:SHARD_INDEX='2'; node scripts/collect_vote_pattern_results.cjs
$env:SHARD_INDEX='3'; node scripts/collect_vote_pattern_results.cjs
python scripts/merge_vote_pattern_results.py
python scripts/analyze_vote_pattern_results.py
```

## 해석 제한

- 동일 득표 벡터는 통계적 이례성의 출발점일 수 있지만, 그 자체로 오류나 부정을 증명하지 않는다.
- 주요 2후보 벡터는 나머지 후보, 무효표, 전체 투표수까지 같은지를 보지 않는다.
- 더 강한 검토를 하려면 전체 후보 벡터, 투표수, 선거인수, 무효표, 시간대별 투표율, 투표소별 로그 등 추가 자료가 필요하다.
