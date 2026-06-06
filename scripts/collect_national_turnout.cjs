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
const SHARD_COUNT = Math.max(1, Number(process.env.SHARD_COUNT || 1));
const SHARD_INDEX = Math.max(0, Number(process.env.SHARD_INDEX || 0));
const SHARD_SUFFIX = SHARD_COUNT > 1 ? `_worker_${SHARD_INDEX}_of_${SHARD_COUNT}` : "";
const OUT        = path.join(ROOT, "data", "raw", `national_dong_turnout${SHARD_SUFFIX}.csv`);
const CHECKPOINT = path.join(ROOT, "data", "raw", `national_dong_turnout_checkpoint${SHARD_SUFFIX}.json`);
const FORM_URL   = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP08";

const [,, filterCity, filterTown] = process.argv;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function clean(v)  { return String(v ?? "").replace(/ /g," ").replace(/\s+/g," ").trim(); }
function num(v)    { const n = parseInt(clean(v).replace(/,/g,"")); return isFinite(n) ? n : null; }
function csvEsc(v) { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }

async function fetchDongData(page, cityCode, townCode) {
  await page.goto(FORM_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#cityCode").waitFor({ state: "attached", timeout: 45000 });
  await page.evaluate(() => setElectionCode(3));
  await page.waitForFunction(
    value => Array.from(document.querySelector("#cityCode")?.options || []).some(option => option.value === value),
    cityCode, { timeout: 45000 }
  );
  await page.selectOption("#cityCode", cityCode, { force: true });
  await page.waitForFunction(
    value => Array.from(document.querySelector("#townCode")?.options || []).some(option => option.value === value),
    townCode, { timeout: 45000 }
  );
  await page.selectOption("#townCode", townCode, { force: true });

  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  await page.locator("#spanSubmit input[type=image]").click({ force: true, timeout: 45000 });
  await navigation;
  await page.locator(".searchResult table").waitFor({ state: "attached", timeout: 45000 });

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
  const allTargets = codes.flatMap(city => city.towns.map(town => ({ city, town })));
  const targets = allTargets
    .filter(({ city, town }) => (!filterCity || city.code === filterCity) && (!filterTown || town.code === filterTown))
    .filter((_, index) => index % SHARD_COUNT === SHARD_INDEX);
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  page.setDefaultTimeout(45000);

  const cols = ["시도","구시군","동","선거인수","투표수","당일투표율","50%초과","부족추정","cityCode","townCode"];
  const checkpoint = fs.existsSync(CHECKPOINT)
    ? JSON.parse(fs.readFileSync(CHECKPOINT, "utf8"))
    : { rows: [], completed: [], failures: [] };
  const outputRows = checkpoint.rows;
  const completed = new Set(checkpoint.completed);
  let done = completed.size, skipped = 0;

  for (const { city, town } of targets) {
    const key = `${city.code}|${town.code}`;
    if (completed.has(key)) continue;
    let collected = null;
    let lastError;
    for (let attempt = 1; attempt <= 3 && collected === null; attempt++) {
      try {
        const raw = await fetchDongData(page, city.code, town.code);
        collected = parseRows(raw, city.name, town.name);
      } catch (error) {
        lastError = error;
        console.error(`\n재시도 ${attempt}/3 ${city.name} ${town.name}: ${error.message}`);
        await sleep(attempt * 1500);
      }
    }
    if (collected === null) {
      skipped++;
      checkpoint.failures.push({ key, error: lastError?.message || "unknown", at: new Date().toISOString() });
    } else {
      for (const row of collected) {
        const over = row.rate !== null && row.rate > 0.5;
        outputRows.push({
          시도: row.cityName, 구시군: row.townName, 동: row.dong,
          선거인수: row.electors, 투표수: row.voters,
          당일투표율: row.rate !== null ? (row.rate * 100).toFixed(2) : "",
          "50%초과": over ? "Y" : "N",
          부족추정: over && row.electors ? Math.round(row.voters - row.electors * 0.5) : 0,
          cityCode: city.code, townCode: town.code,
        });
      }
      completed.add(key);
      done++;
      process.stdout.write(`\r워커 ${SHARD_INDEX + 1}/${SHARD_COUNT}: ${done}/${targets.length} - ${city.name} ${town.name} (${collected.length}동)    `);
    }
    checkpoint.rows = outputRows;
    checkpoint.completed = [...completed];
    fs.writeFileSync(CHECKPOINT, JSON.stringify(checkpoint, null, 2), "utf8");
    await sleep(600);
  }

  await browser.close();
  const csvLines = [cols.join(","), ...outputRows.map(row => cols.map(column => csvEsc(row[column])).join(","))];
  fs.writeFileSync(OUT, "﻿" + csvLines.join("\r\n"), "utf8");
  if (fs.existsSync(CHECKPOINT) && skipped === 0) fs.unlinkSync(CHECKPOINT);
  console.log(`\n\n✅ 저장: ${OUT}`);
  console.log(`수집: ${done}개 구시군 / 스킵: ${skipped}개`);
  console.log(`총 ${outputRows.length}행`);
}

main().catch(e => { console.error(e); process.exit(1); });
