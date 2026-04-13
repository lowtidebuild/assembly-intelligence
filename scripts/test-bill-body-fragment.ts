import { fetchBillBodyFragment } from "../src/lib/bill-scraper";

async function main() {
  const billId = "PRC_I2I5R1P1P1O2P0N9N1V7U1U7S6T0S2";
  const body = await fetchBillBodyFragment(billId);
  console.log(JSON.stringify(body, null, 2));
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
