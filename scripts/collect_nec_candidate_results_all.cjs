/**
 * Collect NEC VCCP08 candidate results as a local raw-data mirror.
 *
 * Default scope is a small smoke sample. For the full 2026 local-election mirror:
 *   $env:SCOPE='national_all'
 *   $env:SHARD_COUNT='4'
 *   $env:SHARD_INDEX='0'
 *   node scripts/collect_nec_candidate_results_all.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright"))); }

const CODES_JSON = path.join(ROOT, "data", "raw", "national_codes.json");
const RESULT_URL = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP08";
const SCOPE = process.env.SCOPE || "smoke";
const SHARD_COUNT = Math.max(1, Number(process.env.SHARD_COUNT || 1));
const SHARD_INDEX = Math.max(0, Number(process.env.SHARD_INDEX || 0));
const TARGET_LIMIT = Number(process.env.TARGET_LIMIT || 0);
const SUFFIX = SHARD_COUNT > 1 ? `_worker_${SHARD_INDEX}_of_${SHARD_COUNT}` : "";
const OUT = path.join(ROOT, "data", "raw", `nec_candidate_results_2026_${SCOPE}${SUFFIX}.csv`);
const CHECKPOINT = path.join(ROOT, "data", "raw", `nec_candidate_results_2026_${SCOPE}${SUFFIX}_checkpoint.json`);

const ELECTIONS = [
  { code: 3, name: "광역단체장", townSelector: "townCode", districtSelector: null },
  { code: 4, name: "기초단체장", townSelector: "sggCityCode", districtSelector: "townCodeFromSgg" },
  { code: 5, name: "광역의원", townSelector: "townCode", districtSelector: "sggTownCode" },
  { code: 6, name: "기초의원", townSelector: "townCode", districtSelector: "sggTownCode" },
  { code: 8, name: "광역비례", townSelector: "townCode", districtSelector: null },
  { code: 9, name: "기초비례", townSelector: "sggCityCode", districtSelector: null },
  { code: 11, name: "교육감", townSelector: "townCode", districtSelector: null },
];
const ELECTION_FILTER = new Set(
  String(process.env.ELECTION_CODES || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => Number(value))
    .filter(Number.isFinite)
);

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
function splitCandidate(header) {
  const parts = String(header ?? "").split("\n").map(clean).filter(Boolean);
  return parts.length > 1
    ? { party: parts[0], name: parts.slice(1).join(" ") }
    : { party: "", name: parts[0] || "" };
}
function loadCodes() {
  return JSON.parse(fs.readFileSync(CODES_JSON, "utf8"));
}
function allTargets() {
  const codes = loadCodes();
  let targets = codes.flatMap(city => city.towns.map(town => ({
    cityName: city.name,
    cityCode: city.code,
    townName: town.name,
    townCode: town.code,
  })));
  if (SCOPE === "smoke") targets = targets.filter(target => target.cityCode === "1100" && target.townCode === "1124");
  targets = targets.filter((_, index) => index % SHARD_COUNT === SHARD_INDEX);
  if (TARGET_LIMIT > 0) targets = targets.slice(0, TARGET_LIMIT);
  return targets;
}
function electionsForScope() {
  const elections = ELECTION_FILTER.size
    ? ELECTIONS.filter(election => ELECTION_FILTER.has(election.code))
    : ELECTIONS;
  return SCOPE === "smoke" ? elections.slice(0, 3) : elections;
}
function isElectionApplicable(target, election) {
  if ((target.cityCode === "4900" || target.cityCode === "5100") && [4, 6, 9].includes(election.code)) {
    return false;
  }
  return true;
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
  const columns = [
    "scope","시도","구시군","선거종류","선거코드","선거구코드","선거구명","읍면동명","개표단위",
    "선거인수","투표수","정당명","후보명","후보별득표수","후보득표계","무효투표수","기권자수","출처URL",
  ];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const text = [columns.join(","), ...rows.map(row => columns.map(column => csvEscape(row[column])).join(","))].join("\r\n");
  fs.writeFileSync(OUT, "\uFEFF" + text, "utf8");
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
      if (byText) return byText.value;
      const normalizedText = String(text || "").replace(/\s+/g, "").trim();
      const byPrefix = options
        .filter(option => option.value && option.value !== "-1")
        .map(option => ({ value: option.value, text: option.textContent.replace(/\s+/g, "").trim() }))
        .filter(option => normalizedText.startsWith(option.text) || option.text.startsWith(normalizedText))
        .sort((left, right) => right.text.length - left.text.length)[0];
      return byPrefix ? byPrefix.value : null;
    },
    { selector, value, text },
    { timeout: 45000 }
  );
  await page.selectOption(selector, await handle.jsonValue(), { force: true, timeout: 45000 });
}
async function prepareForm(page, target, election) {
  await page.goto(RESULT_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#cityCode").waitFor({ state: "attached", timeout: 45000 });
  await page.evaluate(code => setElectionCode(code), election.code);
  await selectByValueOrText(page, "#cityCode", target.cityCode, target.cityName);
  await selectByValueOrText(page, `#${election.townSelector}`, target.townCode, target.townName);
  if (election.code === 4 || election.code === 9) {
    await selectByValueOrText(page, "#townCodeFromSgg", target.townCode, target.townName);
  }
  await sleep(500);
}
async function districtOptions(page, election, target) {
  if (!election.districtSelector) return [{ code: "", name: election.code === 9 ? target.townName : election.name }];
  const options = await page.evaluate(selector => {
    const select = document.querySelector(selector);
    if (!select) return [];
    return Array.from(select.options || [])
      .filter(option => option.value && option.value !== "-1")
      .map(option => ({ code: option.value, name: option.textContent.trim() }));
  }, `#${election.districtSelector}`);
  return options.length ? options : [{ code: "", name: target.townName }];
}
async function submitAndRead(page) {
  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  await page.locator("#spanSubmit input[type=image]").waitFor({ state: "attached", timeout: 45000 });
  await page.evaluate(() => {
    const button = document.querySelector("#spanSubmit input[type=image]");
    if (!button) throw new Error("search button not found");
    button.click();
  });
  await navigation;
  await page.locator(".searchResult table").waitFor({ state: "attached", timeout: 45000 });
  await sleep(500);
  return page.evaluate(() => {
    const table = document.querySelector(".searchResult table");
    return table
      ? Array.from(table.querySelectorAll("tr")).map(tr => Array.from(tr.cells).map(cell => cell.innerText.trim()))
      : [];
  });
}
function parseRows(table, target, election, district) {
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
        선거종류: election.name,
        선거코드: election.code,
        선거구코드: district.code || target.townCode,
        선거구명: district.name,
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
async function collectOne(page, target, election, district) {
  await prepareForm(page, target, election);
  if (election.districtSelector && district.code) {
    await selectByValueOrText(page, `#${election.districtSelector}`, district.code, district.name);
    await sleep(400);
  }
  return parseRows(await submitAndRead(page), target, election, district);
}

async function main() {
  const targets = allTargets();
  const elections = electionsForScope();
  const checkpoint = loadCheckpoint();
  const rows = checkpoint.rows;
  const completed = new Set(checkpoint.completed);
  console.log(`targets=${targets.length}, elections=${elections.map(e => `${e.code}:${e.name}`).join(", ")}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  try {
    for (const target of targets) {
      for (const election of elections) {
        const prepareKey = [target.cityCode, target.townCode, election.code].join("|");
        if (!isElectionApplicable(target, election)) {
          completed.add(`${prepareKey}|SKIP`);
          checkpoint.failures = checkpoint.failures.filter(failure => failure.key !== prepareKey && !String(failure.key || "").startsWith(`${prepareKey}|`));
          checkpoint.completed = [...completed];
          saveCheckpoint(checkpoint);
          continue;
        }
        let districts = [];
        try {
          await prepareForm(page, target, election);
          districts = await districtOptions(page, election, target);
        } catch (error) {
          checkpoint.failures.push({ key: `${target.cityCode}|${target.townCode}|${election.code}`, stage: "prepare", error: error.message, at: new Date().toISOString() });
          saveCheckpoint(checkpoint);
          continue;
        }
        for (const district of districts) {
          const key = [target.cityCode, target.townCode, election.code, district.code || target.townCode].join("|");
          if (completed.has(key)) continue;
          let parsed = null, lastError = null;
          for (let attempt = 1; attempt <= 3 && parsed === null; attempt++) {
            try {
              parsed = await collectOne(page, target, election, district);
            } catch (error) {
              lastError = error;
              console.error(`\nretry ${attempt}/3 ${target.cityName} ${target.townName} ${election.name} ${district.name}: ${error.message}`);
              await sleep(1500 * attempt);
            }
          }
          if (parsed === null) {
            checkpoint.failures.push({ key, stage: "collect", error: lastError?.message || "unknown", at: new Date().toISOString() });
          } else {
            rows.push(...parsed);
            completed.add(key);
            const staleFallbackKey = `${prepareKey}|${target.townCode}`;
            checkpoint.failures = checkpoint.failures.filter(failure => failure.key !== key && failure.key !== prepareKey && failure.key !== staleFallbackKey);
            process.stdout.write(`\r${completed.size} ${target.cityName} ${target.townName} ${election.name} ${district.name}: ${parsed.length} rows   `);
          }
          checkpoint.rows = rows;
          checkpoint.completed = [...completed];
          saveCheckpoint(checkpoint);
          await sleep(500);
        }
      }
    }
  } finally {
    await browser.close();
  }
  writeCsv(rows);
  if (checkpoint.failures.length === 0 && fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT);
  console.log(`\nsaved ${OUT} rows=${rows.length} failures=${checkpoint.failures.length}`);
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exit(1); });
}
