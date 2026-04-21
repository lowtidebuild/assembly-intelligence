import { describe, expect, it } from "vitest";
import { getPreset } from "@/lib/industry-presets";

const COMMERCE_V1_0_KEYWORDS = [
  "전자상거래",
  "전자상거래법",
  "온라인 쇼핑",
  "오픈마켓",
  "유통산업",
  "유통산업발전법",
  "대형마트",
  "의무휴업",
  "영업시간 제한",
  "대규모유통업법",
  "판매수수료",
  "납품업자",
  "PB상품",
  "자체브랜드",
  "배달 플랫폼",
  "배달앱",
  "플랫폼 종사자",
  "배달 라이더",
  "라이브커머스",
  "크로스보더",
  "해외직구",
  "알리",
  "테무",
  "공정거래",
  "독점 규제",
];

const CYBERSECURITY_V1_0_KEYWORDS = [
  "정보보호",
  "사이버 보안",
  "사이버보안",
  "개인정보 보호",
  "개인정보보호법",
  "정보통신망",
  "정보통신망법",
  "전자서명",
  "전자금융거래",
  "데이터 3법",
  "망분리",
  "해킹",
  "랜섬웨어",
  "디지털 포렌식",
  "CISO",
  "정보보호 최고책임자",
  "ISMS",
  "ISMS-P",
  "PIMS",
  "정보통신기반보호",
  "암호모듈",
  "전자정부",
  "클라우드 보안",
  "CSAP",
  "제로 트러스트",
  "공급망 보안",
  "보안 취약점",
  "사이버 침해",
];

describe("industry presets A1-B regression", () => {
  it("keeps the commerce v1.0 keyword set intact", () => {
    const preset = getPreset("commerce");
    expect(preset).toBeDefined();
    for (const keyword of COMMERCE_V1_0_KEYWORDS) {
      expect(preset?.keywords).toContain(keyword);
    }
  });

  it("keeps the cybersecurity v1.0 keyword set intact", () => {
    const preset = getPreset("cybersecurity");
    expect(preset).toBeDefined();
    for (const keyword of CYBERSECURITY_V1_0_KEYWORDS) {
      expect(preset?.keywords).toContain(keyword);
    }
  });

  it("bumps the commerce preset version", () => {
    expect(getPreset("commerce")?.presetVersion).toBe("commerce-v1.1");
  });

  it("bumps the cybersecurity preset version", () => {
    expect(getPreset("cybersecurity")?.presetVersion).toBe(
      "cybersecurity-v1.1",
    );
  });
});
