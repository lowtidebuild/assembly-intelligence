import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const apiKey = process.env.ASSEMBLY_OPEN_API_KEY;
  if (!apiKey) {
    console.log("ASSEMBLY_OPEN_API_KEY missing");
    return;
  }

  const candidates =
    process.argv.slice(2).filter(Boolean).length > 0
      ? process.argv.slice(2).filter(Boolean)
      : ["NKTFULAPJMQOTWEED", "ncryefecpbfbklfqvu"];

  for (const ep of candidates) {
    const url = new URL(`https://open.assembly.go.kr/portal/openapi/${ep}`);
    url.searchParams.set("KEY", apiKey);
    url.searchParams.set("Type", "json");
    url.searchParams.set("pSize", "2");
    url.searchParams.set("AGE", "22");

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 Assembly-Intelligence/1.0",
        Accept: "application/json,text/plain,*/*",
      },
      cache: "no-store",
    });
    const text = await res.text();

    console.log(`\n=== ${ep} ===`);
    console.log(text.slice(0, 1200));
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
