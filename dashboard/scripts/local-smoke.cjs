const { chromium } = require('playwright')
const path = require('path')

const target = process.env.LOCAL_DASHBOARD_URL || 'http://127.0.0.1:5184/data'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function inspect(page, viewportName) {
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByText('송파구 50% 가정에는 여유가 남는데, 왜 일부 투표소에서는 부족했나').waitFor({ timeout: 30000 })
  await page.getByText('중단 22곳 — 공식 집계·보도 위치·모델 후보').waitFor({ timeout: 30000 })
  const state = await page.evaluate(() => ({
    text: document.body.innerText,
    redBars: document.querySelectorAll('.recharts-bar-rectangle').length,
    mapSvg: document.querySelectorAll('.songpa-boundary-svg').length,
    priorityRows: document.querySelectorAll('.margin-screening-row').length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))

  assert(state.text.includes('50% 일률 가정을 송파구 27개 동에 적용하면'), `${viewportName}: missing Songpa detail section`)
  assert(!state.text.includes('지도 경계 데이터를 불러오지 못했습니다'), `${viewportName}: broken map error is visible`)
  assert(state.redBars >= 27, `${viewportName}: expected fallback dong chart bars`)
  assert(state.mapSvg === 0, `${viewportName}: unlicensed boundary map should not render`)
  assert(state.text.includes('추가 송부 27개 구시군'), `${viewportName}: missing targeted screening section`)
  assert(state.text.includes('중앙선관위 명단상 위치'), `${viewportName}: missing official-location gap`)
  assert(state.text.includes('언론 보도상 중단 위치'), `${viewportName}: missing media evidence layer`)
  assert(state.text.includes('모델 조사 후보'), `${viewportName}: missing model evidence layer`)
  assert(state.text.includes('언론 보도상 이름 공개 투표소 16곳'), `${viewportName}: missing known-location mapping section`)
  assert(state.text.indexOf('언론 보도상 이름 공개 투표소 16곳') < state.text.indexOf('추가 송부 27개 구시군'), `${viewportName}: verified mapping should precede broad screening`)
  assert(state.text.includes('오후 1시 급증은 부족 발생 시각이 아니다'), `${viewportName}: timeline limitation is missing`)
  assert(!state.text.includes('언제 터졌나 — 오후 1시'), `${viewportName}: outdated timeline overclaim is visible`)
  assert(!state.text.includes('재투표 가능성은?'), `${viewportName}: outdated legal assessment is visible`)
  assert(!state.text.includes('한도 초과'), `${viewportName}: misleading limit wording is visible`)
  assert(state.text.includes('남해군가선거구'), `${viewportName}: missing smallest-margin district`)
  assert(state.priorityRows === 8, `${viewportName}: expected eight initial priority rows`)
  assert(!state.horizontalOverflow, `${viewportName}: horizontal overflow detected`)
}

async function inspectLanding(page, viewportName) {
  const landingUrl = new URL('/', target).toString()
  await page.goto(landingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByText('한 표는 어떻게').waitFor({ timeout: 30000 })
  const state = await page.evaluate(() => ({
    text: document.body.innerText,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))

  assert(state.text.includes('확인이 더 필요한 한 표'), `${viewportName}: cautious 2026 framing is missing`)
  assert(state.text.includes('50% 가정상 여유'), `${viewportName}: hypothetical surplus label is missing`)
  assert(!state.text.includes('관리받지 못한 한 표'), `${viewportName}: outdated overclaim is visible`)
  assert(!state.text.includes('구 전체 잉여'), `${viewportName}: misleading surplus wording is visible`)
  assert(!state.horizontalOverflow, `${viewportName}: landing horizontal overflow detected`)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })

  await inspect(desktop, 'desktop')
  await inspect(mobile, 'mobile')
  await inspectLanding(desktop, 'desktop')
  await inspectLanding(mobile, 'mobile')
  await desktop.screenshot({ path: path.resolve(__dirname, '..', 'dashboard-local-smoke.png'), fullPage: false })

  await browser.close()
  console.log(`Local smoke test passed on desktop and mobile: ${target}`)
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
