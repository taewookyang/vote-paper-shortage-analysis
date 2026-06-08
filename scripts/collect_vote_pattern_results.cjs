/**
 * Collect candidate-level dong/counting-unit results from NEC VCCP08.
 *
 * Scope:
 *   pilot          Songpa mayor/mayor, Yeonsu metro mayor, article-listed Jeonnam/Gwangju areas
 *   national_metro all 256 city/town jurisdictions for metro governor election
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright"))); }

const CODES_JSON = path.join(ROOT, "data", "raw", "national_codes.json");
const SCOPE = process.env.SCOPE || "pilot";
const SHARD_COUNT = Math.max(1, Number(process.env.SHARD_COUNT || 1));
const SHARD_INDEX = Math.max(0, Number(process.env.SHARD_INDEX || 0));
const SUFFIX = SHARD_COUNT > 1 ? `_worker_${SHARD_INDEX}_of_${SHARD_COUNT}` : "";
const OUT = path.join(ROOT, "data", "raw", `vote_pattern_results_2026_${SCOPE}${SUFFIX}.csv`);
const CHECKPOINT = path.join(ROOT, "data", "raw", `vote_pattern_results_2026_${SCOPE}${SUFFIX}_checkpoint.json`);
const RESULT_URL = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP08";

const ELECTIONS = {
  metro_governor: { code: 3, name: "광역단체장" },
  basic_mayor: { code: 4, name: "기초단체장" },
};

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function clean(value) { return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function number(value) {
  const parsed = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function writeCsv(rows) {
  const columns = [
    "scope","시도","구시군","선거종류","선거코드","선거구명","읍면동명","개표단위",
    "선거인수","투표수","정당명","후보명","후보별득표수","후보득표계","무효투표수","기권자수","출처URL",
  ];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const text = [columns.join(","), ...rows.map(row => columns.map(column => csvEscape(row[column])).join(","))].join("\r\n");
  fs.writeFileSync(OUT, "\uFEFF" + text, "utf8");
}
function splitCandidate(header) {
  const parts = String(header ?? "").split("\n").map(clean).filter(Boolean);
  return parts.length > 1
    ? { party: parts[0], name: parts.slice(1).join(" ") }
    : { party: "", name: parts[0] || "" };
}
function loadCodes() {
  return JSON.parse(fs.readFileSync(CODES_JSON, "utf8"));
}
function findTown(codes, cityName, townName) {
  const city = codes.find(item => item.name === cityName);
  const town = city?.towns.find(item => item.name === townName);
  if (!city || !town) throw new Error(`코드 매핑 실패: ${cityName} ${townName}`);
  return { cityName, cityCode: city.code, townName, townCode: town.code };
}
function pilotTargets() {
  const codes = loadCodes();
  const specs = [
    { ...findTown(codes, "서울특별시", "송파구"), election: ELECTIONS.metro_governor },
    { ...findTown(codes, "서울특별시", "송파구"), election: ELECTIONS.basic_mayor },
    { ...findTown(codes, "인천광역시", "연수구"), election: ELECTIONS.metro_governor },
    { ...findTown(codes, "전라남도", "신안군"), election: ELECTIONS.metro_governor },
    { ...findTown(codes, "전라남도", "여수시"), election: ELECTIONS.metro_governor },
    { ...findTown(codes, "전라남도", "함평군"), election: ELECTIONS.metro_governor },
    { ...findTown(codes, "전라남도", "장성군"), election: ELECTIONS.metro_governor },
    { ...findTown(codes, "전라남도", "고흥군"), election: ELECTIONS.metro_governor },
    { ...findTown(codes, "전라남도", "보성군"), election: ELECTIONS.metro_governor },
    { ...findTown(codes, "광주광역시", "광산구"), election: ELECTIONS.metro_governor },
  ];
  return specs.map((target, index) => ({ ...target, key: `${target.election.code}|${target.cityCode}|${target.townCode}|${index}` }));
}
function nationalMetroTargets() {
  const codes = loadCodes();
  return codes.flatMap(city => city.towns.map(town => ({
    cityName: city.name, cityCode: city.code, townName: town.name, townCode: town.code,
    election: ELECTIONS.metro_governor,
    key: `${ELECTIONS.metro_governor.code}|${city.code}|${town.code}`,
  }))).filter((_, index) => index % SHARD_COUNT === SHARD_INDEX);
}
function buildTargets() {
  return SCOPE === "national_metro" ? nationalMetroTargets() : pilotTargets();
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
async function selectByValueOrText(page, selector, value, text) {
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
async function fetchTable(page, target) {
  await page.goto(RESULT_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#cityCode").waitFor({ state: "attached", timeout: 45000 });
  await page.evaluate(code => setElectionCode(code), target.election.code);
  await selectReady(page, "#cityCode", target.cityCode);
  if (target.election.code === ELECTIONS.basic_mayor.code) {
    await selectByValueOrText(page, "#sggCityCode", target.townCode, target.townName);
    await selectByValueOrText(page, "#townCodeFromSgg", target.townCode, target.townName);
  } else {
    await selectReady(page, "#townCode", target.townCode);
  }
  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  await page.locator("#spanSubmit input[type=image]").click({ force: true, timeout: 45000 });
  await navigation;
  await page.locator(".searchResult table").waitFor({ state: "attached", timeout: 45000 });
  await sleep(400);
  return page.evaluate(() => {
    const table = document.querySelector(".searchResult table");
    return table
      ? Array.from(table.querySelectorAll("tr")).map(tr => Array.from(tr.cells).map(cell => cell.innerText.trim()))
      : [];
  });
}
function parseRows(table, target) {
  if (table.length < 3) return [];
  if (table.some(cells => cells.some(cell => clean(cell).includes("무투표선거구입니다")))) return [];
  const candidateHeaders = table[1].map(clean).filter(text => text && text !== "계");
  const candidates = candidateHeaders.map(splitCandidate);
  const rows = [];
  for (const cells of table.slice(2)) {
    if (cells.length < 4 + candidates.length) continue;
    const dong = clean(cells[0]);
    const unit = clean(cells[1]);
    if (!unit || unit === "잘못 투입·구분된 투표지") continue;
    const electors = number(cells[2]);
    const voters = number(cells[3]);
    const voteSum = number(cells[4 + candidates.length]);
    const invalid = number(cells[5 + candidates.length]);
    const abstained = number(cells[6 + candidates.length]);
    candidates.forEach((candidate, index) => {
      const votes = number(cells[4 + index]);
      if (votes === null) return;
      rows.push({
        scope: SCOPE,
        시도: target.cityName,
        구시군: target.townName,
        선거종류: target.election.name,
        선거코드: target.election.code,
        선거구명: target.election.name,
        읍면동명: dong || "",
        개표단위: unit,
        선거인수: electors ?? "",
        투표수: voters ?? "",
        정당명: candidate.party,
        후보명: candidate.name,
        후보별득표수: votes,
        후보득표계: voteSum ?? "",
        무효투표수: invalid ?? "",
        기권자수: abstained ?? "",
        출처URL: RESULT_URL,
      });
    });
  }
  return rows;
}

async function main() {
  const targets = buildTargets();
  const checkpoint = fs.existsSync(CHECKPOINT)
    ? JSON.parse(fs.readFileSync(CHECKPOINT, "utf8"))
    : { rows: [], completed: [], failures: [] };
  const rows = checkpoint.rows;
  const completed = new Set(checkpoint.completed);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  try {
    for (const target of targets) {
      if (completed.has(target.key)) continue;
      let parsed = null, lastError;
      for (let attempt = 1; attempt <= 3 && parsed === null; attempt++) {
        try {
          parsed = parseRows(await fetchTable(page, target), target);
        } catch (error) {
          lastError = error;
          console.error(`\n재시도 ${attempt}/3 ${target.cityName} ${target.townName} ${target.election.name}: ${error.message}`);
          await sleep(1500 * attempt);
        }
      }
      if (parsed === null) {
        checkpoint.failures.push({ key: target.key, error: lastError?.message || "unknown" });
      } else {
        rows.push(...parsed);
        completed.add(target.key);
        checkpoint.failures = checkpoint.failures.filter(failure => failure.key !== target.key);
        process.stdout.write(`\r${completed.size}/${targets.length} ${target.cityName} ${target.townName} ${target.election.name}: ${parsed.length}행   `);
      }
      checkpoint.rows = rows;
      checkpoint.completed = [...completed];
      fs.writeFileSync(CHECKPOINT, JSON.stringify(checkpoint, null, 2), "utf8");
      await sleep(500);
    }
  } finally {
    await browser.close();
  }
  writeCsv(rows);
  if (checkpoint.failures.length === 0 && fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT);
  console.log(`\n저장: ${OUT} (${rows.length}행, 실패 ${checkpoint.failures.length})`);
}

main().catch(error => { console.error(error); process.exit(1); });
