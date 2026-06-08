/**
 * Collect NEC BIPB02 voter-roll finalization rows as a national raw CSV mirror.
 *
 * The BIPB02 table uses row-spans and repeated sex/total rows. This script
 * preserves the NEC table rows as cell_0..cell_N instead of inferring a final
 * normalized schema.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright"))); }

const CODES_JSON = path.join(ROOT, "data", "raw", "national_codes.json");
const SOURCE_URL = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=BI&secondMenuId=BIPB02";
const OUT = path.join(ROOT, "data", "raw", "nec_voter_roll_2026_national.csv");
const CHECKPOINT = path.join(ROOT, "data", "raw", "nec_voter_roll_2026_national_checkpoint.json");
const SOURCE = "NEC BIPB02 선거인명부 확정상황";

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function clean(value) { return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function loadTargets() {
  return JSON.parse(fs.readFileSync(CODES_JSON, "utf8")).flatMap(city =>
    city.towns.map(town => ({
      cityCode: city.code,
      cityName: city.name,
      townCode: town.code,
      townName: town.name,
    }))
  );
}
function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT)) return { rows: [], completed: [], failures: [] };
  return JSON.parse(fs.readFileSync(CHECKPOINT, "utf8"));
}
function saveCheckpoint(state) {
  fs.mkdirSync(path.dirname(CHECKPOINT), { recursive: true });
  fs.writeFileSync(CHECKPOINT, JSON.stringify(state, null, 2), "utf8");
}
function writeCsv(rows) {
  const maxCells = rows.reduce((max, row) => Math.max(max, Number(row.cell_count || 0)), 0);
  const columns = [
    "시도코드", "시도", "구시군코드", "구시군", "조회유형", "선거코드", "선거종류",
    "row_index", "cell_count", ...Array.from({ length: maxCells }, (_, index) => `cell_${index}`),
    "raw_json", "source", "source_url",
  ];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const text = [columns.join(","), ...rows.map(row => columns.map(column => csvEscape(row[column])).join(","))].join("\r\n");
  fs.writeFileSync(OUT, "\uFEFF" + text, "utf8");
}

async function selectReady(page, selector, value, text = "") {
  await page.locator(selector).waitFor({ state: "attached", timeout: 45000 });
  const handle = await page.waitForFunction(
    ({ selector, value, text }) => {
      const element = document.querySelector(selector);
      if (!element || element.disabled) return null;
      const options = Array.from(element.options || []);
      const byValue = options.find(option => option.value === value);
      if (byValue) return byValue.value;
      const byText = options.find(option => option.textContent.trim() === text);
      return byText ? byText.value : null;
    },
    { selector, value, text },
    { timeout: 45000 }
  );
  await page.selectOption(selector, await handle.jsonValue(), { force: true, timeout: 45000 });
}

async function collectTarget(page, target) {
  await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await selectReady(page, "#searchType", "4", "읍면동별");
  await sleep(500);
  await selectReady(page, "#electionCode", "6", "구·시·군의회의원선거");
  await sleep(500);

  const cityAvailable = await page.evaluate(cityCode =>
    Array.from(document.querySelector("#cityCode")?.options || []).some(option => option.value === cityCode),
    target.cityCode
  );
  if (!cityAvailable) return { rows: [], skipped: true, reason: "election_not_applicable_for_city" };

  await selectReady(page, "#cityCode", target.cityCode, target.cityName);
  await sleep(900);
  await selectReady(page, "#townCode", target.townCode, target.townName);
  await sleep(500);

  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  await page.evaluate(() => {
    const button = document.querySelector("#spanSubmit input[type=image]");
    if (!button) throw new Error("search button not found");
    button.click();
  });
  await navigation;
  await page.locator(".searchResult table").waitFor({ state: "attached", timeout: 60000 });
  await sleep(500);

  const table = await page.evaluate(() => {
    const element = document.querySelector(".searchResult table");
    if (!element) return [];
    return Array.from(element.querySelectorAll("tr")).map(tr =>
      Array.from(tr.cells).map(cell => ({
        text: cell.innerText.replace(/\s+/g, " ").trim(),
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
      }))
    );
  });

  const rows = [];
  table.forEach((cells, rowIndex) => {
    const values = cells.map(cell => clean(cell.text));
    if (values.length === 0 || values.every(value => !value)) return;
    const row = {
      시도코드: target.cityCode,
      시도: target.cityName,
      구시군코드: target.townCode,
      구시군: target.townName,
      조회유형: "읍면동별",
      선거코드: "6",
      선거종류: "구·시·군의회의원선거",
      row_index: rowIndex,
      cell_count: values.length,
      raw_json: JSON.stringify(cells),
      source: SOURCE,
      source_url: SOURCE_URL,
    };
    values.forEach((value, index) => { row[`cell_${index}`] = value; });
    rows.push(row);
  });
  return { rows, skipped: false };
}

async function main() {
  const targets = loadTargets();
  const checkpoint = loadCheckpoint();
  const rows = checkpoint.rows;
  const completed = new Set(checkpoint.completed);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  try {
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      const key = `${target.cityCode}|${target.townCode}`;
      if (completed.has(key)) continue;
      try {
        const result = await collectTarget(page, target);
        rows.push(...result.rows);
        completed.add(key);
        checkpoint.failures = checkpoint.failures.filter(failure => failure.key !== key);
        console.log(`${index + 1}/${targets.length} ${target.cityName} ${target.townName}: ${result.rows.length} rows${result.skipped ? ` skipped=${result.reason}` : ""}`);
      } catch (error) {
        checkpoint.failures.push({ key, target, error: error.message, at: new Date().toISOString() });
        console.error(`${index + 1}/${targets.length} ${target.cityName} ${target.townName}: failed ${error.message}`);
      }
      checkpoint.rows = rows;
      checkpoint.completed = [...completed];
      saveCheckpoint(checkpoint);
      writeCsv(rows);
      await sleep(500);
    }
  } finally {
    await browser.close();
  }
  console.log(`saved ${OUT} rows=${rows.length} completed=${completed.size} failures=${checkpoint.failures.length}`);
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exit(1); });
}
