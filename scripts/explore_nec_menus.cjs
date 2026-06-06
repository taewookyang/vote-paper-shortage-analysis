/**
 * NEC info 사이트 메뉴 구조 탐색
 * 2026 지방선거(0020260603) 기준으로 어떤 데이터가 어떤 URL에 있는지 확인
 * 실행: node scripts/explore_nec_menus.cjs
 */
"use strict";
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright")));
}

const ELECTION_ID = "0020260603";
const BASE = "https://info.nec.go.kr";

// 알려진 / 추정 메뉴 ID 목록
const CANDIDATE_MENUS = [
  // 투표 관련
  { topMenuId: "VS", secondMenuId: "VSCP01", label: "사전투표현황" },
  { topMenuId: "VS", secondMenuId: "VSCP02", label: "사전투표현황2" },
  { topMenuId: "VS", secondMenuId: "VSCW01", label: "시간대별투표현황" },
  { topMenuId: "VS", secondMenuId: "VSCW02", label: "시간대별투표현황2" },
  { topMenuId: "VS", secondMenuId: "VSCT01", label: "투표진행현황" },
  { topMenuId: "VT", secondMenuId: "VTCT01", label: "투표진행현황B" },
  { topMenuId: "VT", secondMenuId: "VTCP01", label: "사전투표B" },
  // 개표 관련
  { topMenuId: "VC", secondMenuId: "VCCP08", label: "개표결과(기초의원)" },
  { topMenuId: "VC", secondMenuId: "VCCP01", label: "개표결과01" },
  { topMenuId: "VC", secondMenuId: "VCCP02", label: "개표결과02" },
  { topMenuId: "VC", secondMenuId: "VCCP03", label: "개표결과03" },
  { topMenuId: "VC", secondMenuId: "VCCP04", label: "개표결과04" },
  { topMenuId: "VC", secondMenuId: "VCCP05", label: "개표결과05" },
  { topMenuId: "VC", secondMenuId: "VCCP06", label: "개표결과06" },
  { topMenuId: "VC", secondMenuId: "VCCP07", label: "개표결과07" },
  // 당선인
  { topMenuId: "EP", secondMenuId: "EPEI01", label: "당선인" },
];

async function checkMenu(page, menu) {
  const url = `${BASE}/main/showDocument.xhtml?electionId=${ELECTION_ID}&topMenuId=${menu.topMenuId}&secondMenuId=${menu.secondMenuId}`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1500);

    const result = await page.evaluate(() => {
      // 메뉴 타이틀
      const title = document.querySelector(".titContent, h2, .subTit, .pageTitle");
      // 테이블 존재 여부
      const tables = document.querySelectorAll("table");
      // 셀렉트박스 (어떤 필터가 있는지)
      const selects = Array.from(document.querySelectorAll("select"))
        .map((s) => ({ id: s.id, options: s.options.length }));
      // 에러 메시지
      const error = document.querySelector(".errorMsg, .noData, .alert");
      // 주요 텍스트 (첫 500자)
      const body = document.body?.innerText?.slice(0, 300)?.replace(/\s+/g, " ") || "";

      return {
        pageTitle: title?.innerText?.trim() || "",
        tableCount: tables.length,
        selects,
        errorText: error?.innerText?.trim() || "",
        bodySnippet: body,
      };
    });

    return { ...menu, url, ...result, ok: result.tableCount > 0 || result.pageTitle };
  } catch (err) {
    return { ...menu, url, ok: false, error: err.message };
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);

  console.log("=== NEC 메뉴 구조 탐색 ===\n");

  const results = [];
  for (const menu of CANDIDATE_MENUS) {
    process.stdout.write(`탐색 중: ${menu.label} ... `);
    const result = await checkMenu(page, menu);
    results.push(result);
    console.log(result.ok ? "✅" : "❌");
    if (result.ok) {
      console.log(`  페이지 타이틀: ${result.pageTitle}`);
      console.log(`  테이블 수: ${result.tableCount}`);
      console.log(`  셀렉트박스: ${JSON.stringify(result.selects)}`);
      console.log(`  바디 스니펫: ${result.bodySnippet.slice(0, 150)}`);
    } else if (result.errorText) {
      console.log(`  에러: ${result.errorText}`);
    }
    console.log(`  URL: ${result.url}\n`);
    await page.waitForTimeout(1000);
  }

  await browser.close();

  // 유효한 메뉴만 정리
  const valid = results.filter((r) => r.ok);
  console.log("\n=== 유효한 메뉴 목록 ===");
  valid.forEach((r) => {
    console.log(`  ${r.label}: topMenuId=${r.topMenuId}, secondMenuId=${r.secondMenuId}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
