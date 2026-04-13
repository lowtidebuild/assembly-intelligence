import { describe, expect, it } from "vitest";
import {
  extractProposalSectionText,
  splitProposalAndMainContent,
} from "@/lib/bill-scraper";

describe("bill-scraper", () => {
  it("extracts the proposal section text from a bill info fragment", () => {
    const fragment = `
      <section>
        <h3>제안이유 및 주요내용</h3>
        <div class="contents">
          <p>제안이유</p>
          <p>게임산업 내부통제 기준을 강화하려는 것임.</p>
          <p>주요내용</p>
          <p>운영정보 유출 방지 및 감사체계 의무화.</p>
        </div>
        <div>첨부파일</div>
      </section>
    `;

    expect(extractProposalSectionText(fragment)).toBe(
      [
        "제안이유",
        "게임산업 내부통제 기준을 강화하려는 것임.",
        "주요내용",
        "운영정보 유출 방지 및 감사체계 의무화.",
      ].join("\n"),
    );
  });

  it("splits proposal reason and main content when headings are present", () => {
    const parsed = splitProposalAndMainContent(
      [
        "제안이유",
        "게임산업 내부통제 기준을 강화하려는 것임.",
        "주요내용",
        "운영정보 유출 방지 및 감사체계 의무화.",
      ].join("\n"),
    );

    expect(parsed).toEqual({
      proposalReason: "게임산업 내부통제 기준을 강화하려는 것임.",
      mainContent: "운영정보 유출 방지 및 감사체계 의무화.",
    });
  });

  it("keeps the full text as proposalReason when headings are not split", () => {
    const parsed = splitProposalAndMainContent(
      "게임산업 내부통제 기준을 강화하고 정보유출 방지를 위한 의무를 부과하려는 것임.",
    );

    expect(parsed).toEqual({
      proposalReason:
        "게임산업 내부통제 기준을 강화하고 정보유출 방지를 위한 의무를 부과하려는 것임.",
      mainContent: null,
    });
  });
});
