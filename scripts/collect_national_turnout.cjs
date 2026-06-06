/**
 * 전국 구시군별 동별 당일투표율 수집 (구청장 선거 기준)
 * national_codes.json 의 코드를 순회하며 VCCP08 크롤링
 * 저장: data/raw/national_dong_turnout.csv
 *
 * 사용법:
 *   node scripts/collect_national_turnout.cjs            # 전체
 *   node scripts/collect_national_turnout.cjs 1100       # 서울만
 *   node scripts/collect_national_turnout.cjs 1100 1124  # 송파구만
 */
"use strict";
const fs   = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright"))); }

const CODES_FILE = path.join(ROOT, "data", "raw", "national_codes.json");
const OUT        = path.join(ROOT, "data", "raw", "national_dong_turnout.csv");
const FORM_URL   = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP08";

const [,, filterCity, filterTown] = process.argv;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function clean(v)  { return String(v ?? "").replace(/ /g," ").replace(/\s+/g," ").trim(); }
function num(v)    { const n = parseInt(clean(v).replace(/,/g,"")); return isFinite(n) ? n : null; }
function csvEsc(v) { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }

async function fetchDongData(page, cityCode, townCode) {
  await page.goto(FORM_URL, { waitUntil: "networkidle", timeout: 40000 });
  await sleep(800);
  await page.evaluate(() => setElectionCode(3));
  await sleep(600);
  await page.selectOption("#cityCode", cityCode);
  await sleep(800);
  await page.selectOption("#townCode", townCode);
  await sleep(600);

  await Promise.all([
    page.waitForURL("**/electionInfo_report.xhtml", { timeout: 20000 }),
    page.locator("#spanSubmit input[type=image]").click(),
  ]);
  await sleep(800);

  return await page.evaluate(() => {
    const tbl = document.querySelector(".searchResult table");
    if (!tbl) return [];
    return Array.from(tbl.querySelectorAll("tr")).map(tr =>
      Array.from(tr.cells).map(td => td.innerText.replace(/\s+/g," ").trim())
    );
  });
}

function parseRows(rawRows, cityName, townName) {
  // "계" 행에서 전체 선거인수 수집 (인쇄 기준은 전체 선거인수의 50%)
  // "선거일투표" 행에서 당일 투표자 수 수집
  const electorsMap = {};  // emd → 전체 선거인수
  const dayVotersMap = {}; // emd → 선거일 투표자 수

  for (const cells of rawRows.slice(2)) {
    if (cells.length < 4) continue;
    const emd  = clean(cells[0]);
    const unit = clean(cells[1]);
    if (!emd) continue;

    if (unit === "계") {
      const e = num(cells[2]);
      if (e && e >= 100) electorsMap[emd] = e;
    } else if (unit === "선거일투표") {
      const v = num(cells[3]);
      if (v != null) dayVotersMap[emd] = v;
    }
  }

  const rows = [];
  for (const emd of Object.keys(electorsMap)) {
    const electors  = electorsMap[emd];
    const dayVoters = dayVotersMap[emd];
    if (dayVoters == null) continue;
    const rate = electors > 0 ? dayVoters / electors : null;
    rows.push({ cityName, townName, dong: emd, electors, voters: dayVoters, rate });
  }
  return rows;
}

async function main() {
  if (!fs.existsSync(CODES_FILE)) {
    console.error("❌ national_codes.json 없음. 먼저 collect_national_codes.cjs 실행");
    process.exit(1);
  }

  const codes  = JSON.parse(fs.readFileSync(CODES_FILE, "utf8"));
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  page.setDefaultTimeout(30000);

  const cols = ["시도","구시군","동","선거인수","투표수","당일투표율","50%초과","부족추정","cityCode","townCode"];
  const csvLines = [cols.join(",")];
  let done = 0, skipped = 0;

  for (const city of codes) {
    if (filterCity && city.code !== filterCity) continue;

    for (const town of city.towns) {
      if (filterTown && town.code !== filterTown) continue;

      try {
        const raw  = await fetchDongData(page, city.code, town.code);
        const rows = parseRows(raw, city.name, town.name);

        for (const r of rows) {
          const over     = r.rate !== null && r.rate > 0.5;
          const shortage = over && r.electors ? Math.round(r.electors * r.rate - r.electors * 0.5) : 0;
          csvLines.push([
            r.cityName, r.townName, r.dong,
            r.electors, r.voters,
            r.rate !== null ? (r.rate * 100).toFixed(2) : "",
            over ? "Y" : "N",
            shortage,
            city.code, town.code,
          ].map(csvEsc).join(","));
        }

        done++;
        process.stdout.write(`\r진행: ${done}/${codes.reduce((s,c)=>s+c.towns.length,0)} - ${city.name} ${town.name} (${rows.length}동)    `);
      } catch (e) {
        skipped++;
        console.error(`\n⚠️  ${city.name} ${town.name}: ${e.message}`);
      }

      await sleep(400);
    }
  }

  await browser.close();
  fs.writeFileSync(OUT, "﻿" + csvLines.join("\r\n"), "utf8");
  console.log(`\n\n✅ 저장: ${OUT}`);
  console.log(`수집: ${done}개 구시군 / 스킵: ${skipped}개`);
  console.log(`총 ${csvLines.length - 1}행`);
}

main().catch(e => { console.error(e); process.exit(1); });
