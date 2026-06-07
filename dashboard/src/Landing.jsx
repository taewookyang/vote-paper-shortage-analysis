import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const HISTORY = [
  {
    year: '1948',
    date: '5월 10일',
    label: '처음 쥔 한 표',
    desc: '제헌 국회의원을 뽑은 첫 총선거. 보통·평등·직접·비밀선거 원칙이 제도화됐습니다.',
    color: '#7fb3d3',
    icon: '✊',
  },
  {
    year: '1960',
    date: '3월 15일',
    label: '빼앗긴 한 표',
    desc: '3·15 부정선거. 집권 세력이 투표함을 바꿔치고 공개 투표를 강요했습니다. 한 표의 의미가 사라졌습니다.',
    color: '#c0392b',
    icon: '✖',
  },
  {
    year: '1960',
    date: '4월 19일',
    label: '피로 되찾은 한 표',
    desc: '4·19 혁명. 시민과 학생들이 거리로 나섰습니다. 이승만 정권은 물러났고 선거는 무효가 됐습니다.',
    color: '#e67e22',
    icon: '◉',
  },
  {
    year: '1972',
    date: '10월 17일',
    label: '또 사라진 한 표',
    desc: '유신헌법. 대통령 직선제가 폐지됐습니다. 국민의 한 표로 대통령을 뽑을 수 없게 됐습니다.',
    color: '#7f8c8d',
    icon: '—',
  },
  {
    year: '1987',
    date: '6월',
    label: '다시 쟁취한 한 표',
    desc: '6월 민주항쟁. 전국에서 수백만이 외쳤습니다. 직선제 개헌이 이루어졌고 한 표가 돌아왔습니다.',
    color: '#27ae60',
    icon: '◎',
  },
  {
    year: '2026',
    date: '6월 3일',
    label: '확인이 더 필요한 한 표',
    desc: '제9회 전국동시지방선거. 선관위는 전국 67곳 추가 송부와 5개 구의 중단 22곳을 집계했지만, 중단 투표소명 22개 명단은 공개하지 않았습니다. 송파구에 50% 기준을 일률 적용한 계산에서는 구 전체 여유가 남지만, 실제 투표소별 배부·이송 기록은 공개되지 않았습니다.',
    color: '#e63946',
    icon: '?',
    isFinal: true,
  },
]

function useIntersect(options) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
    }, options)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, visible]
}

