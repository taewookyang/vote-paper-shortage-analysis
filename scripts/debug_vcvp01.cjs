/**
 * VCVP01 상세 디버그 — 시간대 선택 후 실제 응답 확인
 * 네트워크 요청, 테이블 구조, submit 방식 분석
 */
"use strict";
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(ROOT, "dashboard", "node_modules", "playwright"))); }

const URL = "https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCVP01";

async function main() {
  const browser = await chromium.launch({ headless: false }); // headless false로 실제 화면 확인
  const page = await browser.newPage();

  // 네트워크 요청 감지
  const requests = [];
  page.on("request", req => {
    if (req.url().includes("nec.go.kr") && req.method() === "POST") {
      requests.push({ url: req.url(), method: req.method(), postData: req.postData()?.slice(0, 200) });
    }
  });
  page.on("response", async resp => {
    if (resp.url().includes("nec.go.kr") && resp.request().method() === "POST") {
      console.log("POST 응답:", resp.url(), resp.status());
    }
  });

  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);

  // 1. 초기 페이지 상태 확인
  console.log("=== 초기 상태 ===");
  const initial = await page.evaluate(() => {
    const table = document.querySelector(".searchResult table, .result table, table");
    if (!table) return { tableFound: false, bodyText: document.body.innerText.slice(0, 300) };
    const rows = Array.from(table.querySelectorAll("tr")).slice(0, 5);
    return {
      tableFound: true,
      headers: Array.from(table.querySelectorAll("th")).map(th => th.innerText.trim()),
      sampleRows: rows.map(tr => Array.from(tr.cells).map(td => td.innerText.trim())),
    };
  });
  console.log(JSON.stringify(initial, null, 2));

  // 2. submit 버튼 확인
  const submitInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("input[type=image], input[type=submit], button[type=submit], .btnSearch, .btn_srch"));
    return btns.map(b => ({ tag: b.tagName, type: b.type, id: b.id, name: b.name, value: b.value, src: b.src }));
  });
  console.log("\n=== Submit 버튼 ===");
  console.log(JSON.stringify(submitInfo, null, 2));

  // 3. form 확인
  const formInfo = await page.evaluate(() => {
    const forms = Array.from(document.querySelectorAll("form"));
    return forms.map(f => ({ id: f.id, name: f.name, action: f.action, method: f.method }));
  });
  console.log("\n=== Form ===");
  console.log(JSON.stringify(formInfo, null, 2));

  // 4. 서울 선택 후 9시 선택 → submit
  console.log("\n=== 서울 + 9시 선택 ===");
  await page.selectOption("#cityCode", "1100");
  await page.waitForTimeout(800);
  await page.selectOption("#timeCode", "9");
  await page.waitForTimeout(800);

  // submit 방식 확인
  const submitBtn = page.locator("#spanSubmit input[type=image]").first();
  const btnExists = await submitBtn.count();
  console.log("spanSubmit button exists:", btnExists);

  // 다른 submit 버튼도 확인
  const allBtns = await page.locator("input[type=image], input[type=submit], button").count();
  console.log("전체 버튼 수:", allBtns);

  // click 전 현재 URL
  console.log("현재 URL:", page.url());

  // submit
  if (btnExists > 0) {
    await submitBtn.click();
  } else {
    // form submit 직접 시도
    await page.evaluate(() => {
      const form = document.querySelector("form");
      if (form) form.submit();
    });
  }
  await page.waitForTimeout(3000);

  console.log("submit 후 URL:", page.url());

  // 5. submit 후 테이블 데이터
  const afterSubmit = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll("table"));
    return tables.map((tbl, i) => {
      const rows = Array.from(tbl.querySelectorAll("tr")).slice(0, 6);
      return {
        tableIndex: i,
        rowCount: tbl.querySelectorAll("tr").length,
        sample: rows.map(tr => Array.from(tr.cells).map(td => td.innerText.replace(/\s+/g," ").trim()))
      };
    });
  });
  console.log("\n=== Submit 후 테이블 ===");
  afterSubmit.forEach(t => {
    if (t.rowCount > 1) {
      console.log(`\n[테이블 ${t.tableIndex}] ${t.rowCount}행:`);
      t.sample.forEach(r => console.log("  ", r.join(" | ")));
    }
  });

  // 6. 네트워크 요청 확인
  console.log("\n=== 감지된 POST 요청 ===");
  requests.forEach(r => console.log(r));

  // 7. 실제 시간대 데이터가 있는지 확인 (페이지 전체 텍스트에서 투표율 패턴)
  const pageText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log("\n=== 페이지 텍스트 (1000자) ===");
  console.log(pageText);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
