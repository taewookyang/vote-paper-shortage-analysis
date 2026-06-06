/**
 * 전국 시도·구시군 코드 수집
 * VCCP08 (구청장 선거) cityCode + townCode 전체 목록
 * 저장: data/raw/national_codes.json
 */
"use strict";
const fs   = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright"))); }

const OUT  = path.join(ROOT, "data", "raw", "national_codes.json");
const URL  = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP08";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => setElectionCode(3)); // 구청장
  await sleep(1500);

  // 시도 목록
  const cities = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#cityCode option"))
      .filter(o => o.value)
      .map(o => ({ code: o.value, name: o.textContent.trim() }))
  );
  console.log(`시도 ${cities.length}개 수집`);

  const result = [];
  for (const city of cities) {
    await page.selectOption("#cityCode", city.code);
    await sleep(1000);

    const towns = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#townCode option"))
        .filter(o => o.value)
        .map(o => ({ code: o.value, name: o.textContent.trim() }))
    );
    result.push({ ...city, towns });
    console.log(`  ${city.name}: ${towns.length}개 구시군`);
  }

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
  await browser.close();

  const total = result.reduce((s, c) => s + c.towns.length, 0);
  console.log(`\n✅ 저장: ${OUT}`);
  console.log(`총 ${result.length}개 시도 / ${total}개 구시군`);
}

main().catch(e => { console.error(e); process.exit(1); });
