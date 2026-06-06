/**
 * VCCP08 페이지에서 실제 네비게이션 링크를 추출해 메뉴 ID 확인
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const url =
    "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP08";
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);

  const result = await page.evaluate(() => {
    // 1. 모든 a 태그 href 수집
    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => ({ text: a.innerText.trim(), href: a.href }))
      .filter((l) => l.href.includes("topMenuId") || l.href.includes("secondMenuId"));

    // 2. 메뉴 클릭 핸들러에서 파라미터 추출 (onclick 등)
    const clickables = Array.from(document.querySelectorAll("[onclick]"))
      .map((el) => ({ text: el.innerText.trim().slice(0, 40), onclick: el.getAttribute("onclick") }))
      .filter((el) => el.onclick && (el.onclick.includes("Menu") || el.onclick.includes("menu")));

    // 3. 상단 탭 네비게이션
    const tabs = Array.from(document.querySelectorAll(".gnb li, .lnb li, nav li, .tab li, .menu li"))
      .map((li) => li.innerText.trim().slice(0, 30));

    // 4. 현재 페이지 전체 텍스트 (메뉴 링크 찾기)
    const allText = document.body.innerText;
    const menuPattern = /topMenuId=([A-Z]+).*?secondMenuId=([A-Z0-9]+)/g;
    const menuMatches = [];
    let m;
    while ((m = menuPattern.exec(allText)) !== null) {
      menuMatches.push({ topMenuId: m[1], secondMenuId: m[2] });
    }

    return { links, clickables: clickables.slice(0, 20), tabs, menuMatches };
  });

  console.log("=== 링크 (topMenuId/secondMenuId 포함) ===");
  result.links.forEach((l) => console.log(`  [${l.text}] → ${l.href}`));

  console.log("\n=== 탭/메뉴 목록 ===");
  result.tabs.forEach((t) => t && console.log(`  - ${t}`));

  console.log("\n=== onclick 요소 ===");
  result.clickables.forEach((c) => console.log(`  [${c.text}] onclick: ${c.onclick}`));

  console.log("\n=== 본문 내 menuId 패턴 ===");
  result.menuMatches.forEach((m) =>
    console.log(`  topMenuId=${m.topMenuId} secondMenuId=${m.secondMenuId}`)
  );

  // 5. 페이지 소스에서 직접 검색
  const source = await page.content();
  const srcMatches = [...source.matchAll(/topMenuId=([A-Z]+)['"&].*?secondMenuId=([A-Z0-9]+)/g)];
  console.log("\n=== 페이지 소스 내 menuId 패턴 ===");
  const seen = new Set();
  srcMatches.forEach((m) => {
    const key = `${m[1]}|${m[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      console.log(`  topMenuId=${m[1]} secondMenuId=${m[2]}`);
    }
  });

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
