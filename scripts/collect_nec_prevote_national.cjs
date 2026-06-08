/**
 * Collect NEC VCAP01 advance-voting progress as a national CSV mirror.
 *
 * Scope: national aggregate plus every 시도, date codes 1/2/3, and total plus
 * hourly 07-18 snapshots exposed by the NEC page.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright"))); }

const CODES_JSON = path.join(ROOT, "data", "raw", "national_codes.json");
const SOURCE_URL = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCAP01";
const OUT = path.join(ROOT, "data", "raw", "nec_prevote_2026_national.csv");
const CHECKPOINT = path.join(ROOT, "data", "raw", "nec_prevote_2026_national_checkpoint.json");
const DATE_CODES = [
  { code: "1", label: "1일차" },
  { code: "2", label: "2일차" },
  { code: "3", label: "2일차누계" },
];
const TIME_CODES = [
  { code: "0", label: "전체" },
  ...Array.from({ length: 12 }, (_, index) => {
    const hour = String(index + 7).padStart(2, "0");
    return { code: hour, label: `${hour}시` };
  }),
];

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function clean(value) { return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function loadCities() {
  const cities = JSON.parse(fs.readFileSync(CODES_JSON, "utf8")).map(city => ({ code: city.code, name: city.name }));
  return [{ code: "0", name: "전국" }, ...cities];
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
  const columns = ["시도코드", "시도", "날짜코드", "날짜구분", "시간코드", "조회시간", "구시군명", "선거인수", "사전투표자수", "사전투표율", "source", "출처URL"];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const text = [columns.join(","), ...rows.map(row => columns.map(column => csvEscape(row[column])).join(","))].join("\r\n");
  fs.writeFileSync(OUT, "\uFEFF" + text, "utf8");
}
async function selectReady(page, selector, value) {
  await page.locator(selector).waitFor({ state: "attached", timeout: 45000 });
  await page.waitForFunction(
    ({ selector, value }) => {
      const element = document.querySelector(selector);
      return element && !element.disabled && Array.from(element.options || []).some(option => option.value === value);
    },
    { selector, value },
    { timeout: 45000 }
  );
  await page.selectOption(selector, value, { force: true, timeout: 45000 });
}
async function submitAndRows(page) {
  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  await page.evaluate(() => {
    const button = document.querySelector("#spanSubmit input[type=image]");
    if (!button) throw new Error("search button not found");
    button.click();
  });
  await navigation;
  await page.locator(".searchResult table").waitFor({ state: "attached", timeout: 45000 });
  await sleep(400);
  return page.evaluate(() => {
    const table = document.querySelector(".searchResult table");
    if (!table) return [];
    return Array.from(table.querySelectorAll("tr"))
      .map(tr => Array.from(tr.cells).map(td => td.innerText.replace(/\s+/g, " ").trim()))
      .filter(cells => cells.length >= 4 && cells[0] && !cells[0].includes("구시군명"));
  });
}

async function main() {
  const checkpoint = loadCheckpoint();
  const rows = checkpoint.rows;
  const completed = new Set(checkpoint.completed);
  const cities = loadCities();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  try {
    await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    for (const city of cities) {
      for (const date of DATE_CODES) {
        for (const time of TIME_CODES) {
          const key = `${city.code}|${date.code}|${time.code}`;
          if (completed.has(key)) continue;
          if (date.code === "3" && time.code === "0") {
            completed.add(key);
            checkpoint.failures = checkpoint.failures.filter(failure => failure.key !== key);
            checkpoint.rows = rows;
            checkpoint.completed = [...completed];
            saveCheckpoint(checkpoint);
            console.log(`${city.name} ${date.label} ${time.label}: skipped=time_not_available`);
            continue;
          }
          try {
            await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
            await selectReady(page, "#cityCode", city.code);
            await sleep(250);
            await selectReady(page, "#dateCode", date.code);
            await sleep(250);
            await selectReady(page, "#timeCode", time.code);
            await sleep(250);
            const table = await submitAndRows(page);
            for (const cells of table) {
              rows.push({
                시도코드: city.code,
                시도: city.name,
                날짜코드: date.code,
                날짜구분: date.label,
                시간코드: time.code,
                조회시간: time.label,
                구시군명: clean(cells[0]),
                선거인수: clean(cells[1]),
                사전투표자수: clean(cells[2]),
                사전투표율: clean(cells[3]),
                source: "NEC VCAP01 사전투표진행상황",
                출처URL: SOURCE_URL,
              });
            }
            completed.add(key);
            checkpoint.failures = checkpoint.failures.filter(failure => failure.key !== key);
            console.log(`${city.name} ${date.label} ${time.label}: ${table.length} rows`);
          } catch (error) {
            checkpoint.failures.push({ key, city, date, time, error: error.message, at: new Date().toISOString() });
            console.error(`${city.name} ${date.label} ${time.label}: failed ${error.message}`);
          }
          checkpoint.rows = rows;
          checkpoint.completed = [...completed];
          saveCheckpoint(checkpoint);
          writeCsv(rows);
          await sleep(250);
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`saved ${OUT} rows=${rows.length} completed=${completed.size} failures=${checkpoint.failures.length}`);
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exit(1); });
}
