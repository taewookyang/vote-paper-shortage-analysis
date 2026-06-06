/**
 * Collect result margins for jurisdictions appearing in shortage_2026.csv.
 *
 * Outputs:
 *   data/raw/targeted_election_candidates_2026.csv
 *   data/processed/targeted_margin_screening_2026.csv
 *   dashboard/public/data/targeted_margin_screening_2026.json
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright"))); }

const SHORTAGE_CSV = path.join(ROOT, "data", "raw", "shortage_2026.csv");
const CODES_JSON = path.join(ROOT, "data", "raw", "national_codes.json");
const SCOPE = process.env.SCOPE === "national" ? "national" : "targeted";
const SHARD_COUNT = Math.max(1, Number(process.env.SHARD_COUNT || 1));
const SHARD_INDEX = Math.max(0, Number(process.env.SHARD_INDEX || 0));
const WORKER_SUFFIX = SCOPE === "national" ? `_worker_${SHARD_INDEX}_of_${SHARD_COUNT}` : "";
const RAW_OUT = path.join(ROOT, "data", "raw", `${SCOPE}_election_candidates_2026${WORKER_SUFFIX}.csv`);
const SCREEN_OUT = path.join(ROOT, "data", "processed", `${SCOPE}_margin_screening_2026${WORKER_SUFFIX}.csv`);
const CHECKPOINT = path.join(ROOT, "data", "raw", `${SCOPE}_margin_checkpoint${WORKER_SUFFIX}.json`);
const JSON_OUTS = [
  path.join(ROOT, "data", "processed", "dashboard", `${SCOPE}_margin_screening_2026${WORKER_SUFFIX}.json`),
];
if (SCOPE === "targeted") {
  JSON_OUTS.push(path.join(ROOT, "dashboard", "public", "data", "targeted_margin_screening_2026.json"));
}
const RESULT_URL = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP08";
const WINNER_URL = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=EP&secondMenuId=EPEI01";
const COUNCIL_ELECTIONS = [
  { code: 5, name: "광역의원" },
  { code: 6, name: "기초의원" },
];
const ELECTIONS = process.env.INCLUDE_MAYOR === "1"
  ? [{ code: 3, name: "기초단체장" }, ...COUNCIL_ELECTIONS]
  : COUNCIL_ELECTIONS;
const CITY_ALIASES = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시",
  인천: "인천광역시", 울산: "울산광역시", 경남: "경상남도",
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
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift().map(header => header.replace(/^\uFEFF/, ""));
  return rows.filter(row => row.some(Boolean)).map(row =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );
}
function candidateKey(district, party, name) {
  return [clean(district), clean(party), clean(name)].join("|");
}
function splitCandidate(header) {
  const parts = String(header ?? "").split("\n").map(clean).filter(Boolean);
  return parts.length > 1
    ? { party: parts[0], name: parts.slice(1).join(" ") }
    : { party: "", name: parts[0] || "" };
}
function writeCsv(file, rows, columns) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = [columns.join(","), ...rows.map(row => columns.map(column => csvEscape(row[column])).join(","))].join("\r\n");
  fs.writeFileSync(file, "\uFEFF" + text, "utf8");
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT)) return { rows: [], completed: [], completedTargets: [], failures: [] };
  return JSON.parse(fs.readFileSync(CHECKPOINT, "utf8"));
}

function saveCheckpoint(state) {
  fs.mkdirSync(path.dirname(CHECKPOINT), { recursive: true });
  fs.writeFileSync(CHECKPOINT, JSON.stringify(state, null, 2), "utf8");
}

async function retry(label, action, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;
      console.error(`\n재시도 ${attempt}/${attempts}: ${label}: ${error.message}`);
      await sleep(1500 * attempt);
    }
  }
  throw lastError;
}

async function selectReady(page, selector, value) {
  await page.locator(selector).waitFor({ state: "attached", timeout: 30000 });
  await page.waitForFunction(
    ({ selector, value }) => {
      const element = document.querySelector(selector);
      return element && !element.disabled && Array.from(element.options || []).some(option => option.value === value);
    },
    { selector, value },
    { timeout: 30000 }
  );
  await page.selectOption(selector, value, { force: true, timeout: 30000 });
}

function buildTargets() {
  const codes = JSON.parse(fs.readFileSync(CODES_JSON, "utf8"));
  if (SCOPE === "national") {
    return codes
      .flatMap(city => city.towns.map(town => ({
        shortCity: city.name,
        cityName: city.name,
        cityCode: city.code,
        townName: town.name,
        townCode: town.code,
        additionalSent: 0,
        named: 0,
        suspendedKnown: 0,
      })))
      .filter((_, index) => index % SHARD_COUNT === SHARD_INDEX);
  }

  const shortage = parseCsv(fs.readFileSync(SHORTAGE_CSV, "utf8"));
  const targetCounts = new Map();
  for (const row of shortage) {
    const key = `${row.시도}|${row.구시군}`;
    const current = targetCounts.get(key) || { additionalSent: 0, named: 0, suspendedKnown: 0 };
    current.additionalSent++;
    if (row.투표소명) current.named++;
    if (row.투표중단여부 === "True") current.suspendedKnown++;
    targetCounts.set(key, current);
  }

  const targets = [];
  for (const [key, counts] of targetCounts) {
    const [shortCity, townName] = key.split("|");
    const cityName = CITY_ALIASES[shortCity] || shortCity;
    const city = codes.find(item => item.name === cityName);
    const town = city?.towns.find(item => item.name === townName);
    if (!city || !town) throw new Error(`선관위 코드 매핑 실패: ${shortCity} ${townName}`);
    targets.push({ shortCity, cityName, cityCode: city.code, townName, townCode: town.code, ...counts });
  }
  return targets.sort((a, b) => b.additionalSent - a.additionalSent || a.cityName.localeCompare(b.cityName));
}

async function prepareForm(page, url, electionCode, target) {
  await retry(`${target.cityName} ${target.townName} 폼 준비`, async () => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.locator("#cityCode").waitFor({ state: "attached", timeout: 30000 });
    await page.evaluate(code => setElectionCode(code), electionCode);
    await selectReady(page, "#cityCode", target.cityCode);
    await selectReady(page, "#townCode", target.townCode);
    await sleep(1200);
  });
}

async function districtOptions(page) {
  return page.evaluate(() => {
    const select = document.querySelector("#sggTownCode");
    if (!select) return [];
    return Array.from(select.options)
      .filter(option => option.value && option.value !== "-1")
      .map(option => ({ code: option.value, name: option.textContent.trim() }));
  });
}

async function submit(page) {
  await retry("조회 제출", async () => {
    const button = page.locator("#spanSubmit input[type=image]");
    await button.waitFor({ state: "attached", timeout: 30000 });
    const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    await button.click({ force: true, timeout: 30000 });
    await navigation;
    await page.locator(".searchResult table").waitFor({ state: "attached", timeout: 30000 });
    await sleep(800);
  });
}

async function collectWinners(page, election, target) {
  await prepareForm(page, WINNER_URL, election.code, target);
  await submit(page);
  const rows = await page.evaluate(() => {
    const table = document.querySelector(".searchResult table");
    if (!table) return [];
    return Array.from(table.querySelectorAll("tr"))
      .slice(1)
      .map(tr => Array.from(tr.cells).map(cell => cell.innerText.trim()))
      .filter(cells => cells.length >= 5)
      .map(cells => ({
        district: cells[1],
        party: cells[2],
        name: cells[4].split("\n")[0].trim(),
      }));
  });
  return new Set(rows.map(row => candidateKey(row.district, row.party, row.name)));
}

async function collectDistrict(page, election, target, district, winnerSet) {
  await prepareForm(page, RESULT_URL, election.code, target);
  if (district.code) {
    await selectReady(page, "#sggTownCode", district.code);
    await sleep(500);
  }
  await submit(page);
  const table = await page.evaluate(() => {
    const element = document.querySelector(".searchResult table");
    return element
      ? Array.from(element.querySelectorAll("tr")).map(tr => Array.from(tr.cells).map(cell => cell.innerText.trim()))
      : [];
  });
  if (table.length < 3) return [];
  if (table.some(cells => cells.some(cell => clean(cell).includes("무투표선거구입니다")))) {
    return [];
  }
  const headers = table[1].map(cell => cell).filter(text => clean(text) && clean(text) !== "계");
  const candidates = headers.map(splitCandidate);
  const totals = new Map(candidates.map(candidate => [candidateKey(district.name, candidate.party, candidate.name), 0]));

  const totalRow = table.slice(2).find(cells => clean(cells[0]) === "합계");
  if (!totalRow || totalRow.length < candidates.length + 4) {
    throw new Error(`선거구 전체 합계 행을 찾지 못했습니다: ${district.name}`);
  }
  {
    const cells = totalRow;
    candidates.forEach((candidate, index) => {
      const key = candidateKey(district.name, candidate.party, candidate.name);
      const votes = number(cells[4 + index]);
      if (votes !== null) totals.set(key, votes);
    });
  }

  return candidates.map(candidate => {
    const key = candidateKey(district.name, candidate.party, candidate.name);
    return {
      시도: target.cityName, 구시군: target.townName,
      선거종류: election.name, 선거코드: election.code,
      선거구코드: district.code || target.townCode, 선거구명: district.name,
      정당명: candidate.party, 후보명: candidate.name,
      득표수: totals.get(key) || 0,
      당선여부: winnerSet.has(key) ? "당선" : "낙선",
      추가송부투표소수: target.additionalSent,
      공개투표소명수: target.named,
      확인된중단수: target.suspendedKnown,
      출처URL: RESULT_URL,
    };
  });
}

function screenMargins(candidateRows) {
  const grouped = new Map();
  for (const row of candidateRows) {
    const key = [row.시도, row.구시군, row.선거종류, row.선거구코드].join("|");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const screened = [];
  for (const rows of grouped.values()) {
    const winners = rows.filter(row => row.당선여부 === "당선" && row.득표수 > 0).sort((a, b) => a.득표수 - b.득표수);
    const losers = rows.filter(row => row.당선여부 === "낙선" && row.득표수 > 0).sort((a, b) => b.득표수 - a.득표수);
    const boundaryWinner = winners[0];
    const boundaryLoser = losers[0];
    const margin = boundaryWinner && boundaryLoser ? boundaryWinner.득표수 - boundaryLoser.득표수 : null;
    const base = rows[0];
    screened.push({
      시도: base.시도, 구시군: base.구시군, 선거종류: base.선거종류,
      선거구코드: base.선거구코드, 선거구명: base.선거구명,
      당선인수: winners.length,
      경계당선자: boundaryWinner?.후보명 || "",
      경계당선자득표: boundaryWinner?.득표수 ?? "",
      첫낙선자: boundaryLoser?.후보명 || "",
      첫낙선자득표: boundaryLoser?.득표수 ?? "",
      당선권경계표차: margin ?? "",
      추가송부투표소수: base.추가송부투표소수,
      공개투표소명수: base.공개투표소명수,
      확인된중단수: base.확인된중단수,
      검토등급: margin === null ? "확인불가" : margin <= 500 ? "우선검토" : margin <= 2000 ? "검토" : "참고",
      해석제한: "부족 투표소가 해당 선거구에 속하는지는 투표소명 또는 읍면동이 공개된 경우에만 별도 확인 필요",
      출처URL: RESULT_URL,
    });
  }
  return screened.sort((a, b) => {
    const ma = a.당선권경계표차 === "" ? Infinity : a.당선권경계표차;
    const mb = b.당선권경계표차 === "" ? Infinity : b.당선권경계표차;
    return ma - mb;
  });
}

async function main() {
  const targets = buildTargets();
  console.log(`대상 구시군 ${targets.length}개`);
  const checkpoint = loadCheckpoint();
  const completed = new Set(checkpoint.completed);
  const completedTargets = new Set(checkpoint.completedTargets || []);
  const browser = await chromium.launch({ headless: true });
  const allRows = checkpoint.rows;
  console.log(`체크포인트: 후보 ${allRows.length}행, 완료 선거구 ${completed.size}개`);
  try {
    for (const target of targets) {
      const targetKey = `${target.cityName}|${target.townName}`;
      if (completedTargets.has(targetKey)) continue;
      const page = await browser.newPage();
      page.setDefaultTimeout(30000);
      checkpoint.current = `${target.cityName}|${target.townName}`;
      checkpoint.currentStartedAt = new Date().toISOString();
      saveCheckpoint(checkpoint);
      try {
        for (const election of ELECTIONS) {
          try {
            await prepareForm(page, RESULT_URL, election.code, target);
            let districts = await districtOptions(page);
            if (districts.length === 0) districts = [{ code: "", name: target.townName }];
            const winners = await collectWinners(page, election, target);
            for (const district of districts) {
              const completionKey = [target.cityName, target.townName, election.code, district.code || target.townCode].join("|");
              if (completed.has(completionKey)) continue;
              try {
                checkpoint.current = completionKey;
                checkpoint.currentStartedAt = new Date().toISOString();
                saveCheckpoint(checkpoint);
                const rows = await retry(
                  `${target.cityName} ${target.townName} ${election.name} ${district.name}`,
                  () => collectDistrict(page, election, target, district, winners),
                  2
                );
                allRows.push(...rows);
                completed.add(completionKey);
                checkpoint.rows = allRows;
                checkpoint.completed = [...completed];
                saveCheckpoint(checkpoint);
                process.stdout.write(`\r${target.cityName} ${target.townName} ${election.name}: ${district.name} (${rows.length}명)   `);
                await sleep(900);
              } catch (error) {
                checkpoint.failures.push({ completionKey, error: error.message, at: new Date().toISOString() });
                saveCheckpoint(checkpoint);
                console.error(`\n선거구 수집 실패: ${completionKey}: ${error.message}`);
              }
            }
          } catch (error) {
            const failureKey = `${target.cityName}|${target.townName}|${election.code}`;
            checkpoint.failures.push({ completionKey: failureKey, error: error.message, at: new Date().toISOString() });
            saveCheckpoint(checkpoint);
            console.error(`\n수집 실패: ${target.cityName} ${target.townName} ${election.name}: ${error.message}`);
          }
        }
      } finally {
        await page.close().catch(() => null);
      }
      completedTargets.add(targetKey);
      checkpoint.completedTargets = [...completedTargets];
      checkpoint.current = "";
      checkpoint.currentStartedAt = "";
      saveCheckpoint(checkpoint);
    }
  } finally {
    await browser.close();
  }

  const rawColumns = ["시도","구시군","선거종류","선거코드","선거구코드","선거구명","정당명","후보명","득표수","당선여부","추가송부투표소수","공개투표소명수","확인된중단수","출처URL"];
  writeCsv(RAW_OUT, allRows, rawColumns);
  const screened = screenMargins(allRows);
  const negativeMargins = screened.filter(row => typeof row.당선권경계표차 === "number" && row.당선권경계표차 < 0);
  if (negativeMargins.length > 0) {
    throw new Error(`음수 당선권 경계 표차 ${negativeMargins.length}건: 후보 득표 또는 당선인 연결 검증 필요`);
  }
  const screenColumns = ["시도","구시군","선거종류","선거구코드","선거구명","당선인수","경계당선자","경계당선자득표","첫낙선자","첫낙선자득표","당선권경계표차","추가송부투표소수","공개투표소명수","확인된중단수","검토등급","해석제한","출처URL"];
  writeCsv(SCREEN_OUT, screened, screenColumns);
  const payload = {
    generatedAt: new Date().toISOString(),
    scope: SCOPE === "national"
      ? `전국 광역·기초의원 당선권 경계 표차 수집 워커 ${SHARD_INDEX + 1}/${SHARD_COUNT}`
      : "추가송부 67곳이 속한 구시군의 광역·기초의원 당선권 경계 표차 1차 스크리닝",
    disclaimer: "표차가 작다는 사실만으로 투표용지 부족이 결과에 영향을 미쳤다고 판단할 수 없다. 부족 투표소의 정확한 선거구 매핑과 실제 투표 포기 인원 확인이 필요하다.",
    items: screened,
  };
  for (const output of JSON_OUTS) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(payload, null, 2), "utf8");
  }
  if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT);
  console.log(`\n후보 ${allRows.length}행, 선거구 ${screened.length}개 저장 완료`);
}

main().catch(error => { console.error(error); process.exit(1); });
