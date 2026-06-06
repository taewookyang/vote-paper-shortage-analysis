/**
 * 송파구청장 선거 개표결과 크롤링 (electionCode=3)
 * → 송파구 전 27개 동 선거인수/선거일투표수 확보
 * 저장: data/raw/songpa_2026_mayor_result.csv
 */
"use strict";
const fs   = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright"))); }

const OUT = path.join(ROOT, "data", "raw", "songpa_2026_mayor_result.csv");
const SOURCE_URL = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP08";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function cleanText(v) { return String(v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim(); }
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(SOURCE_URL, { waitUntil: "networkidle", timeout: 60000 });
  await sleep(2000);

  // electionCode=3 구시군장(구청장)
  await page.evaluate(() => setElectionCode(3));
  await sleep(1000);

  await page.selectOption("#cityCode", "1100");  // 서울
  await sleep(1200);

  await page.selectOption("#townCode", "1124");  // 송파구
  await sleep(1200);

  // sggTownCode는 단일(-1)이므로 그대로 submit
  const nav = page.waitForNavigation({ waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
  await page.locator("#spanSubmit input[type=image]").click();
  await nav;
  await sleep(1500);

  console.log("submit 후 URL:", page.url());

  // 테이블 파싱
  const tableData = await page.evaluate(() => {
    const resultTable = document.querySelector(".searchResult table");
    if (!resultTable) return { error: "no table", bodyText: document.body.innerText.slice(0, 500) };
    return {
      rows: Array.from(resultTable.querySelectorAll("tr")).map(tr =>
        Array.from(tr.cells).map(td => ({
          text: td.innerText.replace(/\s+/g, " ").trim(),
          rowSpan: td.rowSpan,
          colSpan: td.colSpan,
        }))
      )
    };
  });

  if (tableData.error) {
    console.log("테이블 없음:", tableData.error);
    console.log("페이지 텍스트:", tableData.bodyText);
    await browser.close();
    return;
  }

  const rawRows = tableData.rows;
  console.log("테이블 행수:", rawRows.length);

  // 헤더 파악 (2행 헤더 구조 가능)
  // 보통 구조: [읍면동명][개표단위][선거인수][투표수][후보1][후보2]...[계][무효][기권][당락]
  if (rawRows.length < 3) {
    console.log("데이터 부족:", JSON.stringify(rawRows.slice(0, 3)));
    await browser.close();
    return;
  }

  // 후보 헤더 파악 (2번째 행)
  const candidateHeaders = rawRows[1]
    .map(c => cleanText(c.text))
    .filter(t => t && t !== "계");

  const rows = [];
  for (const row of rawRows.slice(2)) {
    const cells = row.map(c => cleanText(c.text));
    if (cells.length < 4) continue;

    let emd = cells[0];
    let unit = cells[1];
    if (!unit && ["합계","거소투표","관외사전투표","잘못 투입·구분된 투표지","계"].includes(emd)) {
      unit = emd; emd = "";
    }

    rows.push({
      시도: "서울특별시",
      구시군: "송파구",
      선거명: "제9회 전국동시지방선거 구·시·군의장선거",
      읍면동명: emd,
      개표단위: unit,
      선거인수: cells[2] || "",
      투표수: cells[3] || "",
      출처URL: SOURCE_URL,
    });
  }

  await browser.close();

  if (rows.length === 0) {
    console.log("수집된 행 없음");
    return;
  }

  const cols = ["시도","구시군","선거명","읍면동명","개표단위","선거인수","투표수","출처URL"];
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => csvEscape(r[c])).join(","))].join("\r\n");
  fs.writeFileSync(OUT, "﻿" + csv, "utf8");
  console.log(`\n✅ 저장: ${OUT} (${rows.length}행)`);

  // 동별 요약
  const emdSet = [...new Set(rows.filter(r => r['읍면동명']).map(r => r['읍면동명']))].sort();
  console.log("수집된 동 (" + emdSet.length + "):", emdSet.join(", "));
}

module.exports = { main };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
