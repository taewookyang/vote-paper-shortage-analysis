const { chromium } = require('playwright')
const path = require('path')

const target = process.env.LOCAL_DASHBOARD_URL || 'http://127.0.0.1:5184/data'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function inspect(page, viewportName) {
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByText('투표용지는 왜 모자랐나').waitFor({ timeout: 30000 })
  await page.getByText('표차가 작은 곳부터 추가 조사').waitFor({ timeout: 30000 })
  const state = await page.evaluate(() => ({
    text: document.body.innerText,
    redBars: document.querySelectorAll('.recharts-bar-rectangle').length,
    mapSvg: document.querySelectorAll('.songpa-boundary-svg').length,
    priorityRows: document.querySelectorAll('.margin-screening-row').length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))

  assert(state.text.includes('어느 동에서 바닥났나'), `${viewportName}: missing Songpa detail section`)
  assert(!state.text.includes('지도 경계 데이터를 불러오지 못했습니다'), `${viewportName}: broken map error is visible`)
  assert(state.redBars >= 27, `${viewportName}: expected fallback dong chart bars`)
  assert(state.mapSvg === 0, `${viewportName}: unlicensed boundary map should not render`)
  assert(state.text.includes('표차가 작은 곳부터 추가 조사'), `${viewportName}: missing targeted screening section`)
  assert(state.text.includes('남해군가선거구'), `${viewportName}: missing smallest-margin district`)
  assert(state.priorityRows === 8, `${viewportName}: expected eight initial priority rows`)
  assert(!state.horizontalOverflow, `${viewportName}: horizontal overflow detected`)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })

  await inspect(desktop, 'desktop')
  await inspect(mobile, 'mobile')
  await desktop.screenshot({ path: path.resolve(__dirname, '..', 'dashboard-local-smoke.png'), fullPage: false })

  await browser.close()
  console.log(`Local smoke test passed on desktop and mobile: ${target}`)
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
