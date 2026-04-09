/**
 * Quick smoke test for the Gemini BillScorer. Calls scoreBill and
 * summarizeBill once each with a synthetic bill, prints the result.
 *
 * Use this to verify API key + prompt + JSON schema plumbing before
 * running the full morning sync.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { getGeminiBillScorer } = await import("../src/lib/gemini-client");
  const scorer = getGeminiBillScorer();

  const testInput = {
    billName: "게임산업진흥에 관한 법률 일부개정법률안",
    committee: "문화체육관광위원회",
    proposerName: "진종오",
    proposerParty: "국민의힘",
    proposalReason: null,
    mainContent: null,
    industryName: "게임",
    industryContext:
      "한국 게임산업은 모바일/PC 온라인 게임을 중심으로 성장. 확률형 아이템 규제, 게임 등급분류, 이스포츠 진흥, 게임물관리위원회 개편 등이 핵심 입법 이슈.",
    industryKeywords: [
      "게임산업",
      "게임산업진흥",
      "확률형 아이템",
      "게임 등급분류",
      "게임물관리위원회",
    ],
  };

  console.log("── scoreBill ──");
  const t0 = Date.now();
  const scoreResult = await scorer.scoreBill(testInput);
  console.log(`  ${Date.now() - t0}ms`);
  console.log(`  score: ${scoreResult.score}`);
  console.log(`  reasoning: ${scoreResult.reasoning}`);

  console.log("\n── summarizeBill ──");
  const t1 = Date.now();
  const summary = await scorer.summarizeBill({
    billName: testInput.billName,
    committee: testInput.committee,
    proposerName: testInput.proposerName,
    proposalReason: null,
    mainContent: null,
  });
  console.log(`  ${Date.now() - t1}ms`);
  console.log(`  ${summary}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ failed:", err);
    process.exit(1);
  });
