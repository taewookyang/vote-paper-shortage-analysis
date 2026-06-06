/**
 * VCVP01 — 시간대별 투표진행상황 (수정판)
 *
 * 핵심: submit 후 electionInfo_report.xhtml 로 이동 → 거기서 테이블 읽기
 * POST body: electionId, requestURI, menuId, statementId, cityCode, timeCode
 *
 * 저장: data/raw/nec_vote_progress_2026.csv
 */
"use strict";
const fs   = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright"))); }

const OUT        = path.join(ROOT, "data", "raw", "nec_vote_progress_2026.csv");
const FORM_URL   = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCVP01";
const REPORT_URL = "https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml";

// 조회 대상: 전국(0) + 서울(1100)
const CITY_TARGETS = [
  { code: "0",    name: "전국" },
  { code: "1100", name: "서울특별시" },
];
// 시간대: 7~18시 + 전체(30)
const TIME_CODES = ["7","8","9","10","11","12","13","14","15","16","17","18","30"];
const TIME_LABEL = Object.fromEntries([
  ...TIME_CODES.slice(0,-1).map(t => [t, `${t}시`]),
  ["30", "전체"],
]);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

async function readResultTable(page) {
  return page.evaluate(() => {
    const table = document.querySelector(".searchResult table, table");
    if (!table) return [];
    const headerRows = Array.from(table.querySelectorAll("thead tr, tr"));
    // 실제 데이터 행 찾기 (숫자가 포함된 행)
    return Array.from(table.querySelectorAll("tr"))
      .map(tr => Array.from(tr.cells).map(td => td.innerText.replace(/[\n\t]+/g," ").trim()))
      .filter(cells => cells.length >= 4 && /\d/.test(cells[0] + cells[1] + cells[2]));
  });
}

async function fetchOneSlot(page, cityCode, timeCode) {
  // VCVP01 폼 페이지로 이동
  await page.goto(FORM_URL, { waitUntil: "networkidle", timeout: 40000 });
  await sleep(800);

  await page.selectOption("#cityCode", cityCode);
  await sleep(600);
  await page.selectOption("#timeCode", timeCode);
  await sleep(400);

  // submit → electionInfo_report.xhtml 로 이동
  await Promise.all([
    page.waitForURL("**/electionInfo_report.xhtml", { timeout: 20000 }),
    page.locator("#spanSubmit input[type=image]").click(),
  ]);
  await sleep(1000);

  return readResultTable(page);
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  page.setDefaultTimeout(30000);

  const rows = [];

  for (const { code: cityCode, name: cityName } of CITY_TARGETS) {
    for (const timeCode of TIME_CODES) {
      process.stdout.write(`  ${cityName} ${TIME_LABEL[timeCode]} ... `);
      try {
        const data = await fetchOneSlot(page, cityCode, timeCode);
        data.forEach(cells => {
          // 헤더 행 건너뜀 (구시군명이 한글 지명인 행만)
          const 구시군명 = cells[0];
          if (!구시군명 || /선거인수|구시군명|투표자수/.test(구시군명)) return;
          rows.push({
            시도: cityName,
            조회시간: TIME_LABEL[timeCode],
            구시군명,
            선거일투표_선거인수:   cells[1] || "",
            사전투표_선거인수:     cells[2] || "",
            합계_선거인수:         cells[3] || "",
            선거일_투표자수:       cells[4] || "",
            사전투표_접수수:       cells[5] || "",
            합계_투표자수:         cells[6] || "",
            투표율:                cells[7] || "",
            집계상황:              cells[8] || "",
            출처URL: REPORT_URL,
          });
        });
        console.log(`${data.length}행`);
      } catch (e) {
        console.log(`실패: ${e.message.slice(0, 80)}`);
      }
      await sleep(1200);
    }
  }

  await browser.close();

  if (rows.length === 0) {
    console.log("❌ 수집된 데이터 없음");
    return;
  }

  const cols = ["시도","조회시간","구시군명","선거일투표_선거인수","사전투표_선거인수","합계_선거인수",
                "선거일_투표자수","사전투표_접수수","합계_투표자수","투표율","집계상황","출처URL"];
  const csv  = [cols.join(","), ...rows.map(r => cols.map(c => csvEscape(r[c])).join(","))].join("\r\n");
  fs.writeFileSync(OUT, "﻿" + csv, "utf8");
  console.log(`\n✅ 저장: ${OUT} (${rows.length}행)`);
}

module.exports = { main };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
