/**
 * Minimal Gemini call to debug response shape.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { GoogleGenAI, Type } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  console.log("── bare text call ──");
  const bare = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Say hi in Korean, one word only.",
    config: { temperature: 0.2, maxOutputTokens: 50 },
  });
  console.log("text:", JSON.stringify(bare.text));
  console.log("candidates:", JSON.stringify(bare.candidates?.[0]).slice(0, 500));

  console.log("\n── JSON schema call ──");
  const structured = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Output a JSON object with score=4 and reasoning='test reason'.",
    config: {
      temperature: 0.2,
      maxOutputTokens: 256,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER },
          reasoning: { type: Type.STRING },
        },
        required: ["score", "reasoning"],
      },
    },
  });
  console.log("text:", JSON.stringify(structured.text));
  console.log(
    "candidates:",
    JSON.stringify(structured.candidates?.[0]).slice(0, 500),
  );

  console.log("\n── real scoring prompt ──");
  const real = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `당신은 게임 산업 분석가입니다. 이 법안을 1-5점으로 평가하세요.

의안명: 게임산업진흥에 관한 법률 일부개정법률안
소관위원회: 문화체육관광위원회
대표발의자: 진종오 (국민의힘)

키워드: 게임산업, 확률형 아이템

JSON만:
{ "score": <1-5>, "reasoning": "<한국어 2-3문장>" }`,
    config: {
      temperature: 0.2,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER },
          reasoning: { type: Type.STRING },
        },
        required: ["score", "reasoning"],
      },
    },
  });
  console.log("text:", JSON.stringify(real.text));
  console.log("full candidates[0]:", JSON.stringify(real.candidates?.[0]));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
