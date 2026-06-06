# 전국 야간 수집 (완료 기록)

> 현재 수집은 완료됐다. 최신 결과와 다음 우선순위는 `docs/CURRENT_STATUS.md`를 따른다.

전국 광역·기초의원 당선권 경계 표차와 시도별 시간대 투표 진행 현황을 병렬 워커로
수집한 당시 실행 기록이다.

## 당시 실행 워커

- 표차 수집: `SCOPE=national`, 3개 워커
- 시간대별 투표율: `NATIONAL=1`, 3개 워커
- 각 워커는 별도 체크포인트·로그·산출물을 사용한다.
- 선관위 서버 부하를 고려하여 워커 수를 3개로 제한한다.

## 상태 확인

```powershell
Get-Process node
Get-ChildItem data/raw/*checkpoint*worker*
Get-Content data/raw/national_margin_worker_0.stderr.log -Tail 30
```

## 완료 후 병합

```bash
python scripts/merge_national_overnight.py
```

병합 전에는 워커 산출물을 대시보드에 연결하거나 공개 배포하지 않는다.
