import goldenFixtures from "../tests/fixtures/golden-bills.json";
import {
  evaluateGoldenFixture,
  formatGoldenFixtureFailures,
  type GoldenBillFixture,
  type GoldenFixtureEvaluation,
} from "../src/services/golden-fixtures";

const fixtures = goldenFixtures as unknown as GoldenBillFixture[];

async function main(): Promise<void> {
  const evaluations: GoldenFixtureEvaluation[] = [];
  for (const fixture of fixtures) {
    const evaluation = await evaluateGoldenFixture(fixture);
    evaluations.push(evaluation);
    if (evaluation.failures.length === 0) {
      console.log(`ok ${fixture.id}`);
    } else {
      console.error(`fail ${fixture.id}`);
    }
  }

  const failures = formatGoldenFixtureFailures(evaluations);
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }

  console.log(`golden fixtures passed: ${fixtures.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
