import { config } from "dotenv";
config({ path: ".env.local" });

const MAIN_APP_URL =
  process.env.MAIN_APP_URL ?? "https://assembly-intelligence.vercel.app";
const DEMO_APP_URL =
  process.env.DEMO_APP_URL ?? "https://assembly-intelligence-demo.vercel.app";
const MAIN_APP_PASSWORD = process.env.MAIN_APP_PASSWORD ?? process.env.APP_PASSWORD;

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

async function requestText(
  input: string,
  init?: RequestInit,
): Promise<{ status: number; text: string; headers: Headers }> {
  const response = await fetch(input, init);
  const text = await response.text();
  return { status: response.status, text, headers: response.headers };
}

function ok(name: string, detail: string): CheckResult {
  return { name, ok: true, detail };
}

function fail(name: string, detail: string): CheckResult {
  return { name, ok: false, detail };
}

async function checkHealth(baseUrl: string, label: string): Promise<CheckResult> {
  const url = new URL("/api/health", baseUrl).toString();
  const response = await fetch(url);
  const body = (await response.json()) as { ok?: boolean };

  if (!response.ok) {
    return fail(`${label} health`, `HTTP ${response.status}`);
  }
  if (!body.ok) {
    return fail(`${label} health`, "payload ok=false");
  }
  return ok(`${label} health`, "ok=true");
}

async function checkHtmlContains(
  url: string,
  label: string,
  expected: string[],
  init?: RequestInit,
): Promise<CheckResult> {
  const response = await requestText(url, init);
  if (response.status >= 400) {
    return fail(label, `HTTP ${response.status}`);
  }

  const missing = expected.filter((token) => !response.text.includes(token));
  if (missing.length > 0) {
    return fail(label, `missing markers: ${missing.join(", ")}`);
  }

  return ok(label, `markers found: ${expected.join(", ")}`);
}

async function checkMainLogin(baseUrl: string): Promise<CheckResult> {
  const url = new URL("/login", baseUrl).toString();
  return checkHtmlContains(url, "main login", ["ParlaWatch+", "비밀번호"]);
}

async function checkMainBriefingWithPassword(
  baseUrl: string,
  password: string,
): Promise<CheckResult> {
  const loginUrl = new URL("/api/auth/login", baseUrl).toString();
  const form = new URLSearchParams({
    password,
    return_to: "/briefing",
  });

  const loginResponse = await requestText(loginUrl, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (![302, 303].includes(loginResponse.status)) {
    return fail("main briefing auth", `login HTTP ${loginResponse.status}`);
  }

  const rawCookie = loginResponse.headers.get("set-cookie");
  if (!rawCookie) {
    return fail("main briefing auth", "no auth cookie returned");
  }
  const cookie = rawCookie.split(";", 1)[0];

  const briefingUrl = new URL("/briefing", baseUrl).toString();
  return checkHtmlContains(
    briefingUrl,
    "main briefing",
    ["브리핑봇"],
    {
      headers: {
        cookie,
      },
    },
  );
}

async function main() {
  const checks: CheckResult[] = [];

  console.log("── postdeploy smoke ──");
  console.log(`main: ${MAIN_APP_URL}`);
  console.log(`demo: ${DEMO_APP_URL}`);

  checks.push(await checkHealth(MAIN_APP_URL, "main"));
  checks.push(await checkHealth(DEMO_APP_URL, "demo"));
  checks.push(await checkMainLogin(MAIN_APP_URL));

  if (MAIN_APP_PASSWORD) {
    checks.push(await checkMainBriefingWithPassword(MAIN_APP_URL, MAIN_APP_PASSWORD));
  } else {
    checks.push(
      ok("main briefing", "skipped (MAIN_APP_PASSWORD / APP_PASSWORD not set)"),
    );
  }

  checks.push(
    await checkHtmlContains(new URL("/briefing", DEMO_APP_URL).toString(), "demo briefing", [
      "브리핑봇",
      "Gemini 브리핑",
    ]),
  );
  checks.push(
    await checkHtmlContains(new URL("/watch", DEMO_APP_URL).toString(), "demo watch", [
      "의원 워치",
      "워치리스트",
    ]),
  );
  checks.push(
    await checkHtmlContains(
      new URL("/assembly", DEMO_APP_URL).toString(),
      "demo assembly",
      ["국회 현황", "본회의장 의석 배치"],
    ),
  );

  let failed = false;
  for (const result of checks) {
    const prefix = result.ok ? "OK" : "FAIL";
    console.log(`${prefix.padEnd(5)} ${result.name}: ${result.detail}`);
    if (!result.ok) failed = true;
  }

  if (failed) {
    console.error("\n❌ postdeploy smoke failed");
    process.exit(1);
  }

  console.log("\n✅ postdeploy smoke passed");
}

main().catch((error) => {
  console.error("❌ postdeploy smoke error:", error);
  process.exit(1);
});
