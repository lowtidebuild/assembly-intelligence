import { describe, expect, it } from "vitest";
import {
  buildTranscriptSnippet,
  parseRecordMinutesHtml,
} from "@/lib/transcript-parser";
import {
  buildRecordMinutesViewUrl,
  extractMinutesIdFromUrl,
} from "@/lib/transcript-source";

const SAMPLE_HTML = `
  <div class="minutes_header">
    <div class="tit_wrap">
      <p class="turn">제434회 국회<br/>(임시회)</p>
      <div class="tit_in"><div class="tit"><h1>문화체육관광위원회회의록</h1></div></div>
      <p class="num">제3호</p>
    </div>
    <div class="place">
      <ul>
        <li><div class="sbj lts2">일시</div><p class="con">2026년 4월 10일(금)</p></li>
        <li><div class="sbj lts2">장소</div><p class="con">제2회의장</p></li>
      </ul>
    </div>
  </div>
  <div class="minutes_body">
    <p class="tit_sm angun pl10">
      <a id="item1" href="https://likms.assembly.go.kr/bill/billDetail.do?billId=PRC_TEST_BILL" class="tit">
        1. 전자상거래 등에서의 소비자보호에 관한 법률 일부개정법률안(의안번호 2219999)
      </a>
    </p>
    <div id="spk_2" class="item0 speaker spk_mem" data-mem_id="6623" data-name="진성준" data-pos="위원장">
      <div class="man">
        <a href="https://www.assembly.go.kr/members/22nd/JINSUNGJOON" target="_blank">
          <span class="pic"><img src="https://www.assembly.go.kr/static/portal/img/openassm/new/thumb/example.jpg" alt="진성준"></span>
          <span class="txt"><span class="position">위원장</span><strong class="name">진성준</strong><span class="area">(서울 강서구을)</span></span>
        </a>
      </div>
      <div class="talk"><div class="txt">
        <span class="spk_sub" id="spk_sub2-1">&nbsp;전자상거래 플랫폼 규제와 게임 결제 시스템에 대한 질의를 시작하겠습니다.</span><br/>
        <span class="spk_sub" id="spk_sub2-2">&nbsp;이 법안은 소비자 보호와 플랫폼 책임 강화를 동시에 다루고 있습니다.</span><br/>
      </div></div>
    </div>
    <div id="spk_3" class="item1 speaker spk_mem" data-mem_id="0" data-name="박홍근" data-pos="기획예산처장관">
      <div class="man">
        <span><span class="pic"><img src="/assembly/images/view/pic_member_none.jpg" alt="박홍근"></span><span class="txt"><span class="position">기획예산처장관</span><strong class="name">박홍근</strong></span></span>
      </div>
      <div class="talk"><div class="txt">
        <span class="spk_sub" id="spk_sub3-1">&nbsp;예, 전자상거래 관련 지원 예산을 검토하겠습니다.</span><br/>
      </div></div>
    </div>
  </div>
  <div class="minutes_footer"></div>
`;

describe("parseRecordMinutesHtml", () => {
  it("extracts transcript metadata, agenda items, and keyword hits", () => {
    const parsed = parseRecordMinutesHtml(SAMPLE_HTML, {
      keywords: ["전자상거래", "게임"],
      meetingName: "제22대 제434회 제3차 문화체육관광위원회",
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.committee).toBe("문화체육관광위원회");
    expect(parsed?.meetingDate).toBe("2026-04-10");
    expect(parsed?.sessionLabel).toContain("제434회 국회");
    expect(parsed?.agendaItems).toHaveLength(1);
    expect(parsed?.agendaItems[0]).toMatchObject({
      billId: "PRC_TEST_BILL",
      billNumber: "2219999",
    });
    expect(parsed?.utterances).toHaveLength(2);
    expect(parsed?.utterances[0].speakerName).toBe("진성준");
    expect(parsed?.utterances[0].matchedKeywords).toEqual(["전자상거래", "게임"]);
    expect(parsed?.utterances[0].snippet).toContain("전자상거래 플랫폼 규제");
    expect(parsed?.utterances[1].speakerPhotoUrl).toBeNull();
  });
});

describe("buildTranscriptSnippet", () => {
  it("focuses the excerpt around the first matched keyword", () => {
    const snippet = buildTranscriptSnippet(
      "이 법안은 소비자 보호와 전자상거래 플랫폼 책임 강화를 동시에 다루고 있습니다.",
      ["전자상거래"],
      12,
    );

    expect(snippet).toContain("전자상거래");
    expect(snippet?.startsWith("…")).toBe(true);
  });
});

describe("transcript-source helpers", () => {
  it("extracts minutes ids and builds the viewer url", () => {
    expect(
      extractMinutesIdFromUrl(
        "https://record.assembly.go.kr/assembly/viewer/minutes/download/pdf.do?id=56543",
      ),
    ).toBe("56543");
    expect(buildRecordMinutesViewUrl("56543")).toBe(
      "https://record.assembly.go.kr/assembly/viewer/minutes/xml.do?id=56543&type=view",
    );
  });
});
