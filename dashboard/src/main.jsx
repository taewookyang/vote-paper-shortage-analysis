import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  FileWarning,
  Scale,
  SlidersHorizontal,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './styles.css'

const DATA_FILES = {
  facts: '/data/facts.json',
  gaps: '/data/source_gaps.json',
  metrics: '/data/metrics.json',
  sensitivity: '/data/sensitivity.json',
  sensitivityDetail: '/data/sensitivity_detail.json',
  shortages: '/data/confirmed_shortages.json',
  places: '/data/polling_places.json',
  emd: '/data/emd_summary.json',
  historical: '/data/historical_baseline.json',
  presidential: '/data/presidential_reference.json',
  layers: '/data/election_layers.json',
  actuals2026: '/data/songpa_2026_actuals.json',
  dongAnalysis: '/data/dong_analysis_2026.json',
  voteTimeline: '/data/vote_progress_timeline_2026.json',
}

const gradeColors = {
  red: '#be123c',
  orange: '#b45309',
  yellow: '#ca8a04',
  green: '#0f766e',
  unknown: '#667085',
}

function App() {
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState({
    supplyRatio: 0.5,
    demandGrowth: 0.1,
    attritionRate: 0.05,
    marginThreshold: 100,
  })

  useEffect(() => {
    Promise.all(
      Object.entries(DATA_FILES).map(([key, url]) =>
        fetch(url).then((response) => {
          if (!response.ok) throw new Error(`${url} fetch failed`)
          return response.json().then((value) => [key, value])
        }),
      ),
    ).then((entries) => setData(Object.fromEntries(entries)))
  }, [])

  const scenario = useMemo(() => {
    if (!data) return null
    return data.sensitivity.scenarios.find(
      (item) =>
        item.supplyRatio === selected.supplyRatio &&
        item.demandGrowth === selected.demandGrowth &&
        item.attritionRate === selected.attritionRate &&
        item.marginThreshold === selected.marginThreshold,
    )
  }, [data, selected])

  const lineData = useMemo(() => {
    if (!data) return []
    return data.sensitivity.scenarios
      .filter(
        (item) =>
          item.attritionRate === selected.attritionRate &&
          item.marginThreshold === selected.marginThreshold &&
          item.demandGrowth === selected.demandGrowth,
      )
      .map((item) => ({
        supply: `${Math.round(item.supplyRatio * 100)}%`,
        '용지 부족 가능': item.possibleShortagePlaces,
        '최소 여유 장수': item.spareBallots.min,
        '수급 압박도': Math.round(item.maxSupplyPressure * 100),
      }))
  }, [data, selected])

  const demandLineData = useMemo(() => {
    if (!data) return []
    return data.sensitivity.scenarios
      .filter(
        (item) =>
          item.attritionRate === selected.attritionRate &&
          item.marginThreshold === selected.marginThreshold &&
          item.supplyRatio === selected.supplyRatio,
      )
      .map((item) => ({
        demand: `+${Math.round(item.demandGrowth * 100)}%`,
        '용지 부족 가능': item.possibleShortagePlaces,
        '최소 여유 장수': item.spareBallots.min,
      }))
  }, [data, selected])

  const selectedDetailByName = useMemo(() => {
    if (!data) return new Map()
    const rows = data.sensitivityDetail.detail.filter(
      (item) =>
        item.scenario_supply_ratio === selected.supplyRatio &&
        item.scenario_demand_growth === selected.demandGrowth &&
        item.scenario_attrition_rate === selected.attritionRate &&
        item.scenario_margin_threshold === selected.marginThreshold,
    )
    return new Map(rows.map((item) => [item.psName, item]))
  }, [data, selected])

  const selectedDetailRows = useMemo(() => {
    if (!data) return []
    return data.sensitivityDetail.detail.filter(
      (item) =>
        item.scenario_supply_ratio === selected.supplyRatio &&
        item.scenario_demand_growth === selected.demandGrowth &&
        item.scenario_attrition_rate === selected.attritionRate &&
        item.scenario_margin_threshold === selected.marginThreshold,
    )
  }, [data, selected])

  const baselineDetailRows = useMemo(() => {
    if (!data) return []
    return data.sensitivityDetail.detail.filter(
      (item) =>
        item.scenario_supply_ratio === 0.5 &&
        item.scenario_demand_growth === 0 &&
        item.scenario_attrition_rate === 0 &&
        item.scenario_margin_threshold === selected.marginThreshold,
    )
  }, [data, selected.marginThreshold])

  const scenarioTotals = useMemo(() => summarizeDetailRows(selectedDetailRows), [selectedDetailRows])
  const baselineTotals = useMemo(() => summarizeDetailRows(baselineDetailRows), [baselineDetailRows])

  const selectedShortageRows = useMemo(() => {
    if (!data) return []
    return data.shortages.items.map((item) => ({
      ...item,
      scenario: selectedDetailByName.get(item.psName),
    }))
  }, [data, selectedDetailByName])

  const emdPriorityRows = useMemo(() => {
    if (!data) return []
    const detailRows = Array.from(selectedDetailByName.values())
    return data.emd.items
      .map((item) => {
        const rows = detailRows.filter((row) => row.emdName === item.emdName)
        const maxPressure = rows.length
          ? Math.max(...rows.map((row) => Number(row.scenario_supply_pressure)))
          : Number(item.maxRiskRatio)
        const minSpare = rows.length
          ? Math.min(...rows.map((row) => Number(row.scenario_spare_ballots)))
          : null
        return {
          ...item,
          currentMaxPressure: maxPressure,
          currentMinSpare: minSpare,
        }
      })
      .sort((a, b) => {
        if (b.confirmedShortages !== a.confirmedShortages) {
          return b.confirmedShortages - a.confirmedShortages
        }
        return Number(a.currentMinSpare ?? 999999) - Number(b.currentMinSpare ?? 999999)
      })
      .slice(0, 10)
  }, [data, selectedDetailByName])

  const historicalTop = useMemo(() => {
    if (!data) return []
    return data.historical.summary.slice(0, 10).map((item) => ({
      ...item,
      ratioLabel: `${Math.round(Number(item.maxRiskRatioAt50) * 100)}%`,
      marginLabel: `${Math.round(Number(item.minMarginAt50)).toLocaleString()}매`,
    }))
  }, [data])

  if (!data || !scenario) {
    return <div className="loading">데이터를 불러오는 중입니다.</div>
  }

  const facts = data.facts
  const riskChart = [
    { name: 'RED', value: scenario.riskCounts.red, color: gradeColors.red },
    { name: 'ORANGE', value: scenario.riskCounts.orange, color: gradeColors.orange },
    { name: 'YELLOW', value: scenario.riskCounts.yellow, color: gradeColors.yellow },
    { name: 'GREEN', value: scenario.riskCounts.green, color: gradeColors.green },
  ]
  const attritionNoEffect = scenario.possibleShortagePlaces === 0 || scenario.maxPotentialAffected === 0
  const priorityNotVisible =
    !attritionNoEffect && scenario.priorityCounts.high === 0 && scenario.priorityCounts.review === 0
  const needsReviewCount = scenario.priorityCounts.high + scenario.priorityCounts.review

  return (
    <main className="min-h-screen bg-wash text-ink">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-civic">송파구 파일럿</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal md:text-3xl">
              투표용지 부족 사태 민감도 대시보드
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              선거 결과를 단정하지 않고, 공개자료로 확인된 사실과 자료 공백, 보수적
              시나리오에 따른 추가 사실조사 우선순위를 분리해 보여줍니다.
            </p>
          </div>
          <div className="rounded-md border border-line bg-wash px-4 py-3 text-sm text-muted">
            정적 JSON 기반 · 백엔드 서버 없음
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-5 md:grid-cols-4">
        <Metric icon={Database} label="전국 추가 송부" value={`${facts.national.additionalSent}곳`} hint="투표용지가 모자랄 수 있어 추가로 보낸 투표소 수" />
        <Metric icon={AlertTriangle} label="실제 부족" value={`${facts.national.actualShortage}곳`} hint="추가 송부된 용지가 실제로 사용된 곳" />
        <Metric icon={FileWarning} label="중단·대기" value={`${facts.national.suspendedOrDelayed}곳`} hint="투표가 멈췄거나 대기가 발생한 곳" />
        <Metric icon={CheckCircle2} label="송파구 이름 확인" value={`${facts.songpa.namedShortages}/${facts.songpa.officialActualShortage}`} hint="공개자료로 투표소명까지 확인한 비율" />
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-5 md:grid-cols-4">
        <Metric icon={Database} label="송파구 선거인수" value={`${(data.actuals2026.totalElectors / 10000).toFixed(1)}만명`} hint="2026 확정명부 기준 (VCVP01 실측)" />
        <Metric icon={AlertTriangle} label="인쇄량 (50%)" value={`${(data.actuals2026.printedBallots / 10000).toFixed(1)}만장`} hint="총 선거인 × 50% 내부 지침 기준" />
        <Metric icon={CheckCircle2} label="구 전체 잉여" value={`+${data.actuals2026.surplusTotal.toLocaleString()}장`} hint="인쇄량 − 당일 실수요 (+17.8%)" />
        <Metric icon={Scale} label="50% 초과 동" value={`${data.dongAnalysis.exceedingDongs.length}개 동`} hint="당일투표율이 50% 인쇄 한도를 초과한 동" />
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-6">
        <Panel title="한눈에 읽기" icon={CheckCircle2}>
          <div className="grid gap-3 md:grid-cols-3">
            <ExplainCard
              title="1. 빨간색은 사실"
              body="보도·공개자료로 부족이 확인된 동과 투표소입니다. 계산 결과가 아닙니다."
            />
            <ExplainCard
              title="2. 계산은 임시값"
              body="투표소별 실제 배부량이 없어 2022년 동 평균으로 다시 계산한 값입니다."
            />
            <ExplainCard
              title="3. 차이가 핵심"
              body="실제 부족과 계산이 다르면, 어떤 자료가 빠졌는지 확인해야 합니다."
            />
          </div>
        </Panel>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-6">
        <Panel title="계산은 이렇게 합니다" icon={CheckCircle2}>
          <div className="grid gap-3 md:grid-cols-3">
            <ExplainCard
              title="수요: 올 사람"
              body="2022년 동별 선거일투표자 수를 그 동의 투표소 수로 나눕니다. 여기에 수요 증가율 레버를 곱합니다."
            />
            <ExplainCard
              title="공급: 준비 용지"
              body="2022년 동별 선거인 수를 그 동의 투표소 수로 나눕니다. 여기에 배부 기준 레버를 곱하고 100장 단위로 내립니다."
            />
            <ExplainCard
              title="비교: 남는 장수"
              body="준비 용지에서 올 사람을 뺍니다. 마이너스면 그 가정에서 부족 가능성이 생깁니다."
            />
          </div>
          <p className="mt-3 rounded-md bg-wash p-3 text-sm leading-6 text-muted">
            현재 로컬 버전은 <strong>2026년 실제 투표수 계산이 아닙니다.</strong> 선관위 API가 아직 송파구 2026 투·개표 자료를 반환하지 않아,
            2022년 자료로 만든 민감도 계산입니다.
          </p>
        </Panel>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-6">
        <Panel title="그래서 공개가 필요한 자료" icon={Database}>
          <p className="mb-4 text-sm leading-6 text-muted">
            이 대시보드의 결론은 특정 당락 단정이 아니라, 아래 자료가 공개되어야 실제 부족 원인을 검증할 수 있다는 것입니다.
          </p>
          <DataGapList items={data.gaps.items} />
        </Panel>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-6">
        <Panel title="송파구 부족 확인 지도" icon={Scale}>
          <div className="mb-4 rounded-md border border-line bg-wash p-3 text-sm leading-6 text-muted">
            이 지도는 <strong>크롤링한 보도·공개자료에서 부족 투표소명이 확인된 동</strong>만 빨간색으로 표시합니다.
            여기에는 수급 압박도 계산을 섞지 않습니다. 노란색·초록색 판단은 아래 시나리오 영역에서 따로 봅니다.
          </div>
          <SongpaTileMap items={data.emd.items} />
        </Panel>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-6">
        <Panel title="총량은 충분했다 — 배분이 틀렸다" icon={AlertTriangle}>
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6">
            <strong>구 전체로는 42,774장이 남았다.</strong> 송파구 선거인 565,368명의 50%인 282,684장을 인쇄했는데, 당일 실수요는 239,910명이었다. 그런데 14개 투표소는 용지가 바닥났다. 총량 문제가 아니라 <strong>배분 문제</strong>다.
          </div>
          <div className="mb-3 text-sm font-semibold text-muted">동별 당일투표율 vs 50% 인쇄 한도 (구청장 선거 기준, 27개 동 전수)</div>
          <DongTurnoutChart items={data.dongAnalysis.dongAnalysis} />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm leading-6">
              <strong>잠실3동 모순:</strong> 당일투표율 56.7%로 50% 인쇄 한도를 6.7%p 초과.
              구 전체 잉여(+17.8%)와 달리 잠실3동만 보면 이미 인쇄 한도를 뚫은 구조였다.
              사전투표율이 11.3%(구 최저 수준)라 당일에 유권자가 몰렸기 때문이다.
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6">
              <strong>잠실2동 모순:</strong> 동 평균 50.5%로 한도 초과.
              동 평균이 한도를 넘으면 내부 특정 투표구는 더 심각하다. 동 평균이 50% 아래인 동에서도 특정 투표구가 초과하는 이유다.
              <div className="mt-1 text-xs text-muted">사전투표율-당일투표율 상관계수: {data.dongAnalysis.correlationPrevoteVsElectionDay} (반비례)</div>
            </div>
          </div>
        </Panel>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-6">
        <Panel title="13시 급등 — 사전투표 합산 타임라인" icon={BarChart3}>
          <div className="mb-3 rounded-md border border-line bg-wash p-3 text-sm leading-6 text-muted">
            선거일 당일 투표자만 집계되다가 <strong>13시에 사전투표 132,194명이 합산</strong>되면서 투표율이 급등한다. 투표소 관리원 입장에서 13시는 갑자기 "우리 동네 용지가 모자랄 수 있다"는 신호가 켜지는 순간이다.
          </div>
          <VoteTimelineChart timeline={data.voteTimeline.songpaTimeline} printedBallots={data.actuals2026.printedBallots} />
        </Panel>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-6">
        <Panel title="확인된 송파구 부족 투표소" icon={Scale}>
          <div className="mb-3 rounded-md border border-line bg-wash p-3 text-sm leading-6 text-muted">
            <p>
              이 표는 <strong>크롤링해서 부족이 확인된 투표소</strong>입니다. 아래의 추정 계산은
              실제와 비교해보기 위한 임시 계산입니다.
            </p>
            <p className="mt-2">
              계산식은 <strong>2022년 동별 선거일투표자 수를 같은 동 투표소 수로 나누고</strong>,
              선택한 수요 증가율과 배부 기준을 적용하는 방식입니다. 실제 부족과 차이가 나면,
              <strong>수요가 얼마나 더 많거나 실제 준비량이 얼마나 적어야 부족선에 닿는지</strong>를 봅니다.
            </p>
          </div>
          <ConfirmedShortageList rows={selectedShortageRows} />
        </Panel>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-6 lg:grid-cols-[340px_1fr]">
        <ScenarioPanel selected={selected} setSelected={setSelected} />
        <div className="grid gap-5">
          <Panel title="시나리오 결과" icon={BarChart3}>
            <div className="mb-4 rounded-md border border-line bg-wash p-3 text-sm leading-6 text-muted">
              기준값은 <strong>2022년 송파구 동별 선거일투표자 수를 같은 동 투표소 수로 나눈 값</strong>입니다.
              `+10%`는 그 기준보다 선거일 투표자가 10% 더 왔다고 보는 뜻입니다.
              {attritionNoEffect
                ? ' 현재 가정에서는 용지가 실제로 모자라는 폭이 없거나 작아서 이탈률을 바꿔도 추가 조사 우선순위가 거의 변하지 않습니다.'
                : priorityNotVisible
                  ? ' 현재 가정에서는 이탈률이 최대 잠재 영향 인원은 바꾸지만, 그 인원이 표차 기준보다 작아 우선순위 카운트는 그대로입니다.'
                  : ' 현재 가정에서는 용지 부족분이 있어 이탈률을 바꾸면 추가 조사 우선순위가 달라질 수 있습니다.'}
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
              <div className="grid gap-3 sm:grid-cols-2">
                <ResultBox label="용지 부족 가능 투표소" value={`${scenario.possibleShortagePlaces}곳`} hint="예상 여유 투표용지가 0장 미만인 곳" />
                <ResultBox label="최소 여유 장수" value={`${Math.round(scenario.spareBallots.min).toLocaleString()}장`} hint="전체 송파구 투표소 중 가장 여유가 작은 곳" />
                <ResultBox label="최대 수급 압박도" value={`${Math.round(scenario.maxSupplyPressure * 100)}%`} hint="100%를 넘으면 예상 수요가 준비 용지를 초과" />
                <ResultBox label="최대 잠재 영향 인원" value={`${Math.round(scenario.maxPotentialAffected).toLocaleString()}명`} hint="부족분 중 이탈률만큼 실제 투표를 못 했다고 보는 상한 시나리오" />
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={riskChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {riskChart.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <ScenarioDelta baseline={baselineTotals} current={scenarioTotals} selected={selected} />
          </Panel>

          <Panel title="현재 시나리오에서 아슬아슬한 동" icon={Scale}>
            <p className="mb-3 rounded-md border border-line bg-wash p-3 text-sm leading-6 text-muted">
              여기부터는 크롤링 사실이 아니라 <strong>왼쪽 레버로 바꿔보는 계산 결과</strong>입니다.
              예를 들어 잠실3동은 부족 확인 동이 아니더라도, 선택한 가정에서 여유폭이 작으면 여기에 올라올 수 있습니다.
            </p>
            <ScenarioDongTable rows={emdPriorityRows} />
          </Panel>

          <Panel title="배부 기준을 올리면 무엇이 바뀌나" icon={SlidersHorizontal}>
            <p className="mb-3 text-sm leading-6 text-muted">
              같은 수요 가정에서 투표용지를 더 준비하면, 부족 가능 투표소와 최악 여유 장수가 어떻게 바뀌는지 봅니다.
            </p>
            <ImpactTable
              rows={lineData}
              firstColumn="supply"
              firstLabel="배부 기준"
              columns={[
                ['용지 부족 가능', '부족 가능'],
                ['최소 여유 장수', '최악 여유'],
                ['수급 압박도', '최대 압박도'],
              ]}
            />
          </Panel>

        <Panel title="선거일 투표자가 늘면 무엇이 바뀌나" icon={BarChart3}>
            <p className="mb-3 text-sm leading-6 text-muted">
              `+0%`는 2022년 동 평균을 그대로 쓴 값입니다. 숫자가 올라갈수록 같은 준비량에서 여유 장수가 줄어듭니다.
              그래프 대신 표로 보여 단위 혼선을 줄였습니다.
            </p>
            <ImpactTable
              rows={demandLineData}
              firstColumn="demand"
              firstLabel="수요 증가"
              columns={[
                ['용지 부족 가능', '부족 가능'],
                ['최소 여유 장수', '최악 여유'],
              ]}
            />
          </Panel>

          <Panel title="기다리다 포기한 비율은 무엇을 바꾸나" icon={FileWarning}>
            <p className="mb-3 text-sm leading-6 text-muted">
              이 값은 핵심 레버가 아니라 보조 가정입니다. 용지가 부족하다고 보는 경우에만,
              부족분 중 실제 투표를 못 했을 수 있는 인원을 작게 또는 크게 잡아보는 값입니다.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <ResultBox label="부족 가능 투표소" value={`${scenario.possibleShortagePlaces}곳`} hint="이탈률을 바꿔도 변하지 않음" />
              <ResultBox label="최대 잠재 영향" value={`${Math.round(scenario.maxPotentialAffected * 10) / 10}명`} hint="이탈률이 바꾸는 값" />
              <ResultBox label="검토 필요 이상" value={`${needsReviewCount}곳`} hint="표차 가정보다 영향 추정이 큰 곳" />
            </div>
            <p className="mt-3 rounded-md bg-wash p-3 text-sm leading-6 text-muted">
              현재 선택값에서는 이 숫자가 작아서 화면 전체 판단을 거의 바꾸지 않습니다. 그래서 먼저 봐야 할 레버는
              <strong> 배부 기준</strong>과 <strong>선거일 투표자 증가율</strong>입니다.
            </p>
          </Panel>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-6">
        <Panel title="과거 지선 본투표 기준선" icon={Scale}>
          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={historicalTop} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" domain={[0, 1.2]} tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                  <YAxis dataKey="emdName" type="category" width={72} />
                  <Tooltip
                    formatter={(value, name) => [
                      name === 'maxRiskRatioAt50' ? `${Math.round(value * 100)}%` : value,
                      name === 'maxRiskRatioAt50' ? '50% 기준 대비 최대 수요' : name,
                    ]}
                  />
                  <Bar dataKey="maxRiskRatioAt50" radius={[0, 4, 4, 0]}>
                    {historicalTop.map((item) => (
                      <Cell
                        key={item.emdName}
                        fill={
                          item.baselineBand === '과거 기준 초과'
                            ? '#be123c'
                            : item.baselineBand === '여유폭 작음'
                              ? '#b45309'
                              : '#0f766e'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              <p className="text-sm leading-6 text-muted">
                2018·2022년에 실제로 선거일 당일 투표한 사람 수를, 전체 선거인의 50%만 준비했다고 가정한 양과 비교합니다.
                100%를 넘는 동은 과거 어느 해에는 당일투표자 수가 50% 준비량보다 많았다는 뜻입니다.
              </p>
              <div className="rounded-md border border-line">
                {historicalTop.slice(0, 5).map((item) => (
                  <div key={item.emdName} className="flex items-center justify-between border-b border-line px-3 py-2 last:border-b-0">
                    <div>
                      <div className="text-sm font-semibold">{item.emdName}</div>
                      <div className="text-xs text-muted">{item.baselineBand}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div>{item.ratioLabel}</div>
                      <div className="text-xs text-muted">최소 여유 {item.marginLabel}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="rounded-md bg-wash p-3 text-sm leading-6 text-muted">
                이것은 2026년 실제 배부량이 부족했다는 증명이 아닙니다. 다만 "지방선거라서 50%면 충분하다"는 가정이
                동별로는 얼마나 아슬아슬할 수 있는지 보는 참고선입니다. 일부 동은 행정동 개편 등으로 직접 비교에 주의가 필요합니다.
              </p>
            </div>
          </div>
        </Panel>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-6 lg:grid-cols-2">
        <Panel title="참고: 2025 대선 오후 유입" icon={BarChart3}>
          <div className="grid gap-3 sm:grid-cols-3">
            <ResultBox label="오후 4시 투표율" value={`${Math.round(data.presidential.fourPmTurnout * 1000) / 10}%`} />
            <ResultBox label="최종 투표율" value={`${Math.round(data.presidential.finalTurnout * 1000) / 10}%`} />
            <ResultBox label="오후 4시 이후 증가" value={`+${Math.round(data.presidential.lateInflowAfterFourPm * 1000) / 10}%p`} />
          </div>
          <p className="mt-4 rounded-md bg-wash p-3 text-sm leading-6 text-muted">
            이 값은 현재 시뮬레이션에 직접 넣은 예측값이 아닙니다. 핵심은 단순합니다.
            최근 전국 선거에서도 오후 4시 이후에 약 7.9%p가 더 투표했다는 참고자료입니다.
          </p>
        </Panel>

        <Panel title="서울시장만 보는 것이 아닌 이유" icon={Scale}>
          <div className="space-y-3">
            {data.layers.items.map((item) => (
              <div key={item.name} className="rounded-md border border-line p-3">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm">{item.name}</strong>
                  <span className="rounded-full bg-wash px-2 py-1 text-xs text-muted">{item.scale}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{item.whyItMatters}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto max-w-7xl px-5 py-5 text-sm leading-6 text-muted">
          {facts.disclaimer} 투표소별 선거인수, 최초 배부량, 중단·재개 시각이
          공개되면 이 대시보드는 확정 자료 기반 분석으로 갱신할 수 있습니다.
        </div>
      </footer>
    </main>
  )
}

function Metric({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Icon size={17} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-2 text-xs leading-5 text-muted">{hint}</div> : null}
    </div>
  )
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="rounded-md border border-line bg-white p-4">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
        <Icon size={18} />
        {title}
      </h2>
      {children}
    </section>
  )
}

function ExplainCard({ title, body }) {
  return (
    <div className="rounded-md border border-line bg-wash p-4">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </div>
  )
}

function ResultBox({ label, value, hint }) {
  return (
    <div className="rounded-md border border-line bg-wash p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-2 text-xs leading-5 text-muted">{hint}</div> : null}
    </div>
  )
}

function DataGapList({ items }) {
  const transparencyScore =
    items.reduce((sum, item) => sum + Math.min(item.known / item.required, 1), 0) / items.length

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="rounded-md border border-line bg-wash p-4">
        <div className="text-sm text-muted">현재 검증 가능성</div>
        <div className="mt-2 text-3xl font-semibold">{Math.round(transparencyScore * 100)}%</div>
        <p className="mt-2 text-xs leading-5 text-muted">
          공개자료만으로 실제 부족 원인을 설명할 수 있는 정도입니다.
        </p>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <GapRow key={item.item} item={item} />
        ))}
      </div>
    </div>
  )
}

function ImpactTable({ rows, firstColumn, firstLabel, columns }) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-wash text-xs text-muted">
          <tr>
            <th className="px-3 py-2">{firstLabel}</th>
            {columns.map(([key, label]) => (
              <th key={key} className="px-3 py-2">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[firstColumn]} className="border-t border-line">
              <td className="px-3 py-2 font-semibold">{row[firstColumn]}</td>
              {columns.map(([key]) => (
                <td key={key} className="px-3 py-2">
                  {formatImpactValue(key, row[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatImpactValue(key, value) {
  if (key.includes('여유')) {
    return `${Math.round(value).toLocaleString()}장`
  }
  if (key.includes('압박')) {
    return `${Math.round(value)}%`
  }
  return `${value}곳`
}

function ScenarioDongTable({ rows }) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-wash text-xs text-muted">
          <tr>
            <th className="px-3 py-2">동</th>
            <th className="px-3 py-2">크롤링 사실</th>
            <th className="px-3 py-2">현재 시나리오 최악 여유</th>
            <th className="px-3 py-2">최대 압박도</th>
            <th className="px-3 py-2">시나리오 해석</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.emdName} className="border-t border-line">
              <td className="px-3 py-2 font-semibold">{item.emdName}</td>
              <td className="px-3 py-2">
                {item.confirmedShortages > 0 ? `${item.confirmedShortages}곳 확인` : '확인 없음'}
              </td>
              <td className="px-3 py-2">
                {item.currentMinSpare == null ? '-' : `${Math.round(item.currentMinSpare).toLocaleString()}장`}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="pressure-track">
                    <div
                      className={item.currentMaxPressure >= 1 ? 'pressure-fill pressure-danger' : 'pressure-fill'}
                      style={{ width: `${Math.min(Math.round(item.currentMaxPressure * 100), 120)}%` }}
                    />
                  </div>
                  <span>{Math.round(item.currentMaxPressure * 100)}%</span>
                </div>
              </td>
              <td className="px-3 py-2">
                <span className={item.currentMaxPressure >= 1 ? 'badge-red' : item.currentMaxPressure >= 0.9 ? 'badge-yellow' : 'badge-green'}>
                  {item.currentMaxPressure >= 1 ? '부족 가능' : item.currentMaxPressure >= 0.9 ? '여유폭 작음' : '현재 낮음'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ConfirmedShortageList({ rows }) {
  return (
    <>
      <div className="desktop-shortage-table overflow-hidden rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-wash text-xs text-muted">
            <tr>
              <th className="px-3 py-2">투표소</th>
              <th className="px-3 py-2">동</th>
              <th className="px-3 py-2">확인 사실</th>
              <th className="px-3 py-2">추정 계산</th>
              <th className="px-3 py-2">차이를 줄이려면</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.psName} className="border-t border-line">
                <td className="px-3 py-2 font-medium">{item.psName}</td>
                <td className="px-3 py-2 text-muted">{item.emdName}</td>
                <td className="px-3 py-2">
                  <span className="badge-red">부족 확인</span>
                </td>
                <td className="px-3 py-2">
                  {item.scenario ? `${Math.round(item.scenario.scenario_supply_pressure * 100)}%` : '-'}
                  <div className="text-xs text-muted">
                    예상 {item.scenario ? `${Math.round(item.scenario.scenario_expected_votes).toLocaleString()}명` : '-'}
                    {' / '}
                    준비 {item.scenario ? `${Math.round(item.scenario.scenario_ballots).toLocaleString()}장` : '-'}
                    {' / '}
                    여유 {item.scenario ? `${Math.round(item.scenario.scenario_spare_ballots).toLocaleString()}장` : '-'}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <ShortageReconciliation scenario={item.scenario} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-shortage-cards">
        {rows.map((item) => (
          <ShortageCard key={item.psName} item={item} />
        ))}
      </div>
    </>
  )
}

function ShortageCard({ item }) {
  const pressure = item.scenario ? `${Math.round(item.scenario.scenario_supply_pressure * 100)}%` : '-'
  const expected = item.scenario ? `${Math.round(item.scenario.scenario_expected_votes).toLocaleString()}명` : '-'
  const ballots = item.scenario ? `${Math.round(item.scenario.scenario_ballots).toLocaleString()}장` : '-'
  const spare = item.scenario ? `${Math.round(item.scenario.scenario_spare_ballots).toLocaleString()}장` : '-'
  const missed = item.scenario?.scenario_spare_ballots >= 0

  return (
    <article className="shortage-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{item.psName}</div>
          <div className="mt-1 text-xs text-muted">{item.emdName}</div>
        </div>
        <span className="badge-red">부족 확인</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <MiniStat label="압박도" value={pressure} />
        <MiniStat label="예상" value={expected} />
        <MiniStat label="준비" value={ballots} />
      </div>
      <div className="mt-3 flex items-center justify-between rounded-md bg-wash px-3 py-2 text-sm">
        <span className="text-muted">추정 여유</span>
        <strong>{spare}</strong>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">
        {missed
          ? '추정 계산은 여유가 있다고 보지만, 실제로는 부족이 확인된 곳입니다. 공개자료만으로 설명되지 않는 지점입니다.'
          : '현재 선택한 가정만으로도 부족 가능성이 나오는 곳입니다.'}
      </p>
      <ShortageReconciliation scenario={item.scenario} />
    </article>
  )
}

function ShortageReconciliation({ scenario, compact = false }) {
  if (!scenario) {
    return <span className="text-muted">자료 없음</span>
  }
  const spare = Number(scenario.scenario_spare_ballots)
  const expected = Number(scenario.scenario_expected_votes)
  const ballots = Number(scenario.scenario_ballots)

  if (spare < 0) {
    return (
      <div className={compact ? 'text-sm' : 'mt-3 rounded-md bg-rose-50 p-3 text-sm leading-6'}>
        <span className="badge-red">현재 가정도 부족</span>
        <div className="mt-1 text-muted">선택한 가정만으로도 예상 수요가 준비 용지를 넘습니다.</div>
      </div>
    )
  }

  const moreDemandPct = expected > 0 ? Math.ceil(((ballots / expected) - 1) * 100) : null
  const fewerBallots = Math.ceil(spare + 1)

  return (
    <div className={compact ? 'text-sm leading-5' : 'mt-3 rounded-md bg-amber-50 p-3 text-sm leading-6'}>
      <span className="badge-yellow">추정이 못 잡음</span>
      <div className="mt-1 text-muted">
        수요가 약 {moreDemandPct == null ? '-' : `+${moreDemandPct}%`} 더 많거나, 실제 준비가 약 {fewerBallots.toLocaleString()}장 적으면 부족선에 닿습니다.
      </div>
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-md border border-line bg-white px-2 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  )
}

function SongpaTileMap({ items }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-muted">
        <MapLegend className="legend-confirmed" label="부족 확인 동" />
        <MapLegend className="legend-neutral" label="확인 투표소명 없음" />
      </div>
      <div className="songpa-tile-map" aria-label="송파구 행정동 요약 지도">
        {items.map((item) => (
          <div
            key={item.emdName}
            className={`songpa-tile ${item.confirmedShortages > 0 ? 'songpa-confirmed' : 'songpa-neutral'}`}
            style={{
              gridRow: Number(item.mapRow),
              gridColumn: Number(item.mapCol),
            }}
          >
            <div className="songpa-tile-name">{item.emdName}</div>
            <div className="songpa-tile-meta">
              부족 확인 {item.confirmedShortages}곳
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MapLegend({ className, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`legend-dot ${className}`} />
      {label}
    </span>
  )
}

function ScenarioPanel({ selected, setSelected }) {
  return (
    <Panel title="시나리오 조절" icon={SlidersHorizontal}>
      <Control
        label="투표용지를 몇 % 준비했나"
        value={selected.supplyRatio}
        options={[0.5, 0.55, 0.6]}
        format={(value) => `${Math.round(value * 100)}%`}
        onChange={(value) => setSelected((state) => ({ ...state, supplyRatio: value }))}
      />
      <Control
        label="선거일 투표자가 얼마나 늘었나"
        value={selected.demandGrowth}
        options={[0, 0.05, 0.1, 0.15]}
        format={(value) => `+${Math.round(value * 100)}%`}
        onChange={(value) => setSelected((state) => ({ ...state, demandGrowth: value }))}
      />
      <Control
        label="기다리다 포기했을 수 있는 비율"
        value={selected.attritionRate}
        options={[0, 0.05, 0.1]}
        format={(value) => `${Math.round(value * 100)}%`}
        onChange={(value) => setSelected((state) => ({ ...state, attritionRate: value }))}
      />
      <Control
        label="작은 선거구 표차 가정"
        value={selected.marginThreshold}
        options={[50, 100, 300, 500]}
        format={(value) => `${value}표`}
        onChange={(value) => setSelected((state) => ({ ...state, marginThreshold: value }))}
      />
      <p className="mt-4 rounded-md bg-wash p-3 text-sm leading-6 text-muted">
        예: 50%는 선거인 1,000명에게 투표용지 약 500장을 준비했다는 뜻입니다.
        선거일 투표자 증가는 2022년 송파구 동별 선거일투표 proxy 대비 증가율입니다.
        이탈률은 용지가 모자라는 시나리오에서만 추가 조사 우선순위에 영향을 줍니다.
        표차 값은 실제 선거구별 표차가 아직 연결되지 않아 쓰는 임시 기준입니다.
      </p>
    </Panel>
  )
}

function Control({ label, value, options, format, onChange }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted">{format(value)}</span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={option === value ? 'choice choice-active' : 'choice'}
            onClick={() => onChange(option)}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </div>
  )
}

function GapRow({ item }) {
  const pct = Math.min(item.known / item.required, 1)
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <span>{item.item}</span>
        <span className="text-muted">
          {item.known}/{item.required}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div
          className={item.status === 'missing' ? 'h-full bg-signal' : 'h-full bg-caution'}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
    </div>
  )
}

function DongTurnoutChart({ items }) {
  if (!items || items.length === 0) return null
  const data = items.map(item => ({
    name: item.dong,
    당일투표율: Math.round(item.electionDayRate * 1000) / 10,
    사전투표율: Math.round(item.prevoteRate * 1000) / 10,
    초과: item.exceedsPrintLimit,
  }))
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><span style={{ display:'inline-block', width:10, height:10, background:'#be123c', borderRadius:2 }} />당일투표율 50% 초과</span>
        <span className="inline-flex items-center gap-1"><span style={{ display:'inline-block', width:10, height:10, background:'#0f766e', borderRadius:2 }} />50% 이하</span>
        <span className="inline-flex items-center gap-1"><span style={{ display:'inline-block', width:1, height:14, background:'#b45309' }} />50% 인쇄 한도선</span>
      </div>
      <div className="h-72 overflow-x-auto">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 16, right: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" domain={[0, 65]} tickFormatter={v => `${v}%`} />
            <YAxis dataKey="name" type="category" width={64} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, name) => [`${v}%`, name]} />
            <Bar dataKey="당일투표율" radius={[0, 3, 3, 0]}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.초과 ? '#be123c' : '#0f766e'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function VoteTimelineChart({ timeline, printedBallots }) {
  if (!timeline || timeline.length === 0) return null
  const data = timeline
    .filter(r => r.time !== '전체')
    .map(r => ({
      time: r.time,
      선거일투표자: r.electionDayVoters,
      합계투표자: r.totalVoters,
    }))
  const printLimit = printedBallots
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="time" />
          <YAxis tickFormatter={v => `${Math.round(v/1000)}K`} />
          <Tooltip formatter={(v, name) => [v.toLocaleString() + '명', name]} />
          <Legend />
          <Bar dataKey="선거일투표자" fill="#0f766e" radius={[4,4,0,0]} />
          <Bar dataKey="합계투표자" fill="#b45309" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-muted">13시: 사전투표 합산 → 합계투표자 급등. 이 시점부터 고투표율 투표소 용지 소진 시작.</p>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