function FadeIn({ children, delay = 0, style = {} }) {
  const [ref, visible] = useIntersect({ threshold: 0.15 })
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={{ background: '#080808', color: '#f0f0f0', fontFamily: '"Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* 상단 nav */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '14px 24px',
        background: scrolled ? 'rgba(8,8,8,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid #222' : 'none',
        transition: 'all 0.3s ease',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, color: '#888', letterSpacing: 1 }}>6·3 지방선거 · 투표용지 부족 분석</span>
        <button
          onClick={() => navigate('/data')}
          style={{
            background: '#e63946', color: 'white', border: 'none',
            padding: '7px 16px', borderRadius: 6, fontSize: 13,
            fontWeight: 600, cursor: 'pointer', letterSpacing: 0.5,
          }}
        >
          데이터 보기
        </button>
      </nav>

      {/* ── Hero ── */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '100px 24px 60px', position: 'relative' }}>

        {/* 배경 그라디언트 */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          background: 'radial-gradient(ellipse at 50% 40%, rgba(230,57,70,0.12) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 600 }}>
          <p style={{ fontSize: 13, color: '#e63946', letterSpacing: 3, fontWeight: 600, marginBottom: 28, textTransform: 'uppercase' }}>
            그 한 표를 위해
          </p>

          <h1 style={{
            fontSize: 'clamp(42px, 10vw, 80px)',
            fontWeight: 900, lineHeight: 1.1,
            margin: '0 0 24px',
            letterSpacing: -2,
          }}>
            한 표는 어떻게
            <br />
            <span style={{ color: '#e63946' }}>지켜져 왔나.</span>
          </h1>

          <p style={{ fontSize: 16, color: '#aaa', lineHeight: 1.8, maxWidth: 420, margin: '0 auto 40px' }}>
            1948년부터 지금까지, 한 표의 역사.
            <br />그리고 2026년 6월 3일.
          </p>

          <div
            style={{ color: '#666', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', animation: 'bounce 2s infinite' }}
            onClick={() => window.scrollTo({ top: window.innerHeight * 0.9, behavior: 'smooth' })}
          >
            <span style={{ letterSpacing: 1 }}>스크롤</span>
            <span style={{ fontSize: 20 }}>↓</span>
          </div>
        </div>
      </section>

      {/* ── 타임라인 ── */}
      <section style={{ padding: '60px 24px 80px', maxWidth: 680, margin: '0 auto' }}>

        <FadeIn>
          <p style={{ fontSize: 13, color: '#666', letterSpacing: 2, textAlign: 'center', marginBottom: 60 }}>
            한 표의 역사
          </p>
        </FadeIn>

        <div style={{ position: 'relative' }}>
          {/* 세로 라인 */}
          <div style={{
            position: 'absolute', left: 28, top: 0, bottom: 0, width: 1,
            background: 'linear-gradient(to bottom, transparent, #333 10%, #333 90%, transparent)',
          }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {HISTORY.map((item, i) => (
              <FadeIn key={item.year + item.date} delay={i * 80}>
                <div style={{ display: 'flex', gap: 0, paddingBottom: item.isFinal ? 0 : 56 }}>

                  {/* 아이콘 원 */}
                  <div style={{ flexShrink: 0, width: 56, display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
                    <div style={{
                      width: 36, height: 36,
                      borderRadius: '50%',
                      background: item.isFinal ? item.color : '#111',
                      border: `2px solid ${item.color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, color: item.isFinal ? 'white' : item.color,
                      fontWeight: 700, flexShrink: 0,
                      boxShadow: item.isFinal ? `0 0 20px ${item.color}55` : 'none',
                      zIndex: 1, position: 'relative',
                    }}>
                      {item.icon}
                    </div>
                  </div>

                  {/* 콘텐츠 */}
                  <div style={{ flex: 1, paddingLeft: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 26, fontWeight: 900, color: item.color, letterSpacing: -1, lineHeight: 1 }}>
                        {item.year}
                      </span>
                      <span style={{ fontSize: 13, color: '#666' }}>{item.date}</span>
                    </div>
                    <p style={{
                      fontSize: 17, fontWeight: 700, color: '#f0f0f0',
                      margin: '0 0 8px', lineHeight: 1.3,
                    }}>
                      {item.label}
                    </p>
                    <p style={{
                      fontSize: 14, color: item.isFinal ? '#ccc' : '#888',
                      margin: 0, lineHeight: 1.75,
                    }}>
                      {item.desc}
                    </p>

                    {item.isFinal && (
                      <div style={{ marginTop: 20 }}>
                        <div style={{
                          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
                        }}>
                          {[
                            { num: '15곳', label: '추가 송부(12곳 중단)', sub: '선관위 공식 · 송파구' },
                            { num: '4.3만장', label: '50% 가정상 여유', sub: '실제 배부량 아님 · 송파구' },
                            { num: '6개 동', label: '50% 가정 초과', sub: '동 평균 수요 · 송파구' },
                          ].map(s => (
                            <div key={s.num} style={{
                              background: '#111', border: '1px solid #333',
                              borderRadius: 10, padding: '14px 10px',
                              textAlign: 'center',
                            }}>
                              <div style={{ fontSize: 22, fontWeight: 900, color: '#e63946', letterSpacing: -0.5 }}>{s.num}</div>
                              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{s.label}</div>
                              <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>{s.sub}</div>
                            </div>
                          ))}
                        </div>
                        <p style={{ fontSize: 11, color: '#555', marginTop: 12, lineHeight: 1.6, textAlign: 'center' }}>
                          수치는 <strong style={{ color: '#888' }}>서울 송파구 사례</strong>를 설명합니다.
                          실제 부족 원인을 판단하려면 투표소별 배부·이송 기록이 더 필요합니다.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── 반전 섹션 ── */}
      <section style={{
        background: '#0d0d0d', borderTop: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a',
        padding: '72px 24px', textAlign: 'center',
      }}>
        <FadeIn>
          <p style={{ fontSize: 13, color: '#555', letterSpacing: 2, marginBottom: 24 }}>역설</p>
          <h2 style={{
            fontSize: 'clamp(24px, 6vw, 48px)',
            fontWeight: 900, lineHeight: 1.25,
            margin: '0 auto 24px',
            maxWidth: 520,
            letterSpacing: -1,
          }}>
              50% 가정을 구 전체에 적용하면 여유가 남습니다.
              <br />
              <span style={{ color: '#e63946' }}>그런데 일부 투표소에서는 실제 부족이 확인됐습니다.</span>
          </h2>
          <p style={{ fontSize: 15, color: '#777', lineHeight: 1.8, maxWidth: 400, margin: '0 auto 40px' }}>
            선관위 내부 지침: 지방선거 투표용지 인쇄량은 선거인의 50%를 하한으로 설정.
            <br />
            법령이 아닌 내부 지침이며, 실제 투표소별 배부량은 공개되지 않았습니다.
          </p>
        </FadeIn>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '80px 24px 100px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <FadeIn>
          <p style={{ fontSize: 13, color: '#555', letterSpacing: 2, marginBottom: 20 }}>검증 가능한 데이터</p>
          <h3 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 12px', lineHeight: 1.4 }}>
            선관위 공개 데이터를
            <br />직접 크롤링해 확인했습니다.
          </h3>
          <p style={{ fontSize: 14, color: '#666', lineHeight: 1.7, marginBottom: 36 }}>
            특정 후보 유불리나 선거 결과를 단정하지 않습니다.
            <br />확인된 사실과 추가 확인이 필요한 지점을 나눠 보여줍니다.
          </p>

          <button
            onClick={() => navigate('/data')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: '#e63946', color: 'white', border: 'none',
              padding: '16px 32px', borderRadius: 8, fontSize: 15,
              fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3,
              boxShadow: '0 0 30px rgba(230,57,70,0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#c1121f'; e.currentTarget.style.transform = 'scale(1.03)' }}
            onMouseOut={e => { e.currentTarget.style.background = '#e63946'; e.currentTarget.style.transform = 'scale(1)' }}
          >
            데이터 대시보드 보기
            <span style={{ fontSize: 18 }}>→</span>
          </button>

          <p style={{ fontSize: 12, color: '#444', marginTop: 20 }}>
            서울 25개 구 427개 동 · 선관위 VCCP08 직접 크롤링
          </p>
        </FadeIn>
      </section>

      {/* 푸터 */}
      <footer style={{ borderTop: '1px solid #1a1a1a', padding: '24px', textAlign: 'center', fontSize: 12, color: '#444', lineHeight: 1.8 }}>
        <p>이 페이지는 공개 데이터로만 작성됐습니다. 선거 결과를 단정하지 않습니다.</p>
        <p style={{ marginTop: 4 }}>
          <a
            href="https://github.com/taewookyang/vote-paper-shortage-analysis"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#555', textDecoration: 'underline' }}
          >
            GitHub 소스 공개
          </a>
        </p>
      </footer>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(8px); }
        }
      `}</style>
    </div>
  )
}
