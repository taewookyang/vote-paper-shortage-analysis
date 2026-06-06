/**
 * NEC 3종 데이터 병렬 수집
 *   1. 시간대별 투표진행상황 (VCVP01)
 *   2. 사전투표진행상황 (VCAP01)
 *   3. 선거인명부 확정상황 (BIPB02)
 * 실행: node scripts/collect_nec_all.cjs
 */
"use strict";
const { main: collectVoteProgress } = require("./collect_nec_vote_progress.cjs");
const { main: collectPrevote }      = require("./collect_nec_prevote.cjs");
const { main: collectVoterRoll }    = require("./collect_nec_voter_roll.cjs");

async function run() {
  console.log("=== NEC 3종 데이터 병렬 수집 시작 ===\n");
  const start = Date.now();

  const [r1, r2, r3] = await Promise.allSettled([
    collectVoteProgress().then(() => "투표진행상황 완료"),
    collectPrevote().then(()      => "사전투표현황 완료"),
    collectVoterRoll().then(()    => "선거인명부 완료"),
  ]);

  console.log("\n=== 수집 결과 ===");
  [r1, r2, r3].forEach(r => {
    if (r.status === "fulfilled") console.log("  ✅", r.value);
    else console.log("  ❌", r.reason?.message?.slice(0, 100));
  });
  console.log(`\n총 소요: ${((Date.now() - start) / 1000).toFixed(1)}초`);
}

run().catch(e => { console.error(e); process.exit(1); });
