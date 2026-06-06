const { chromium } = require('playwright')
const path = require('path')

const target = process.env.LOCAL_DASHBOARD_URL || 'http://127.0.0.1:5184'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1500 } })

  await page.goto(target, { waitUntil: 'networkidle' })

  const initial = await page.evaluate(() => ({
    text: document.body.innerText,
    tiles: document.querySelectorAll('.songpa-tile').length,
    emptyTiles: document.querySelectorAll('.songpa-empty').length,
    confirmedRows: Array.from(document.querySelectorAll('section'))
      .find((section) => section.innerText.includes('확인된 송파구 부족 투표소'))
      ?.innerText.includes('추정이 못 잡음'),
    scenarioRows: Array.from(document.querySelectorAll('section'))
      .find((section) => section.innerText.includes('현재 시나리오에서 아슬아슬한 동'))
      ?.innerText.includes('시나리오 해석'),
  }))

  assert(initial.text.includes('한눈에 읽기'), 'Missing quick-read section')
  assert(initial.text.includes('계산은 이렇게 합니다'), 'Missing proxy calculation explanation')
  assert(initial.text.includes('기다리다 포기한 비율은 무엇을 바꾸나'), 'Missing attrition explanation section')
  assert(initial.tiles === 27, `Expected 27 Songpa tiles, got ${initial.tiles}`)
  assert(initial.emptyTiles === 0, 'Old empty map tiles are still rendered')
  assert(initial.confirmedRows, 'Confirmed shortage table does not explain estimation misses')
  assert(initial.scenarioRows, 'Scenario dong section is missing or not separated from facts')

  await page.getByRole('button', { name: '+15%' }).first().click()
  await page.getByText('확인된 송파구 부족 투표소').scrollIntoViewIfNeeded()

  const afterDemandChange = await page.evaluate(() => {
    const section = Array.from(document.querySelectorAll('section'))
      .find((candidate) => candidate.innerText.includes('확인된 송파구 부족 투표소'))
    return section?.innerText || ''
  })
  assert(afterDemandChange.includes('현재 가정도 부족'), 'Demand lever did not change confirmed table interpretation')

  await page.screenshot({
    path: path.resolve(__dirname, '..', 'dashboard-local-smoke.png'),
    fullPage: false,
  })

  await browser.close()
  console.log(`Local smoke test passed: ${target}`)
}

main().catch(async (error) => {
  console.error(error.message)
  process.exit(1)
})
