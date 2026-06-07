import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell,
  ResponsiveContainer, ReferenceLine, Tooltip, XAxis, YAxis,
} from 'recharts'

const DATA_FILES = {
  dongAnalysis:   '/data/dong_analysis_2026.json',
  voteTimeline:   '/data/vote_progress_timeline_2026.json',
  shortages:      '/data/confirmed_shortages.json',
  seoul:          '/data/seoul_analysis_2026.json',
  yearlyCompare:  '/data/yearly_comparison.json',
  songpaMap:      '/data/songpa_boundaries_2026.json',
  targetedMargins:'/data/targeted_margin_screening_2026.json',
  shutdownStressTest: '/data/shutdown_stress_test_2026.json',
  shutdownRegistry: '/data/shutdown_22_registry_2026.json',
  knownLocationMargins: '/data/known_location_margin_mapping_2026.json',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [showDetail, setShowDetail] = useState(false)
  const [showAllMargins, setShowAllMargins] = useState(false)

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
  const seoul    = data.seoul || null
  const yearlyCompare = data.yearlyCompare?.years || []
  const songpaMap = data.songpaMap || null
  const targetedMargins = data.targetedMargins?.items || []
  const priorityMargins = targetedMargins.filter(item => item['검토등급'] === '우선검토')
  const shutdownStress = data.shutdownStressTest || null
  const shutdownRegistry = data.shutdownRegistry || null
  const knownLocationMargins = data.knownLocationMargins?.items || []
  const knownLocationPriority = knownLocationMargins.filter(item => item['검토등급'] !== '참고')
  const namedPollingPlaces = data.knownLocationMargins?.meta?.namedPollingPlaces || 0

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
            송파구 50% 가정에는 여유가 남는데, 왜 일부 투표소에서는 부족했나
          </h1>
          <p style={{ fontSize: 14, color: '#bbb', marginTop: 10, lineHeight: 1.7 }}>
            공개 데이터로 확인되는 범위와 아직 확인할 수 없는 범위를 나눠 봅니다.<br />
            특정 후보 유불리나 선거 결과 영향은 단정하지 않습니다.
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 48px' }}>

        {/* ── 역설 카드 ── */}
        <div style={{ marginTop: 24, background: 'white', border: '2px solid #111', borderRadius: 12, padding: '20px 18px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', letterSpacing: 1, marginBottom: 14 }}>현재 데이터가 보여주는 핵심 질문</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#be123c', lineHeight: 1 }}>15곳</div>
              <div style={{ fontSize: 13, color: '#374151', marginTop: 6, fontWeight: 600 }}>추가 송부(12곳 중단)</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>선관위 공식 · 송파구</div>
            </div>
            <div style={{ fontSize: 28, color: '#d1d5db', fontWeight: 300 }}>↔</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#0f766e', lineHeight: 1 }}>+4.3만장</div>
              <div style={{ fontSize: 13, color: '#374151', marginTop: 6, fontWeight: 600 }}>50% 가정상 구 전체 여유</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>개표결과 기반 계산 · 실제 배부량 아님</div>
            </div>
          </div>
          <div style={{ marginTop: 16, background: '#111', borderRadius: 8, padding: '12px 14px', color: 'white', fontSize: 14, lineHeight: 1.6, textAlign: 'center' }}>
            구 전체에 50%를 일률 적용한 계산에서는 여유가 남습니다.
            <strong> 실제 부족 원인을 판단하려면 투표소별 배부량·이송 기록이 필요합니다.</strong>
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
            송파구 사례 기준 · 전국 동별 선거일 수요 256개 구시군 수집 완료
          </p>
        </div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {[
            { label: '선관위 공식 집계', body: '67곳 추가 송부 · 22곳 중단', color: '#be123c', bg: '#fef2f2' },
            { label: '계산으로 보는 것', body: '50% 일률 가정의 여유 수준', color: '#b45309', bg: '#fff7ed' },
            { label: '아직 모르는 것', body: '실제 배부량 · 이탈 인원', color: '#475569', bg: '#f1f5f9' },
          ].map(item => (
            <div key={item.label} style={{ background: item.bg, borderRadius: 8, padding: '11px 9px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: item.color }}>{item.label}</div>
              <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.45, marginTop: 5 }}>{item.body}</div>
            </div>
          ))}
        </div>

        {/* ── 전국 현황 ── */}
        <Section label="전국" title="14,288개 투표소 중 67개">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { num: '67곳', label: '추가 송부', sub: '선관위 공식' },
              { num: '22곳', label: '투표 중단', sub: '선관위 공식' },
              { num: '?명', label: '투표 못한 유권자', sub: '"파악 불가"' },
            ].map(s => (
              <div key={s.num} style={{ background: s.num === '?명' ? '#f1f5f9' : '#fef2f2', border: `1px solid ${s.num === '?명' ? '#cbd5e1' : '#fca5a5'}`, borderRadius: 10, padding: '14px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: s.num === '?명' ? '#374151' : '#be123c', lineHeight: 1 }}>{s.num}</div>
                <div style={{ fontSize: 12, color: '#374151', marginTop: 5, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>{s.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 14 }}>
            {[
              { region: '서울', count: 35 },
              { region: '부산', count: 8 },
              { region: '경남', count: 8 },
              { region: '대구', count: 7 },
              { region: '인천', count: 6 },
              { region: '울산', count: 3 },
            ].map(r => (
              <div key={r.region} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.region}</span>
                <span style={{ fontSize: 13, color: '#be123c', fontWeight: 700 }}>{r.count}곳</span>
              </div>
            ))}
          </div>
          <CalloutBox color="#fef2f2" border="#fca5a5">
            선관위는 투표 포기 후 돌아간 유권자 수에 대해 <strong>"정확히 파악하기 어렵다"</strong>고 답했습니다.<br />
            <span style={{ fontSize: 12, color: '#9ca3af' }}>공개된 집계가 없어 현재 데이터만으로 규모를 산정할 수 없습니다. · 출처: 파이낸셜뉴스 2026.06.05</span>
          </CalloutBox>
        </Section>

        {/* ── 22곳 중단 지역 스트레스 테스트 ── */}
        {shutdownRegistry && (
          <Section label="22곳 추적표" title={`공식 중단 22곳 중 위치 연결 ${shutdownRegistry.meta?.linkedReportedShutdownLocations || 0}곳`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
              {[
                { num: shutdownRegistry.meta?.officialTotal || 22, label: '공식 구별 집계' },
                { num: shutdownRegistry.meta?.linkedReportedShutdownLocations || 0, label: '보도상 중단 위치 연결' },
                { num: shutdownRegistry.meta?.unpublishedLocations || 0, label: '위치 미공개' },
              ].map(item => (
                <div key={item.label} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: '12px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#334155' }}>{item.num}곳</div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{item.label}</div>
                </div>
              ))}
            </div>
            <CalloutBox color="#f1f5f9" border="#cbd5e1">
              보도상 위치 연결은 중앙선관위 공식 투표소명 명단 확인이 아닙니다.
              위치가 공개되지 않은 19곳은 추정으로 채우지 않았습니다.
            </CalloutBox>
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              {(shutdownRegistry.items || []).filter(item => item['투표소명']).map(item => (
                <div key={`${item['구시군']}-${item['공식중단순번']}`} style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{item['구시군']} {item['투표소명']}</div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{item['사건표현']} · {item['출처주체']}</div>
                  <a href={item['출처URL']} target="_blank" rel="noreferrer" style={{ display: 'inline-block', fontSize: 10, color: '#2563eb', marginTop: 5 }}>
                    근거 기사 보기
                  </a>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.6 }}>
              별도 관련 사건: 중단 여부가 확인되지 않은 보도상 지연 위치 {shutdownRegistry.meta?.relatedDelayLocationsNotAssigned || 0}곳은 22개 슬롯에 배정하지 않았습니다.
            </p>
          </Section>
        )}

        {shutdownStress && (
          <Section label="증거 구분" title="중단 22곳 — 공식 집계·보도 위치·모델 후보">
            <CalloutBox color="#fff7ed" border="#fdba74">
              <strong>선관위가 공식 발표한 것은 5개 구의 중단 수 합계입니다.</strong>
              중앙선관위가 투표소명 22개를 공개한 명단은 아직 확인되지 않았습니다.
            </CalloutBox>

            {/* 구별 공식 발표 */}
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
              {Object.entries(shutdownStress.official_shutdown || {})
                .filter(([k]) => k !== '합계')
                .map(([gu, cnt]) => (
                  <div key={gu} style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 6px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#be123c' }}>{cnt}곳</div>
                    <div style={{ fontSize: 11, color: '#374151', marginTop: 4, fontWeight: 600 }}>{gu}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>선관위 공식</div>
                  </div>
                ))}
            </div>

            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
              {[
                { num: '0곳', label: '중앙선관위 명단상 위치', sub: '명단 미공개' },
                { num: `${shutdownStress.summary?.media_reported_shutdown_locations || 0}곳`, label: '언론 보도상 중단 위치', sub: '현장 기사 기준' },
                { num: `${shutdownStress.summary?.local_nec_reported_delay_locations || 0}곳`, label: '지역선관위 설명상 지연', sub: '언론 인용 기준' },
                { num: `${shutdownStress.summary?.media_reported_delay_locations || 0}곳`, label: '언론 보도상 지연 위치', sub: '현장 기사 기준' },
              ].map(item => (
                <div key={item.label} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 7px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#334155' }}>{item.num}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginTop: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{item.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
              {(shutdownStress.reported_events || []).map(item => (
                <div key={item.polling_place} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>{item.gu} {item.polling_place}</strong>
                    <span style={{ fontSize: 11, fontWeight: 700, color: item.evidence_level === 'media_reported_shutdown' ? '#be123c' : '#b45309', whiteSpace: 'nowrap' }}>
                      {item.event}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{item.source_actor}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{item.note}</div>
                </div>
              ))}
            </div>

            {/* 스트레스 테스트 후보 동 목록 */}
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 16, marginBottom: 8 }}>
              별도 모델 조사 후보 — 50% 배부 가정에서 동 평균 수요가 기준을 넘는 곳:
              <strong> {shutdownStress.model_candidates?.length || 0}개 동</strong>
            </p>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: -3, marginBottom: 8 }}>
              아래 목록은 실제 중단 위치 추정 확률이 아니라 운영 기록을 먼저 확인할 후보입니다.
            </p>
            <div style={{ display: 'grid', gap: 6 }}>
              {(shutdownStress.model_candidates || []).map(d => (
                <div key={d.dong} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{d.gu} {d.dong}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>투표소 {d.polling_place_count}개</span>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                      {d.evidence_level === 'media_reported_shutdown'
                        ? '이 동에서 언론 보도상 중단 위치 존재'
                        : d.evidence_level === 'local_nec_reported_delay'
                          ? '이 동에서 지역선관위 설명상 지연 위치 존재'
                          : d.evidence_level === 'media_reported_delay'
                            ? '이 동에서 언론 보도상 지연 위치 존재'
                          : d.evidence_level === 'reported_shortage'
                            ? '이 동에서 언론 보도상 부족 위치 존재'
                          : '모델 후보 · 실제 위치 미확인'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#be123c' }}>
                      {typeof d.demand_ratio === 'number' ? `${(d.demand_ratio * 100).toFixed(1)}%` : d.demand_ratio}
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>50% 가정 대비 수요 수준</div>
                  </div>
                </div>
              ))}
            </div>

            {/* 구 단위만 확인 */}
            {shutdownStress.gu_only_unresolved?.length > 0 && (
              <div style={{ marginTop: 14, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '12px 14px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                  실제 중단 동 위치 미공개
                </p>
                <ul style={{ fontSize: 12, color: '#6b7280', margin: 0, paddingLeft: 16, lineHeight: 1.7 }}>
                  {shutdownStress.gu_only_unresolved.map(item => (
                    <li key={item.gu}>
                      {item.gu}: 중단 {item.official_shutdown_count}곳, 50% 가정 대비 동 평균 최고 {(item.max_dong_demand_ratio * 100).toFixed(1)}%
                    </li>
                  ))}
                </ul>
                <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, marginBottom: 0 }}>
                  동 평균이 50% 이하여도 특정 투표소에서는 부족과 중단이 발생할 수 있습니다.
                </p>
              </div>
            )}
          </Section>
        )}

        {knownLocationPriority.length > 0 && (
          <Section label="보도 위치 직접 연결" title={`언론 보도상 이름 공개 투표소 ${namedPollingPlaces}곳 — 우선 확인 연결 ${knownLocationPriority.length}건`}>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 10, lineHeight: 1.6 }}>
              언론 보도에 등장한 투표소명을 선관위 결과표의 읍면동 구성과 연결해 광역·기초의원 선거구를 확인했습니다.
            </p>
            <CalloutBox color="#fff7ed" border="#fdba74">
              표차는 영향의 증거가 아닙니다.
              아래 목록은 실제 중단·부족 위치와 선거구가 연결된 경우 중 운영 기록을 먼저 확인할 순서입니다.
            </CalloutBox>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {knownLocationPriority.map(item => (
                <div key={`${item['투표소명']}-${item['선거종류']}-${item['선거구코드']}`} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '11px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{item['구시군']} {item['투표소명']}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                        {item['증거수준']} · {item['선거종류']} {item['선거구명']}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: item['검토등급'] === '최우선확인' ? '#be123c' : '#b45309' }}>
                        {Number(item['표차']).toLocaleString()}표
                      </div>
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>{item['검토등급']}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── 전국 표차 ── */}
        {priorityMargins.length > 0 && (
          <Section label="위치 미확인 참고" title={`추가 송부 27개 구시군 · 212개 선거구 — 500표 이하 ${priorityMargins.length}개`}>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 10, lineHeight: 1.6 }}>
              추가 송부가 발생한 <strong>27개 구시군</strong> 안의 광역·기초의원 선거구를 폭넓게 살핀 참고 목록입니다.
              실제 부족 투표소와 연결되지 않은 선거구도 포함됩니다.
            </p>
            <CalloutBox color="#fff7ed" border="#fdba74">
              500표는 법적 기준이 아니라 위치 확인 순서를 좁히기 위한 편의상 기준입니다.
              <strong> 실제 투표소 위치와 운영 기록이 연결되기 전에는 결과 영향과 무관한 목록</strong>입니다.
            </CalloutBox>
            <div className="margin-screening-list" style={{ marginTop: 12 }}>
              {(showAllMargins ? priorityMargins : priorityMargins.slice(0, 8)).map(item => (
                <MarginScreeningRow key={`${item['선거종류']}-${item['선거구코드']}`} item={item} />
              ))}
            </div>
            {priorityMargins.length > 8 && (
              <button className="margin-screening-toggle" onClick={() => setShowAllMargins(v => !v)}>
                {showAllMargins ? '접기' : `전체 ${priorityMargins.length}개 보기`}
              </button>
            )}
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 10, lineHeight: 1.6 }}>
              투표소와 선거구의 직접 연결은 별도 검증 필요. 데이터: 중앙선관위 VCCP08, 2026-06-06 수집.
            </p>
          </Section>
        )}

        {/* ── 서울 현황 ── */}
        {seoul && (
          <Section label="서울" title="서울 25개 구 — 50% 일률 가정 비교">
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 12, lineHeight: 1.6 }}>
              서울 427개 동 중 <strong style={{ color: '#be123c' }}>{seoul.totalOverDongs}개 동</strong>에서 선거일 수요가 전체 선거인수의 50%를 넘었습니다.
              50%를 일률 적용할 때 여유가 작아질 수 있는 곳은 송파구 밖에도 있습니다.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {seoul.districts.filter(d => d.overDongs > 0).map(d => {
                const color = d.comparisonBand === 'HIGH' ? '#be123c' : d.comparisonBand === 'MEDIUM' ? '#b45309' : '#6b7280'
                const bg    = d.comparisonBand === 'HIGH' ? '#fef2f2' : d.comparisonBand === 'MEDIUM' ? '#fffbeb' : '#f9fafb'
                const bdr   = d.comparisonBand === 'HIGH' ? '#fca5a5' : d.comparisonBand === 'MEDIUM' ? '#fbbf24' : '#e5e7eb'
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
        <Section label="01" title="50% 일률 가정을 송파구 27개 동에 적용하면">
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 4, lineHeight: 1.6 }}>
            <strong>동 평균 선거일 수요가 50%보다 높았던 곳을 표시합니다.</strong> 실제 투표소별 배부량이나 부족량을 뜻하지 않습니다.
          </p>
          {songpaMap
            ? <SongpaBoundaryMap boundaries={songpaMap} dongs={dongs} shortages={shortages} />
            : <DongRateChart dongChart={dongChart} exceedingCount={exceeding.length} />
          }
        </Section>

        {/* ── STORY 2: 50% 가정이 취약해질 수 있는 조건 ── */}
        <Section label="02" title="50% 일률 기준은 어디서 여유가 작아지나">
          <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <RuleCard
                icon="50%"
                title="선관위 내부 지침"
                body="지방선거: 선거인의 50%를 인쇄 하한으로 설정"
                note="법령이 아닌 내부 지침"
                noteColor="#b45309"
              />
              <RuleCard
                icon="?"
                title="아직 필요한 자료"
                body="투표소별 실제 인쇄·배부·추가 이송 수량"
                note="투표소별 배부량 미공개"
                noteColor="#be123c"
              />
            </div>
          </div>
          <CalloutBox color="#fef3c7" border="#fbbf24">
            송파구 동 단위에서 사전투표율과 선거일 투표율은 <strong>반대 방향의 관계</strong>를 보입니다.<br />
            잠실3동: 사전투표율 11.3% → 선거일 투표율 56.7%<br />
            상관계수 <strong>−0.46</strong>은 중간 정도의 음의 상관이며, 원인·결과를 뜻하지 않습니다.
          </CalloutBox>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#374151' }}>동별 사전투표율과 선거일 투표율 비교</div>
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
                    ? <span style={{ fontSize: 11, color: '#be123c', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, padding: '2px 7px', textAlign: 'center' }}>50% 가정 초과</span>
                    : <span style={{ fontSize: 11, color: '#0f766e', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 4, padding: '2px 7px', textAlign: 'center' }}>50% 가정 이내</span>
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
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>개 동 50% 가정 초과</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color, marginTop: 6 }}>최대 {y.maxEdayRate}%</div>
                  </div>
                )
              })}
            </div>
            <CalloutBox color="#fef3c7" border="#fbbf24">
              <strong>2018년에도 7개 동의 선거일 수요가 50%를 넘었습니다.</strong><br />
              과거 실제 배부량과 비상 재고 기록이 공개되지 않아, 당시 부족이 확인되지 않은 이유는
              현재 데이터만으로 설명할 수 없습니다.<br />
              <span style={{ fontSize: 11, color: '#92400e', marginTop: 6, display: 'block' }}>
                2018·2022년 데이터: 중앙선관위 개표결과 (NEC VCCP08) 직접 크롤링.
                인쇄 기준 60% 출처: 한국행정연구원 (2022), 중앙선거관리위원회 정책연구용역.
              </span>
            </CalloutBox>
          </div>
        )}

        {/* ── STORY 3: 시간대별 집계의 한계 ── */}
        <Section label="03" title="오후 1시 급증은 부족 발생 시각이 아니다">
          <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 12, color: '#374151' }}>
            공개 시간대별 현황은 낮 12시 <strong>19.6%</strong>에서 오후 1시 <strong>47.1%</strong>로 크게 변합니다.
            이 변화의 대부분은 오후 1시부터 사전투표가 합계에 포함되는 집계 방식 때문입니다.
          </p>
          <CalloutBox color="#eff6ff" border="#93c5fd">
            이 그래프로는 투표소별 용지 소진 시각이나 대기·이탈 인원을 알 수 없습니다.
            이를 확인하려면 투표소별 추가 송부 요청·도착 시각과 중단 기록이 필요합니다.
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

        {/* ── STORY 4: 관리 기준에서 확인할 쟁점 ── */}
        <Section label="04" title="관리 기준에서 확인할 쟁점">
          <div style={{ display: 'grid', gap: 10 }}>
            <FactRow
              label="공직선거법"
              text="법률에는 투표용지 인쇄 수량의 명시적 하한이 확인되지 않습니다. 인쇄 주체와 기한은 규정되어 있습니다."
              tag="명시적 하한 없음"
              tagColor="#be123c"
            />
            <FactRow
              label="선관위 내부 기준 (공개 보도 기준)"
              text="대통령선거·국회의원선거는 60%, 지방선거는 50% 하한으로 알려졌습니다. 세부 적용 과정은 추가 공개가 필요합니다."
              tag="내부 지침"
              tagColor="#b45309"
            />

            {/* 결정적 변화 강조 */}
            <div style={{ background: '#fff1f2', border: '2px solid #fca5a5', borderRadius: 10, padding: '14px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#be123c' }}>기준 변화 — 확인할 쟁점</span>
                <span style={{ background: '#be123c20', color: '#be123c', fontSize: 11, padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>60% → 50%</span>
              </div>

              {/* 선거 종류별 기준 비교 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 12 }}>
                {[
                  { label: '대선', prev: '70%', curr: '60%', safe: true },
                  { label: '총선', prev: '—', curr: '60%', safe: true },
                  { label: '지방선거', prev: '60%', curr: '50%', safe: false },
                ].map(s => (
                  <div key={s.label} style={{
                    background: s.safe ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${s.safe ? '#86efac' : '#fca5a5'}`,
                    borderRadius: 8, padding: '10px 8px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>{s.label}</div>
                    {s.prev !== '—' && (
                      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>과거 실무 {s.prev}</div>
                    )}
                    <div style={{ fontSize: 20, fontWeight: 900, color: s.safe ? '#0f766e' : '#be123c', lineHeight: 1 }}>{s.curr}</div>
                    <div style={{ fontSize: 10, color: s.safe ? '#6b7280' : '#be123c', marginTop: 4 }}>
                      {s.safe ? '현행 하한' : '현행 하한 ↓'}
                    </div>
                  </div>
                ))}
              </div>

              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>
                선관위는 21대 대선 이후 사무편람을 개정했습니다.
                대선·총선은 <strong>60% 유지</strong>, 지방선거만 <strong>50%로 하향</strong>.
                공개 보도에 따르면 2022년까지 실무에서 60%로 운용하던 지방선거 기준이 낮아졌습니다.
                이 변화가 실제 부족에 얼마나 영향을 주었는지는 투표소별 배부 기록으로 확인해야 합니다.
              </p>
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, borderTop: '1px solid #fca5a5', paddingTop: 8 }}>
                출처: 한국행정연구원 (2022). 「선거 절차사무 개선방안」. 중앙선관위 정책연구용역. p.36. /
                국민일보 2026.06.05 "[단독] 최소 50% 인쇄 지침에 투표용지 부족…선관위, 기준 손질한다"
              </p>
            </div>

            <FactRow
              label="여유분 결정의 배경"
              text={`공개 보도에는 잔여 투표용지 관리 부담과 감사 우려가 배부 결정의 배경으로 언급됩니다. 실제 결정 근거는 공식 기록 확인이 필요합니다.`}
              tag="기록 확인 필요"
              tagColor="#7c3aed"
            />
            <FactRow
              label="송파구 적용 과정"
              text="공개 설명상 50% 수준을 적용한 것으로 알려졌습니다. 투표소별 최종 수량과 조정 근거는 아직 공개되지 않았습니다."
              tag="세부 자료 미공개"
              tagColor="#6b7280"
            />
            <FactRow
              label="신설·재획정 투표구"
              text="과거 수요 기록이 부족한 투표구에는 별도 안전계수가 적용됐는지 확인할 필요가 있습니다."
              tag="적용 여부 확인"
              tagColor="#b45309"
            />
          </div>
          <CalloutBox color="#f0fdf4" border="#86efac" style={{ marginTop: 12 }}>
            <strong>검토할 수 있는 개선안.</strong><br />
            ① 인쇄·배부 기준과 근거 공개<br />
            ② 투표구별 과거 수요와 불확실성을 반영한 차등 배분<br />
            ③ 신설·재획정 투표구 안전계수 및 비상 이송 기록 표준화
          </CalloutBox>
        </Section>

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
              * 공개 보도로 이름과 위치가 확인된 투표소만 표시합니다. 전체 위치는 아직 공개되지 않았습니다.
            </p>
          </div>
        )}

        {/* ── 면책 ── */}
        <footer style={{ marginTop: 36, fontSize: 12, color: '#9ca3af', lineHeight: 1.8, borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
          <p>
            <strong>데이터 출처:</strong> 중앙선관위 선거통계시스템(VCVP01·VCCP08) 직접 크롤링.
            송파구 상세 분석은 구청장 선거 기준 27개 동, 전국 동별 수요는 256개 구시군을 수집했습니다.
          </p>
          <p style={{ marginTop: 6 }}>
            이 대시보드는 선거 결과(당락)나 실제 이탈 유권자 수를 단정하지 않습니다.
            확인된 사실과 공개 데이터로 계산한 스트레스 테스트를 구분해 보여줍니다.
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

function DongRateChart({ dongChart, exceedingCount }) {
  return (
    <>
      <div style={{ height: 520, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dongChart} layout="vertical" margin={{ left: 8, right: 44, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
            <XAxis type="number" domain={[0, 65]} tickFormatter={value => `${value}%`} tick={{ fontSize: 11 }} />
            <YAxis dataKey="name" type="category" width={60} tick={{ fontSize: 11 }} />
            <ReferenceLine x={50} stroke="#be123c" strokeDasharray="4 3" strokeWidth={2} />
            <Tooltip formatter={value => [`${value}%`, '당일투표율']} />
            <Bar dataKey="rate" radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 11, formatter: value => `${value}%` }}>
              {dongChart.map(dong => <Cell key={dong.name} fill={dong.over ? '#be123c' : '#0f766e'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: '#6b7280', marginTop: 6 }}>
        <MapLegend color="#be123c" label={`50% 가정 초과 (${exceedingCount}개 동)`} />
        <MapLegend color="#0f766e" label={`50% 이하 (${dongChart.length - exceedingCount}개 동)`} />
      </div>
      <p style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.6 }}>
        실제 경계 지도는 경계 데이터 재배포 조건 확인 후 활성화할 예정입니다.
      </p>
    </>
  )
}

function MarginScreeningRow({ item }) {
  const hasNamedPollingPlaces = item['공개투표소명수'] > 0
  return (
    <div className="margin-screening-row">
      <div>
        <div className="margin-screening-title">
          {item['시도']} {item['구시군']} · {item['선거구명']}
        </div>
        <div className="margin-screening-meta">
          {item['선거종류']} · 추가 송부 {item['추가송부투표소수']}곳 ·
          {hasNamedPollingPlaces ? ` 투표소명 ${item['공개투표소명수']}곳 공개` : ' 상세 투표소명 미공개'}
        </div>
      </div>
      <div className="margin-screening-value">
        <strong>{item['당선권경계표차'].toLocaleString()}표</strong>
        <span>당선권 경계</span>
      </div>
    </div>
  )
}

function SongpaBoundaryMap({ boundaries, dongs, shortages }) {
  const initialDong = [...dongs].sort((a, b) => b.electionDayRate - a.electionDayRate)[0]?.dong
  const [selectedName, setSelectedName] = useState(initialDong)
  const dongByName = new Map(dongs.map(dong => [dong.dong, dong]))
  const confirmedByDong = shortages.reduce((counts, item) => {
    counts[item.emdName] = (counts[item.emdName] || 0) + 1
    return counts
  }, {})
  const selected = dongByName.get(selectedName)
  const selectedConfirmed = confirmedByDong[selectedName] || 0

  const fillFor = (name) => {
    const dong = dongByName.get(name)
    if (confirmedByDong[name]) return '#be123c'
    if (dong?.exceedsPrintLimit) return '#e58b2b'
    if (dong) return '#0f766e'
    return '#d1d5db'
  }

  return (
    <div className="songpa-boundary-map">
      <svg
        viewBox={boundaries.viewBox}
        className="songpa-boundary-svg"
        role="img"
        aria-label="송파구 행정동별 선거일 당일투표율 지도"
      >
        {boundaries.features.map(feature => {
          const dong = dongByName.get(feature.name)
          const confirmed = confirmedByDong[feature.name] || 0
          const isSelected = feature.name === selectedName
          const title = dong
            ? `${feature.name}: 당일투표율 ${(dong.electionDayRate * 100).toFixed(1)}%, 확인된 부족 투표소 ${confirmed}곳`
            : `${feature.name}: 분석 데이터 없음`
          return (
            <g key={feature.code}>
              <path
                d={feature.path}
                fill={fillFor(feature.name)}
                className={`songpa-boundary-path${isSelected ? ' is-selected' : ''}`}
                tabIndex="0"
                role="button"
                aria-label={title}
                onClick={() => setSelectedName(feature.name)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') setSelectedName(feature.name)
                }}
              >
                <title>{title}</title>
              </path>
              <text
                x={feature.centroid[0]}
                y={feature.centroid[1]}
                className="songpa-boundary-label"
                aria-hidden="true"
              >
                {feature.name}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="songpa-map-legend" aria-label="지도 범례">
        <MapLegend color="#be123c" label={`실제 부족 확인 (${Object.keys(confirmedByDong).length}개 동)`} />
        <MapLegend color="#e58b2b" label={`50% 하한 초과 (${exceedingCount(dongs)}개 동)`} />
        <MapLegend color="#0f766e" label="50% 이하" />
      </div>

      {selected && (
        <div className="songpa-map-selection" aria-live="polite">
          <div>
            <strong>{selected.dong}</strong>
            <span>선거일 당일투표율</span>
          </div>
          <div>
            <strong>{(selected.electionDayRate * 100).toFixed(1)}%</strong>
            <span>50% 가정 대비 동 전체 {selected.shortage > 0 ? `+${selected.shortage.toLocaleString()}명` : '초과 없음'}</span>
          </div>
          <div>
            <strong>{selectedConfirmed}곳</strong>
            <span>실제 부족 확인 투표소</span>
          </div>
        </div>
      )}

      <p className="songpa-map-note">
        동을 선택하면 수치를 확인할 수 있습니다. 50% 가정 대비 인원은 실제 투표소별 부족량이 아니라
        동 전체 당일투표자와 가정상 하한의 차이입니다.
      </p>
      <a
        className="songpa-map-source"
        href={boundaries.source.repository}
        target="_blank"
        rel="noreferrer"
      >
        행정동 경계: {boundaries.source.attribution} ({boundaries.source.version})
      </a>
    </div>
  )
}

function MapLegend({ color, label }) {
  return (
    <span>
      <span style={{ background: color }}></span>
      {label}
    </span>
  )
}

function exceedingCount(dongs) {
  return dongs.filter(dong => dong.exceedsPrintLimit).length
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
