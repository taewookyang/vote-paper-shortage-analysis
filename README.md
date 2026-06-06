# 투표용지 부족 사태 데이터 검증

2026년 6·3 지방선거 투표용지 부족 사태를 **선관위 공개 데이터만으로** 직접 크롤링·검증한 시민 데이터 프로젝트.

**대시보드:** https://dashboard-weld-eight-19.vercel.app  
**저장소:** https://github.com/taewookyang/vote-paper-shortage-analysis

---

## 핵심 발견

| 항목 | 수치 | 검증 방법 |
|------|------|----------|
| 송파구 부족 투표소 | 14곳 | 선관위 브리핑 |
| 구 전체 잉여 용지 | **+42,774장** | VCCP08 직접 크롤링 |
| 50% 한도 초과 동 | 6개 동 | VCCP08 직접 크롤링 |
| 사전·당일 투표율 상관계수 | **−0.46** | 27개 동 전수 계산 |
| 13시 투표율 급등 | 19.6% → 47.1% | VCVP01 직접 크롤링 |

**역설:** 총량이 부족한 게 아니었다. 균일 50% 배분 + 사전투표율 차이가 문제였다.

---

## 왜 부족했나

1. **선관위 내부 지침**: 지방선거 투표용지는 선거인의 50%만 인쇄 (법적 기준 없음)
2. **50%가 최솟값이자 실제 적용값**: 안전 여유 없음
3. **사전투표율이 낮은 동**: 선거일 당일 사람이 몰려 50% 초과
4. **13시**: 사전투표 132,194명이 집계에 합산되는 시점 → 고투표율 투표소 용지 소진

---

## 재투표 가능성

- **선거소청 기한**: 2026.6.17 (선거일 + 14일, 공직선거법 제219조)
- 표차가 가장 좁은 마선거구(표차 2,405)에 잠실2동·잠실7동 부족 투표소 포함
- 법적 현실: 제198조 '부득이한 사유' 요건이 배분 실수에 적용되는지 판례 없음
- **현실적 경로**: 선거소청 제기 + 공직선거법 개정 촉구

---

## 데이터 출처

- **VCVP01** (투표진행현황): 시간대별 투표율
- **VCCP08** (개표결과): 동별 선거인수·선거일투표수

모든 크롤링 스크립트 공개 (`scripts/` 폴더).

---

## 실행 방법

```bash
# 의존성 설치
cd dashboard && npm install

# 전국 구시군 코드 수집
node scripts/collect_national_codes.cjs

# 서울 전체 당일투표율 수집 (1100 = 서울)
node scripts/collect_national_turnout.cjs 1100

# 특정 구 (1124 = 송파구)
node scripts/collect_national_turnout.cjs 1100 1124

# 대시보드 개발 서버 (http://127.0.0.1:5179)
npm run dev

# 배포 빌드
npm run build
```

---

## 프로젝트 구조

```
scripts/                           크롤링 스크립트 (Node.js + Playwright)
  collect_national_codes.cjs       전국 18개 시도 274개 구시군 코드 수집
  collect_national_turnout.cjs     전국 동별 선거일투표율 수집
  collect_songpa_2026_mayor.cjs    송파구 구청장 선거 크롤링
  collect_songpa_2026_nec_results.cjs  구의원 득표수 (선거구별 표차)
  collect_nec_vote_progress.cjs    시간대별 투표진행현황 (VCVP01)

data/
  raw/            원시 크롤링 CSV/JSON (gitignore)
  processed/      전처리 완료 데이터

dashboard/
  src/main.jsx               대시보드 (React + Recharts)
  public/data/               정적 JSON 데이터
    songpa_2026_actuals.json     2026 송파구 실측 수치
    dong_analysis_2026.json      27개 동 당일투표율 분석
    vote_progress_timeline_2026.json  시간대별 타임라인
    confirmed_shortages.json     확인된 부족 투표소 8곳
    retally_analysis.json        재투표 가능성 법적·통계 검토
```

---

## 현황

- ✅ **송파구 파일럿** — 27개 동 완전 분석, 구의원 선거구 표차, 재투표 가능성 검토
- 🔄 **서울 25개 구** 크롤링 중 (선거일투표율 기준 수정 후 재수집)
- ⬜ **전국 274개 구시군** 확장 예정 (히트맵 + 위험도 지도)

---

## 면책 조항

이 프로젝트는 **선거 결과(당락)를 단정하지 않습니다.**

- 부정선거·조작 주장의 근거가 아닙니다
- 특정 정당·후보 유불리를 분석하지 않습니다
- 선관위의 고의성을 단정하지 않습니다
- 모든 수치는 공개 데이터 기반이며 추정은 명시합니다
- **목적**: 투표용지 수급 제도의 구조적 문제를 데이터로 검증하고 개선 논의를 촉진
