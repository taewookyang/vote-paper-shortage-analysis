/**
 * BIPB02 — 선거인명부 확정상황 (읍면동별)
 * 서울특별시 송파구, 구시군의회의원선거 기준
 * 저장: data/raw/nec_voter_roll_2026.csv
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright"))); }

const OUT = path.join(ROOT, "data", "raw", "nec_voter_roll_2026.csv");
const SOURCE_URL = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=BI&secondMenuId=BIPB02";
const CITY_CODE = "1100";   // 서울
const TOWN_CODE = "1124";   // 송파구

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(SOURCE_URL, { waitUntil: "networkidle", timeout: 60000 });
  await sleep(2000);

  const rows = [];

  // searchType: 4=읍면동별 (투표구 단위 선거인수)
  const searchTypes = [
    { value: "4", label: "읍면동별" },
    { value: "2", label: "구시군별" },
  ];

  for (const { value: searchType, label: searchLabel } of searchTypes) {
    process.stdout.write(`  ${searchLabel} 조회 ... `);
    try {
      // searchType 먼저 선택
      await page.selectOption("#searchType", searchType);
      await sleep(1000);

      // 선거 종류: 6 = 구시군의회의원
      await page.selectOption("#electionCode", "6");
      await sleep(800);

      // 시도
      await page.selectOption("#cityCode", CITY_CODE);
      await sleep(1000);

      // 구시군 (읍면동별일 때)
      if (searchType === "4") {
        try {
          await page.waitForSelector("#townCode option:not([value='-1'])", { timeout: 5000 });
          await page.selectOption("#townCode", TOWN_CODE);
          await sleep(800);
        } catch {
          console.log("  townCode 옵션 없음, 시도 단위로 진행");
        }
      }

      // 조회
      await page.locator("#spanSubmit input[type=image]").click();
      await sleep(2000);

      const data = await page.evaluate((label) => {
        const table = document.querySelector(".searchResult table, table");
        if (!table) return [];
        const headerRow = table.querySelector("thead tr, tr:first-child");
        const headers = headerRow
          ? Array.from(headerRow.cells).map(th => th.innerText.replace(/\s+/g," ").trim())
          : [];
        return Array.from(table.querySelectorAll("tbody tr"))
          .map(tr => {
            const cells = Array.from(tr.cells).map(td => td.innerText.replace(/\s+/g," ").trim());
            if (cells.length < 2 || !cells[0]) return null;
            const obj = { 조회유형: label };
            cells.forEach((c, i) => { obj[headers[i] || `col${i}`] = c; });
            return obj;
          })
          .filter(Boolean);
      }, searchLabel);

      data.forEach(r => rows.push({ ...r, 출처URL: SOURCE_URL }));
      console.log(`${data.length}행`);
    } catch (e) {
      console.log(`실패: ${e.message.slice(0,80)}`);
    }
    await sleep(1200);
  }

  await browser.close();

  if (rows.length === 0) {
    console.log("수집된 데이터 없음");
    return;
  }

  const allCols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const csv = [
    allCols.join(","),
    ...rows.map(r => allCols.map(c => csvEscape(r[c] ?? "")).join(",")),
  ].join("\r\n");
  fs.writeFileSync(OUT, "﻿" + csv, "utf8");
  console.log(`\n저장: ${OUT} (${rows.length}행)`);
  console.log("컬럼:", allCols.join(", "));
}

module.exports = { main };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
