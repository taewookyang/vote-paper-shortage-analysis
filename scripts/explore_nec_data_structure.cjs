/**
 * VCVP01(투표진행상황), VCAP01(사전투표), BIPB02(선거인명부) 페이지 데이터 구조 확인
 * 송파구 선택 후 테이블 컬럼 + 샘플 데이터 추출
 */
"use strict";
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright")));
}

const ELECTION_ID = "0020260603";
const BASE = "https://info.nec.go.kr/main/showDocument.xhtml";
const CITY_CODE = "1100";   // 서울특별시
const TOWN_CODE = "1124";   // 송파구

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function extractTable(page) {
  return page.evaluate(() => {
    const tables = document.querySelectorAll(".searchResult table, table.result, table");
    const results = [];
    tables.forEach((tbl, i) => {
      const rows = Array.from(tbl.querySelectorAll("tr")).slice(0, 8);
      const data = rows.map(tr =>
        Array.from(tr.cells).map(td => td.innerText.replace(/\s+/g, " ").trim())
      );
      if (data.length > 0) results.push({ tableIndex: i, rows: data });
    });
    return results;
  });
}

async function exploreVCVP01(page) {
  console.log("\n" + "=".repeat(60));
  console.log("VCVP01 — 투표진행상황 (시간대별)");
  console.log("=".repeat(60));

  const url = `${BASE}?electionId=${ELECTION_ID}&topMenuId=VC&secondMenuId=VCVP01`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await sleep(2000);

  // 셀렉트박스 목록
  const selects = await page.evaluate(() =>
    Array.from(document.querySelectorAll("select")).map(s => ({
      id: s.id,
      name: s.name,
      options: Array.from(s.options).slice(0, 5).map(o => ({ value: o.value, text: o.text.trim() }))
    }))
  );
  console.log("셀렉트박스:", JSON.stringify(selects, null, 2));

  // 시도 선택 시도
  try {
    await page.selectOption("#cityCode", CITY_CODE);
    await sleep(1200);
    await page.selectOption("#townCode", TOWN_CODE);
    await sleep(1200);
    // 조회 버튼 클릭
    const submitBtn = page.locator("#spanSubmit input[type=image], input[type=submit], button[type=submit]").first();
    await submitBtn.click();
    await sleep(2000);
  } catch (e) {
    console.log("자동 선택 실패:", e.message.slice(0, 100));
  }

  const tables = await extractTable(page);
  console.log(`테이블 ${tables.length}개`);
  tables.forEach(t => {
    console.log(`\n  [테이블 ${t.tableIndex}] ${t.rows.length}행:`);
    t.rows.forEach(r => console.log("   ", r.join(" | ")));
  });

  // 페이지 전체 텍스트 스니펫
  const snippet = await page.evaluate(() =>
    document.body.innerText.replace(/\s+/g, " ").slice(0, 500)
  );
  console.log("\n페이지 스니펫:", snippet);
}

async function exploreVCAP01(page) {
  console.log("\n" + "=".repeat(60));
  console.log("VCAP01 — 사전투표진행상황(위원회별)");
  console.log("=".repeat(60));

  const url = `${BASE}?electionId=${ELECTION_ID}&topMenuId=VC&secondMenuId=VCAP01`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await sleep(2000);

  const selects = await page.evaluate(() =>
    Array.from(document.querySelectorAll("select")).map(s => ({
      id: s.id,
      options: Array.from(s.options).slice(0, 5).map(o => ({ value: o.value, text: o.text.trim() }))
    }))
  );
  console.log("셀렉트박스:", JSON.stringify(selects.slice(0, 4), null, 2));

  try {
    await page.selectOption("#cityCode", CITY_CODE);
    await sleep(1200);
    const submitBtn = page.locator("#spanSubmit input[type=image], input[type=submit], button[type=submit]").first();
    await submitBtn.click();
    await sleep(2000);
  } catch (e) {
    console.log("자동 선택 실패:", e.message.slice(0, 100));
  }

  const tables = await extractTable(page);
  console.log(`테이블 ${tables.length}개`);
  tables.slice(0, 3).forEach(t => {
    console.log(`\n  [테이블 ${t.tableIndex}] ${t.rows.length}행:`);
    t.rows.slice(0, 5).forEach(r => console.log("   ", r.join(" | ")));
  });
}

async function exploreBIPB02(page) {
  console.log("\n" + "=".repeat(60));
  console.log("BIPB02 — 선거인명부 확정상황");
  console.log("=".repeat(60));

  const url = `${BASE}?electionId=${ELECTION_ID}&topMenuId=BI&secondMenuId=BIPB02`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await sleep(2000);

  const selects = await page.evaluate(() =>
    Array.from(document.querySelectorAll("select")).map(s => ({
      id: s.id,
      options: Array.from(s.options).slice(0, 5).map(o => ({ value: o.value, text: o.text.trim() }))
    }))
  );
  console.log("셀렉트박스:", JSON.stringify(selects.slice(0, 4), null, 2));

  try {
    await page.selectOption("#cityCode", CITY_CODE);
    await sleep(1200);
    await page.selectOption("#townCode", TOWN_CODE);
    await sleep(1200);
    const submitBtn = page.locator("#spanSubmit input[type=image], input[type=submit], button[type=submit]").first();
    await submitBtn.click();
    await sleep(2000);
  } catch (e) {
    console.log("자동 선택 실패:", e.message.slice(0, 100));
  }

  const tables = await extractTable(page);
  console.log(`테이블 ${tables.length}개`);
  tables.slice(0, 2).forEach(t => {
    console.log(`\n  [테이블 ${t.tableIndex}]:`);
    t.rows.slice(0, 6).forEach(r => console.log("   ", r.join(" | ")));
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  await exploreVCVP01(page);
  await exploreVCAP01(page);
  await exploreBIPB02(page);

  await browser.close();
  console.log("\n=== 탐색 완료 ===");
}

main().catch(err => { console.error(err); process.exit(1); });
