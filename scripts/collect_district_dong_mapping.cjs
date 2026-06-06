/**
 * Collect 2026 dong-to-council-district membership from NEC VCCP08 result tables.
 *
 * Scope: jurisdictions with a named polling place in shortage_2026.csv.
 * Output: data/raw/district_dong_mapping_2026.csv
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
const OUTPUT = path.join(ROOT, "data", "raw", "district_dong_mapping_2026.csv");
const SOURCE_URL = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP08";
const ELECTIONS = [
  { code: 5, name: "광역의원" },
  { code: 6, name: "기초의원" },
];
const CITY_ALIASES = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시",
  인천: "인천광역시", 울산: "울산광역시", 경남: "경상남도",
};

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function clean(value) { return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
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
  return rows.filter(item => item.some(Boolean)).map(item =>
    Object.fromEntries(headers.map((header, index) => [header, item[index] ?? ""]))
  );
}
function writeCsv(rows) {
  const columns = ["시도","구시군","선거종류","선거구코드","선거구명","읍면동","출처URL"];
  const text = [columns.join(","), ...rows.map(row => columns.map(column => csvEscape(row[column])).join(","))].join("\r\n");
  fs.writeFileSync(OUTPUT, "\uFEFF" + text, "utf8");
}

function buildTargets() {
  const shortage = parseCsv(fs.readFileSync(SHORTAGE_CSV, "utf8"));
  const codes = JSON.parse(fs.readFileSync(CODES_JSON, "utf8"));
  const keys = new Set(shortage.filter(row => row.투표소명).map(row => `${row.시도}|${row.구시군}`));
  return [...keys].map(key => {
    const [shortCity, townName] = key.split("|");
    const cityName = CITY_ALIASES[shortCity] || shortCity;
    const city = codes.find(item => item.name === cityName);
    const town = city?.towns.find(item => item.name === townName);
    if (!city || !town) throw new Error(`선관위 코드 매핑 실패: ${shortCity} ${townName}`);
    return { cityName, cityCode: city.code, townName, townCode: town.code };
  });
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

async function prepare(page, election, target) {
  await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#cityCode").waitFor({ state: "attached", timeout: 45000 });
  await page.evaluate(code => setElectionCode(code), election.code);
  await selectReady(page, "#cityCode", target.cityCode);
  await selectReady(page, "#townCode", target.townCode);
  await sleep(700);
}

async function districtOptions(page) {
  return page.evaluate(() => {
    const select = document.querySelector("#sggTownCode");
    return select ? Array.from(select.options)
      .filter(option => option.value && option.value !== "-1")
      .map(option => ({ code: option.value, name: option.textContent.trim() })) : [];
  });
}

async function submit(page) {
  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  await page.locator("#spanSubmit input[type=image]").click({ force: true, timeout: 45000 });
  await navigation;
  await page.locator(".searchResult table").waitFor({ state: "attached", timeout: 45000 });
  await sleep(500);
}

async function collectDistrict(page, election, target, district) {
  await prepare(page, election, target);
  await selectReady(page, "#sggTownCode", district.code);
  await submit(page);
  const dongs = await page.evaluate(() => {
    const table = document.querySelector(".searchResult table");
    if (!table) return [];
    const excluded = new Set(["", "합계", "거소투표", "관외사전투표", "잘못 투입·구분된 투표지", "무투표선거구입니다."]);
    return [...new Set(Array.from(table.querySelectorAll("tr")).slice(2)
      .map(tr => (tr.cells[0]?.innerText || "").replace(/\s+/g, " ").trim())
      .filter(name => !excluded.has(name)))];
  });
  return dongs.map(dong => ({
    시도: target.cityName, 구시군: target.townName, 선거종류: election.name,
    선거구코드: district.code, 선거구명: district.name, 읍면동: dong, 출처URL: SOURCE_URL,
  }));
}

async function main() {
  const targets = buildTargets();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  const rows = [];
  try {
    for (const target of targets) {
      for (const election of ELECTIONS) {
        await prepare(page, election, target);
        const districts = await districtOptions(page);
        for (const district of districts) {
          let completed = false;
          for (let attempt = 1; attempt <= 3 && !completed; attempt++) {
            try {
              const found = await collectDistrict(page, election, target, district);
              rows.push(...found);
              completed = true;
              process.stdout.write(`\r${target.townName} ${election.name} ${district.name}: ${found.length}개 동   `);
            } catch (error) {
              console.error(`\n재시도 ${attempt}/3 ${target.townName} ${district.name}: ${error.message}`);
              await sleep(1500 * attempt);
            }
          }
          if (!completed) throw new Error(`선거구 매핑 수집 실패: ${target.townName} ${district.name}`);
          await sleep(600);
        }
      }
    }
  } finally {
    await browser.close();
  }
  const unique = [...new Map(rows.map(row => [[row.선거종류,row.선거구코드,row.읍면동].join("|"), row])).values()];
  writeCsv(unique);
  console.log(`\n저장 완료: ${unique.length}개 동-선거구 매핑`);
}

main().catch(error => { console.error(error); process.exit(1); });
