/**
 * VCAP01 — 사전투표진행상황(위원회별)
 * 서울 + 전체 날짜(2일차 누계) 조회 → 구시군별 사전투표율
 * 저장: data/raw/nec_prevote_2026.csv
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright"))); }

const OUT = path.join(ROOT, "data", "raw", "nec_prevote_2026.csv");
const SOURCE_URL = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCAP01";

// dateCode: 0=전체, 1=1일차, 2=2일차, 3=2일차누계
// timeCode: 0=전체, 07~18 = 각 시간
const DATE_CODES = [
  { code: "1", label: "1일차" },
  { code: "2", label: "2일차" },
  { code: "3", label: "2일차누계" },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

async function fetchTable(page) {
  return page.evaluate(() => {
    const table = document.querySelector(".searchResult table, table");
    if (!table) return [];
    return Array.from(table.querySelectorAll("tbody tr, tr:not(:first-child)"))
      .map(tr => Array.from(tr.cells).map(td => td.innerText.replace(/\s+/g," ").trim()))
      .filter(cells => cells.length >= 3 && cells[0]);
  });
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(SOURCE_URL, { waitUntil: "networkidle", timeout: 60000 });
  await sleep(1500);

  const rows = [];

  for (const [cityCode, cityName] of [["0","전국"],["1100","서울특별시"]]) {
    for (const { code: dateCode, label: dateLabel } of DATE_CODES) {
      // 마지막 시간대(전체)만 수집 — 누계가 핵심
      for (const [timeCode, timeLabel] of [["0","전체"],["18","18시"]]) {
        process.stdout.write(`  ${cityName} ${dateLabel} ${timeLabel} ... `);
        try {
          await page.selectOption("#cityCode", cityCode);
          await sleep(600);
          await page.selectOption("#dateCode", dateCode);
          await sleep(600);
          await page.selectOption("#timeCode", timeCode);
          await sleep(400);
          await page.locator("#spanSubmit input[type=image]").click();
          await sleep(1500);

          const data = await fetchTable(page);
          data.forEach(cells => {
            rows.push({
              시도: cityName,
              날짜구분: dateLabel,
              조회시간: timeLabel,
              구시군명: cells[0] || "",
              선거인수: cells[1] || "",
              사전투표자수: cells[2] || "",
              사전투표율: cells[3] || "",
              출처URL: SOURCE_URL,
            });
          });
          console.log(`${data.length}행`);
        } catch (e) {
          console.log(`실패: ${e.message.slice(0,60)}`);
        }
        await sleep(1000);
      }
    }
  }

  await browser.close();

  const cols = ["시도","날짜구분","조회시간","구시군명","선거인수","사전투표자수","사전투표율","출처URL"];
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => csvEscape(r[c])).join(","))].join("\r\n");
  fs.writeFileSync(OUT, "﻿" + csv, "utf8");
  console.log(`\n저장: ${OUT} (${rows.length}행)`);
}

module.exports = { main };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
