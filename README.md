# 투표용지 부족 사태 데이터 분석 대시보드

> 6·3 지방선거 투표용지 수급 관리 제도의 적정성을 공개 데이터로 분석·시각화하는 시민 연구 프로젝트

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## ⚠️ 면책 고지

본 프로젝트는 **투표용지 수급이라는 행정·제도 측면만을 검토**합니다.
- 선거 결과(당락)의 정당성을 다루지 않습니다
- 특정 정당·후보의 유불리를 분석하지 않습니다
- 모든 배부량 추정값은 선관위 내부 지침(50% 하한) 기준 추정치입니다

자세한 내용: [DISCLAIMER.md](DISCLAIMER.md)

## 프로젝트 목적

1. **공론화**: 역대 데이터로 "예견 가능한 위험이었음"을 시각화
2. **법적 보조**: 국가배상 과실 입증 + 헌법 평등원칙 논거 데이터 제공
3. **제도 개선**: 공직선거법 개정 논의를 위한 객관적 근거 제공

## 빠른 시작

```bash
# 환경 설정
pip install -r requirements.txt
cp .env.example .env  # NEC_API_KEY 입력

# 데이터 수집 (송파구 샘플)
python -m src.collectors.nec_api

# 모델 실행
jupyter lab notebooks/
```

## 데이터 소스

공공데이터포털(data.go.kr) API + 행정안전부 공개 데이터.
전체 목록: [data/sources.md](data/sources.md)

## 방법론

[METHODOLOGY.md](METHODOLOGY.md) 참조.
모든 추정값에 신뢰구간 포함, 낮은 정확도도 그대로 공개.

## 디렉터리 구조

```
vote-paper-shortage-analysis/
├── data/           데이터 (raw/processed)
├── notebooks/      분석 노트북
├── src/            파이썬 모듈
│   ├── collectors/ API 수집
│   ├── models/     M1~M3 모델
│   └── validators/ Backtesting
└── dashboard/      React 대시보드
```
