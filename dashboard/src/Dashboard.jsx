import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell,
  ResponsiveContainer, ReferenceLine, Tooltip, XAxis, YAxis,
} from 'recharts'

const DATA_FILES = {
  actuals2026:    '/data/songpa_2026_actuals.json',
  dongAnalysis:   '/data/dong_analysis_2026.json',
  voteTimeline:   '/data/vote_progress_timeline_2026.json',
  shortages:      '/data/confirmed_shortages.json',
  retally:        '/data/retally_analysis.json',
  seoul:          '/data/seoul_analysis_2026.json',
  yearlyCompare:  '/data/yearly_comparison.json',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [showDetail, setShowDetail] = useState(false)

  useEffect(() => {
    Promise.all(
      Object.entries(DATA_FILES).map(([key, url]) =>
        fetch(url)
          .then(r => r.ok ? r.json() : null)
          .then(v => [key, v])
          .catch(() => [key, null])
      )
    ).then(entries => setData(Object.fromEntries(entries)))
  }, [])

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f8fb', color: '#6b7280', fontSize: 14 }}>
        데이터 불러오는 중…
      </div>
    )
  }

  const dongs    = data.dongAnalysis?.dongAnalysis || []
  const timeline = data.voteTimeline?.songpaTimeline || []
  const exceeding = data.dongAnalysis?.exceedingDongs || []
  const shortages = data.shortages?.items || []
  const retally  = data.retally || null
  const seoul    = data.seoul || null
  const yearlyCompare = data.yearlyCompare?.years || []

  const timelineChart = timeline
    .filter(r => r.time !== '전체')
    .map(r => ({
      time: r.time,
      당일: r.electionDayVoters,
      합계: r.totalVoters,
    }))

  const dongChart = [...dongs]
    .sort((a, b) => b.electionDayRate - a.electionDayRate)
    .map(d => ({
      name: d.dong,
      rate: Math.round(d.electionDayRate * 1000) / 10,
      over: d.exceedsPrintLimit,
    }))

  return (
    <div style={{ minHeight: '100vh', background: '#f6f8fb', color: '#111', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── 헤더 ── */}
      <header style={{ background: '#111', color: '#fff', padding: '20px 16px 22px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none', border: '1px solid #444', color: '#888',
              padding: '4px 12px', borderRadius: 4, fontSize: 12,
              cursor: 'pointer', marginBottom: 14, letterSpacing: 0.5,
            }}
          >
            ← 처음으로
          </button>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 8, letterSpacing: 1 }}>
            2026.6.3 제9회 지방선거 · 서울 25개 구 + 송파구 상세 · 데이터 검증
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.25, margin: 0 }}>
            투표용지는 왜 모자랐나
          </h1>
          <p style={{ fontSize: 14, color: '#bbb', marginTop: 10, lineHeight: 1.7 }}>
            선관위 공개 데이터를 직접 크롤링해 검증했습니다.<br />
            특정 후보 유불리나 선거 결과를 단정하지 않습니다.
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 48px' }}>

        {/* ── 역설 카드 ── */}
        <div style={{ marginTop: 24, background: 'white', border: '2px solid #111', borderRadius: 12, padding: '20px 18px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', letterSpacing: 1, marginBottom: 14 }}>핵심 역설</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#be123c', lineHeight: 1 }}>14곳</div>
              <div style={{ fontSize: 13, color: '#374151', marginTop: 6, fontWeight: 600 }}>투표 중단·지연</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>투표용지 바닥</div>
            </div>
            <div style={{ fontSize: 28, color: '#d1d5db', fontWeight: 300 }}>↔</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#0f766e', lineHeight: 1 }}>+4.3만장</div>
              <div style={{ fontSize: 13, color: '#374151', marginTop: 6, fontWeight: 600 }}>구 전체 잉여</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>남은 용지</div>
            </div>
          </div>
          <div style={{ marginTop: 16, background: '#111', borderRadius: 8, padding: '12px 14px', color: 'white', fontSize: 14, lineHeight: 1.6, textAlign: 'center' }}>
            총량이 부족했던 게 아닙니다. <strong>배분이 틀렸습니다.</strong>
          </div>
        </div>

        {/* ── 서울 현황 ── */}
        {seoul && (
          <Section label="서울" title="서울 25개 구 현황">
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 12, lineHeight: 1.6 }}>
              서울 전체 427개 동 중 <strong style={{ color: '#be123c' }}>{seoul.totalOverDongs}개 동</strong>이
              선거일 당일투표율 50%를 초과했습니다. 송파구만의 문제가 아닙니다.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {seoul.districts.filter(d => d.overDongs > 0).map(d => {
                const color = d.riskLevel === 'HIGH' ? '#be123c' : d.riskLevel === 'MEDIUM' ? '#b45309' : '#6b7280'
                const bg    = d.riskLevel === 'HIGH' ? '#fef2f2' : d.riskLevel === 'MEDIUM' ? '#fffbeb' : '#f9fafb'
                const bdr   = d.riskLevel === 'HIGH' ? '#fca5a5' : d.riskLevel === 'MEDIUM' ? '#fbbf24' : '#e5e7eb'
                return (
                  <div key={d.gu} style={{ background: bg, border: `1px solid ${bdr}`, borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{d.gu}</span>
                      <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>
                        {d.overDongs}/{d.totalDongs}개 동 초과
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color }}>{d.maxElectionDayRate}%</span>
                      <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>최고</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 10, lineHeight: 1.6 }}>
              선거일(당일)투표율 = 선거일 투표자 수 / 전체 선거인수. 구청장 선거 기준. NEC VCCP08 직접 크롤링.
            </p>
          </Section>
        )}

        {/* ── STORY 1: 어느 동에서 바닥났나 ── */}
        <Section label="01" title="어느 동에서 바닥났나 — 송파구 상세">
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 4, lineHeight: 1.6 }}>
            당일투표율이 <strong>50% 인쇄 한도를 넘으면</strong> 용지가 부족합니다.
            2026 구청장 선거 개표결과 기준 (27개 동 전체 크롤링).
          </p>
          <div style={{ height: 520, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dongChart} layout="vertical" margin={{ left: 8, right: 44, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 65]}
                  tickFormatter={v => `${v}%`}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={60}
                  tick={{ fontSize: 11 }}
                />
                <ReferenceLine x={50} stroke="#be123c" strokeDasharray="4 3" strokeWidth={2} />
                <Tooltip
                  formatter={(v) => [`${v}%`, '당일투표율']}
                  labelFormatter={l => l}
                />
                <Bar dataKey="rate" radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 11, formatter: v => `${v}%` }}>
                  {dongChart.map(d => (
                    <Cell key={d.name} fill={d.over ? '#be123c' : '#0f766e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b7280', marginTop: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#be123c', borderRadius: 2 }}></span>
              50% 초과 ({exceeding.length}개 동)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#0f766e', borderRadius: 2 }}></span>
              50% 이하 ({dongChart.length - exceeding.length}개 동)
            </span>
          </div>
        </Section>

        {/* ── STORY 2: 왜 이렇게 됐나 ── */}
        <Section label="02" title="왜 이렇게 됐나">
          <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <RuleCard
                icon="📏"
                title="선관위 내부 지침"
                body="지방선거: 선거인의 50%만 인쇄"
                note="법적 구속력 없음"
                noteColor="#b45309"
              />
              <RuleCard
                icon="⚠️"
                title="문제"
                body="50%가 최솟값이자 실제 적용값"
                note="안전 여유 없음"
                noteColor="#be123c"
              />
            </div>
          </div>
          <CalloutBox color="#fef3c7" border="#fbbf24">
            <strong>사전투표율이 낮을수록 당일에 사람이 몰립니다.</strong><br />
            잠실3동: 사전투표율 11.3%(구 최저) → 당일투표율 56.7%(한도 초과)<br />
            두 지표의 상관계수 <strong>−0.46</strong> — 반비례가 명확합니다.
          </CalloutBox>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#374151' }}>사전투표율 낮을수록 당일 초과 위험</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {[
                { dong: '잠실3동', pre: '11.3%', day: '56.7%', over: true },
                { dong: '잠실4동', pre: '17.4%', day: '53.3%', over: true },
                { dong: '문정2동', pre: '9.6%',  day: '52.1%', over: true },
                { dong: '풍납1동', pre: '26.1%', day: '37.0%', over: false },
                { dong: '오금동',  pre: '27.0%', day: '36.0%', over: false },
              ].map(row => (
                <div key={row.dong} style={{
                  display: 'grid', gridTemplateColumns: '70px 1fr 80px',
                  alignItems: 'center', gap: 8,
                  background: row.over ? '#fef2f2' : '#f0fdf4',
                  border: `1px solid ${row.over ? '#fca5a5' : '#86efac'}`,
                  borderRadius: 8, padding: '8px 12px',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{row.dong}</span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>사전 {row.pre} → 당일 {row.day}</span>
                  {row.over
                    ? <span style={{ fontSize: 11, color: '#be123c', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, padding: '2px 7px', textAlign: 'center' }}>한도 초과</span>
                    : <span style={{ fontSize: 11, color: '#0f766e', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 4, padding: '2px 7px', textAlign: 'center' }}>여유</span>
                  }
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ── 연도별 비교 ── */}
        {yearlyCompare.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#374151' }}>
              연도별 비교 — 2018·2022·2026 송파구
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
              {yearlyCompare.map(y => {
                const hasIssue = y.overDongs > 0
                const color = y.year === 2026 ? '#be123c' : hasIssue ? '#b45309' : '#0f766e'
                const bg    = y.year === 2026 ? '#fef2f2' : hasIssue ? '#fffbeb' : '#f0fdf4'
                const bdr   = y.year === 2026 ? '#fca5a5' : hasIssue ? '#fbbf24' : '#86efac'
                return (
                  <div key={y.year} style={{ background: bg, border: `1px solid ${bdr}`, borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>{y.year}년</div>
                    <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{y.overDongs}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>개 동 초과</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color, marginTop: 6 }}>최대 {y.maxEdayRate}%</div>
                  </div>
                )
              })}
            </div>
            <CalloutBox color="#fef3c7" border="#fbbf24">
              <strong>2018년에도 7개 동이 50%를 넘었습니다.</strong><br />
              당시 투표소 부족 사태가 없었다면, 실제 배부량이 50%보다 많았거나
              비상 재고가 별도로 있었을 가능성이 있습니다.
              2018년 실제 배부량은 공개 데이터로 확인되지 않습니다.
            </CalloutBox>
          </div>
        )}

        {/* ── STORY 3: 언제 터졌나 ── */}
        <Section label="03" title="언제 터졌나 — 오후 1시">
          <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 12, color: '#374151' }}>
            선거 당일 오전까지는 투표율이 낮았습니다.
            <strong> 낮 12시 기준 19.6%.</strong><br />
            그런데 오후 1시에 <strong>47.1%</strong>로 뛰었습니다.
          </p>
          <CalloutBox color="#eff6ff" border="#93c5fd">
            오후 1시부터 <strong>사전투표 132,194명</strong>의 집계가 합산됩니다.
            이 시점에 이미 당일 투표자가 많았던 투표소는
            남은 용지가 없었습니다.
          </CalloutBox>
          <div style={{ height: 220, marginTop: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineChart} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={v => `${Math.round(v / 1000)}K`}
                  tick={{ fontSize: 11 }}
                  width={36}
                />
                <ReferenceLine x="13시" stroke="#be123c" strokeDasharray="4 3" strokeWidth={2} label={{ value: '사전 합산', position: 'top', fontSize: 11, fill: '#be123c' }} />
                <Tooltip
                  formatter={(v, name) => [v.toLocaleString() + '명', name === '당일' ? '선거일 투표' : '사전 포함 합계']}
                />
                <Bar dataKey="당일" fill="#0f766e" radius={[2, 2, 0, 0]} name="당일" />
                <Bar dataKey="합계" fill="#b45309" radius={[2, 2, 0, 0]} name="합계" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
            초록 = 선거일 당일 투표자 / 주황 = 사전투표 합산 후 합계. 빨간 점선: 사전투표 합산 시점.
          </p>
        </Section>

        {/* ── STORY 4: 법과 제도의 공백 ── */}
        <Section label="04" title="법과 제도의 공백">
          <div style={{ display: 'grid', gap: 10 }}>
            <FactRow
              label="공직선거법"
              text="투표용지 수량 기준이 없습니다. 인쇄 주체와 기한만 규정되어 있습니다."
              tag="규정 없음"
              tagColor="#be123c"
            />
            <FactRow
              label="선관위 내부 지침"
              text="지방선거 50% 이상, 대선 60% 이상. 이게 유일한 기준입니다."
              tag="법적 구속력 없음"
              tagColor="#b45309"
            />
            <FactRow
              label="송파구 선택"
              text="지침 하한인 50%에 맞춰 인쇄했습니다. 초과 잔여 용지에 대한 감사 우려가 이유입니다."
              tag="최솟값 적용"
              tagColor="#6b7280"
            />
            <FactRow
              label="신설 투표구"
              text="잠실4동 3개 투표소는 이번에 처음 생겼습니다. 전례 없이 같은 50% 기준이 적용됐습니다."
              tag="전례 없음"
              tagColor="#b45309"
            />
          </div>
          <CalloutBox color="#f0fdf4" border="#86efac" style={{ marginTop: 12 }}>
            <strong>바꾸려면.</strong><br />
            ① 공직선거법에 인쇄 하한 명문화<br />
            ② 투표구별 사전투표율을 반영한 차등 배분<br />
            ③ 신설·재획정 투표구 안전계수 추가 적용
          </CalloutBox>
        </Section>

        {/* ── STORY 5: 재투표 가능성 ── */}
        {retally && (
          <Section label="05" title="재투표 가능성은?">
            <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
              <CalloutBox color="#fef3c7" border="#fbbf24">
                <strong>선거소청 기한: {retally.legalPath.step1.deadline}</strong> — 아직 {retally.legalPath.step1.daysLeft}일 남았습니다.<br />
                구의원 선거에서 표차가 좁은 선거구에 부족 투표소가 겹칩니다.
              </CalloutBox>
            </div>
            <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
              {retally.districtMargins.map(d => {
                const riskColor = d.riskLevel === 'HIGH' ? '#be123c' : d.riskLevel === 'MEDIUM' ? '#b45309' : '#6b7280'
                const riskBg    = d.riskLevel === 'HIGH' ? '#fef2f2' : d.riskLevel === 'MEDIUM' ? '#fffbeb' : '#f9fafb'
                const riskBdr   = d.riskLevel === 'HIGH' ? '#fca5a5' : d.riskLevel === 'MEDIUM' ? '#fbbf24' : '#e5e7eb'
                return (
                  <div key={d.district} style={{ background: riskBg, border: `1px solid ${riskBdr}`, borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>구의원 {d.district}</span>
                        <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>당선: {d.winner}</span>
                      </div>
                      <span style={{ background: riskColor + '20', color: riskColor, fontSize: 11, padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                        표차 {d.margin.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                      부족 투표소: {d.shortageDongs.join(', ')} ({d.shortagePollingPlaces}곳)
                    </div>
                  </div>
                )
              })}
            </div>
            <CalloutBox color="#f1f5f9" border="#cbd5e1">
              <strong>법적 현실.</strong> 제198조 '부득이한 사유'는 천재지변이 기준입니다.
              선관위 배분 실수가 여기 해당하는지 판례가 없어요.
              현실적 경로는 <strong>선거소청 제기 + 공직선거법 개정 촉구</strong>입니다.
            </CalloutBox>
          </Section>
        )}

        {/* ── 상세 보기 ── */}
        <button
          onClick={() => setShowDetail(v => !v)}
          style={{
            width: '100%', padding: '12px 0', marginTop: 16,
            background: 'white', border: '1px solid #e5e7eb',
            borderRadius: 8, fontSize: 14, color: '#6b7280',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 6,
          }}
        >
          {showDetail ? '▲ 확인된 투표소 목록 접기' : '▼ 확인된 부족 투표소 목록 보기'}
        </button>

        {showDetail && (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {shortages.map(item => (
              <div key={item.psName} style={{
                background: 'white', border: '1px solid #e5e7eb',
                borderRadius: 8, padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{item['투표소명'] || item.psName}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>{item.emdName} · {item.addr}</div>
                  </div>
                  <span style={{
                    background: '#fef2f2', color: '#be123c',
                    fontSize: 11, padding: '3px 8px', borderRadius: 4, flexShrink: 0, marginLeft: 8,
                  }}>부족 확인</span>
                </div>
              </div>
            ))}
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              * 공개 보도에서 투표소명이 확인된 8곳. 전체 14곳 중 나머지는 이름 미공개.
            </p>
          </div>
        )}

        {/* ── 면책 ── */}
        <footer style={{ marginTop: 36, fontSize: 12, color: '#9ca3af', lineHeight: 1.8, borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
          <p>
            <strong>데이터 출처:</strong> 중앙선관위 선거통계시스템(VCVP01·VCCP08) 직접 크롤링.
            수집일 2026-06-05. 구청장 선거 기준 27개 동 전수.
          </p>
          <p style={{ marginTop: 6 }}>
            이 대시보드는 선거 결과(당락)를 단정하지 않습니다.
            투표용지 수급 관리 제도의 문제를 공개 데이터로 검증한 것입니다.
          </p>
        </footer>
      </div>
    </div>
  )
}

function Section({ label, title, children }) {
  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{
          background: '#111', color: '#fff',
          fontSize: 11, fontWeight: 700,
          padding: '2px 7px', borderRadius: 4, letterSpacing: 1,
        }}>{label}</span>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function CalloutBox({ children, color, border, style: extraStyle }) {
  return (
    <div style={{
      background: color,
      border: `1px solid ${border}`,
      borderRadius: 8, padding: '12px 14px',
      fontSize: 14, lineHeight: 1.7, color: '#374151',
      ...extraStyle,
    }}>
      {children}
    </div>
  )
}

function RuleCard({ icon, title, body, note, noteColor }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 12px' }}>
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, marginBottom: 6 }}>{body}</div>
      <span style={{
        background: noteColor + '20', color: noteColor,
        fontSize: 11, padding: '2px 7px', borderRadius: 4,
      }}>{note}</span>
    </div>
  )
}

function FactRow({ label, text, tag, tagColor }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
        <span style={{
          background: tagColor + '20', color: tagColor,
          fontSize: 11, padding: '2px 7px', borderRadius: 4,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>{tag}</span>
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>{text}</p>
    </div>
  )
}
