const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "data", "raw", "songpa_2026_result.csv");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright")));
}

const ELECTION_ID = "0020260603";
const CITY_CODE = "1100";
const TOWN_CODE = "1124";
const SOURCE_RESULT_URL =
  "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP08";
const SOURCE_WINNER_URL =
  "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=EP&secondMenuId=EPEI01";

const SGG_TOWN_CODES = [
  ["6112401", "송파구가선거구"],
  ["6112402", "송파구나선거구"],
  ["6112403", "송파구다선거구"],
  ["6112404", "송파구라선거구"],
  ["6112405", "송파구마선거구"],
  ["6112406", "송파구바선거구"],
  ["6112407", "송파구사선거구"],
  ["6112408", "송파구아선거구"],
  ["6112409", "송파구자선거구"],
  ["6112410", "송파구차선거구"],
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value) {
  const text = cleanText(value).replace(/,/g, "");
  if (!text || text === "-") return "";
  const number = Number(text);
  return Number.isFinite(number) ? number : "";
}

function splitCandidate(header) {
  const parts = String(header ?? "")
    .split("\n")
    .map(cleanText)
    .filter(Boolean);
  if (parts.length === 1) {
    return { party: "", name: parts[0] };
  }
  return { party: parts[0], name: parts.slice(1).join(" ") };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function selectSongpaBasicCouncil(page, sourceUrl) {
  await page.goto(sourceUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => setElectionCode(6));
  await page.waitForTimeout(1000);
  await page.selectOption("#cityCode", CITY_CODE);
  await page.waitForTimeout(1200);
  await page.selectOption("#townCode", TOWN_CODE);
  await page.waitForTimeout(1200);
}

async function submitAndWait(page) {
  const nav = page
    .waitForNavigation({ waitUntil: "networkidle", timeout: 60000 })
    .catch(() => null);
  await page.locator("#spanSubmit input[type=image]").click();
  await nav;
  await page.waitForTimeout(1000);
}

async function collectWinners(page) {
  await selectSongpaBasicCouncil(page, SOURCE_WINNER_URL);
  await submitAndWait(page);

  const winners = await page.evaluate(() => {
    const table = document.querySelector(".searchResult table");
    if (!table) return [];
    return Array.from(table.querySelectorAll("tr"))
      .slice(1)
      .map((tr) => Array.from(tr.cells).map((td) => td.innerText.trim()))
      .filter((cells) => cells.length >= 5)
      .map((cells) => ({
        district: cells[1],
        party: cells[2],
        name: cells[4].split("\n")[0].trim(),
      }));
  });

  return {
    winners,
    winnerSet: new Set(
      winners.map((winner) =>
        [cleanText(winner.district), cleanText(winner.party), cleanText(winner.name)].join("|")
      )
    ),
  };
}

async function collectDistrictResults(page, sggTownCode, sggTownName, winnerSet) {
  await selectSongpaBasicCouncil(page, SOURCE_RESULT_URL);
  await page.selectOption("#sggTownCode", sggTownCode);
  await page.waitForTimeout(1200);
  await submitAndWait(page);

  const table = await page.evaluate(() => {
    const resultTable = document.querySelector(".searchResult table");
    if (!resultTable) return null;
    return Array.from(resultTable.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.cells).map((cell) => ({
        tag: cell.tagName,
        text: cell.innerText.trim(),
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
      }))
    );
  });

  if (!table || table.length < 3) {
    throw new Error(`결과 표를 찾지 못했습니다: ${sggTownName}`);
  }

  const candidateHeaders = table[1]
    .map((cell) => cell.text)
    .filter((text) => cleanText(text) && cleanText(text) !== "계");
  const candidates = candidateHeaders.map(splitCandidate);
  const rows = [];

  for (const row of table.slice(2)) {
    const cells = row.map((cell) => cell.text);
    if (cells.length < 6) continue;

    let eupmyeondong = cleanText(cells[0]);
    let countingUnit = cleanText(cells[1]);
    if (
      !countingUnit &&
      ["합계", "거소투표", "관외사전투표", "잘못 투입·구분된 투표지"].includes(eupmyeondong)
    ) {
      countingUnit = eupmyeondong;
      eupmyeondong = "";
    }
    const electors = parseNumber(cells[2]);
    const votes = parseNumber(cells[3]);
    const candidateVoteStart = 4;
    const candidateTotalIndex = candidateVoteStart + candidates.length;
    const invalidVoteIndex = candidateTotalIndex + 1;
    const abstentionIndex = candidateTotalIndex + 2;

    candidates.forEach((candidate, index) => {
      const resultKey = [sggTownName, candidate.party, candidate.name].join("|");
      rows.push({
        시도: "서울특별시",
        구시군: "송파구",
        선거명: "제9회 전국동시지방선거 구·시·군의회의원선거",
        선거구코드: sggTownCode,
        선거구명: sggTownName,
        읍면동명: eupmyeondong,
        개표단위: countingUnit,
        선거인수: electors,
        투표수: votes,
        정당명: candidate.party,
        후보명: candidate.name,
        후보별득표수: parseNumber(cells[candidateVoteStart + index]),
        후보득표계: parseNumber(cells[candidateTotalIndex]),
        무효투표수: parseNumber(cells[invalidVoteIndex]),
        기권자수: parseNumber(cells[abstentionIndex]),
        당락결과: winnerSet.has(resultKey) ? "당선" : "낙선",
        출처URL: SOURCE_RESULT_URL,
        당선인출처URL: SOURCE_WINNER_URL,
      });
    });
  }

  return rows;
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const { winners, winnerSet } = await collectWinners(page);
    console.log(`당선인 ${winnerSet.size}명 수집`);

    const allRows = [];
    for (const [code, name] of SGG_TOWN_CODES) {
      console.log(`${name} 수집 중...`);
      const rows = await collectDistrictResults(page, code, name, winnerSet);
      if (rows.length === 0) {
        winners
          .filter((winner) => cleanText(winner.district) === name)
          .forEach((winner) => {
            rows.push({
              시도: "서울특별시",
              구시군: "송파구",
              선거명: "제9회 전국동시지방선거 구·시·군의회의원선거",
              선거구코드: code,
              선거구명: name,
              읍면동명: "",
              개표단위: "무투표당선",
              선거인수: "",
              투표수: "",
              정당명: cleanText(winner.party),
              후보명: cleanText(winner.name),
              후보별득표수: "",
              후보득표계: "",
              무효투표수: "",
              기권자수: "",
              당락결과: "무투표당선",
              출처URL: SOURCE_RESULT_URL,
              당선인출처URL: SOURCE_WINNER_URL,
            });
          });
      }
      allRows.push(...rows);
      console.log(`  ${rows.length}행`);
      await sleep(1200);
    }

    const columns = [
      "시도",
      "구시군",
      "선거명",
      "선거구코드",
      "선거구명",
      "읍면동명",
      "개표단위",
      "선거인수",
      "투표수",
      "정당명",
      "후보명",
      "후보별득표수",
      "후보득표계",
      "무효투표수",
      "기권자수",
      "당락결과",
      "출처URL",
      "당선인출처URL",
    ];
    const csv = [
      columns.join(","),
      ...allRows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
    ].join("\r\n");

    fs.writeFileSync(OUT, "\uFEFF" + csv, "utf8");
    console.log(`저장 완료: ${OUT}`);
    console.log(`총 ${allRows.length}행`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
