/**
 * 22곳 투표 중단 발생 5개 구 동별 당일투표율 수집
 * - 서울 강남구(1168), 광진구(1105), 서초구(1165): national_dong_turnout.csv 이미 있음 → 추출만
 * - 인천 연수구(2804): VCCP08 크롤링 필요
 *
 * 저장: data/raw/shortage_gu_dong_turnout.csv
 * 실행: node scripts/collect_shortage_gu_turnout.cjs
 */
"use strict";
const fs   = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright"))); }

const NATIONAL_CSV = path.join(ROOT, "data", "raw", "national_dong_turnout.csv");
const OUT          = path.join(ROOT, "data", "raw", "shortage_gu_dong_turnout.csv");
const FORM_URL     = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP08";

// 서울 4개 구 + 인천 연수구
const SEOUL_GU = ["강남구", "광진구", "서초구", "송파구"];
const YEONSU   = { cityCode: "2800", cityName: "인천광역시", townCode: "2804", townName: "연수구" };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function clean(v)  { return String(v ?? "").replace(/ /g," ").replace(/\s+/g," ").trim(); }
function num(v)    { const n = parseInt(clean(v).replace(/,/g,"")); return isFinite(n) ? n : null; }
function csvEsc(v) { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }

// 1. 서울 4개 구: national_dong_turnout.csv에서 추출
function loadSeoulRows() {
  if (!fs.existsSync(NATIONAL_CSV)) {
    console.error("❌ national_dong_turnout.csv 없음");
    return [];
  }
  const lines = fs.readFileSync(NATIONAL_CSV, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter(Boolean);

  const header = lines[0].split(",");
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const obj  = Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ""]));
    if (SEOUL_GU.includes(obj["구시군"])) rows.push(obj);
  }
  console.log(`✅ 서울 4개 구: ${rows.length}개 동 로드`);
  return rows;
}

// 2. 인천 연수구: VCCP08 크롤링
async function fetchYeonsuRows(page) {
  console.log("\n🔍 인천 연수구 크롤링 시작...");
  await page.goto(FORM_URL, { waitUntil: "networkidle", timeout: 40000 });
  await sleep(800);
  await page.evaluate(() => setElectionCode(3));   // 구청장 선거
  await sleep(600);
  await page.selectOption("#cityCode", YEONSU.cityCode);
  await sleep(800);
  await page.selectOption("#townCode", YEONSU.townCode);
  await sleep(600);

  await Promise.all([
    page.waitForURL("**/electionInfo_report.xhtml", { timeout: 20000 }),
    page.locator("#spanSubmit input[type=image]").click(),
  ]);
  await sleep(800);

  const rawRows = await page.evaluate(() => {
    const tbl = document.querySelector(".searchResult table");
    if (!tbl) return [];
    return Array.from(tbl.querySelectorAll("tr")).map(tr =>
      Array.from(tr.cells).map(td => td.innerText.replace(/\s+/g," ").trim())
    );
  });

  // 파싱: 동별 선거인수(계), 선거일투표수
  const electorsMap  = {};
  const dayVotersMap = {};
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
    const rate = electors > 0 ? (dayVoters / electors * 100).toFixed(2) : "";
    const over = parseFloat(rate) > 50 ? "Y" : "N";
    const shortage = over === "Y" ? Math.round(dayVoters - electors * 0.5) : 0;
    rows.push({
      "시도": YEONSU.cityName,
      "구시군": YEONSU.townName,
      "동": emd,
      "선거인수": electors,
      "투표수": dayVoters,
      "당일투표율": rate,
      "50%초과": over,
      "부족추정": shortage,
      "cityCode": YEONSU.cityCode,
      "townCode": YEONSU.townCode,
    });
  }

  console.log(`✅ 연수구 ${rows.length}개 동 수집 완료`);
  return rows;
}

async function main() {
  const seoulRows = loadSeoulRows();

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  page.setDefaultTimeout(30000);

  let yeonsuRows = [];
  try {
    yeonsuRows = await fetchYeonsuRows(page);
  } catch (e) {
    console.error("❌ 연수구 크롤링 실패:", e.message);
  }
  await browser.close();

  const allRows = [...seoulRows, ...yeonsuRows];
  const cols    = ["시도","구시군","동","선거인수","투표수","당일투표율","50%초과","부족추정","cityCode","townCode"];
  const lines   = [cols.join(",")];
  for (const row of allRows) {
    lines.push(cols.map(c => csvEsc(row[c] ?? "")).join(","));
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, "﻿" + lines.join("\r\n"), "utf8");
  console.log(`\n✅ 저장: ${OUT}`);
  console.log(`   총 ${allRows.length}개 동 (서울 ${seoulRows.length} + 연수구 ${yeonsuRows.length})`);
}

main().catch(e => { console.error(e); process.exit(1); });
