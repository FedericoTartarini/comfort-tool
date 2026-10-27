import { expect, test } from "@playwright/test";
import { trackerFor } from "./divergences";

// Explicit expected display values, without importing the app's formatter.
// An unlisted page makes any false difference fail rather than be accepted
// by the ISO entry. These exercise the shared comparator, not a comfort model.
const DISPLAY_CASES = [
  { name: "negative half", reference: -1.125, displayed: -1.12 },
  { name: "positive half", reference: 1.125, displayed: 1.13 },
  { name: "binary decimal edge", reference: 2.675, displayed: 2.68 },
  { name: "negative near zero", reference: -0.001, displayed: 0 },
  { name: "positive near zero", reference: 0.001, displayed: 0 },
  { name: "signed zero", reference: -0, displayed: 0 },
];

for (const { name, reference, displayed } of DISPLAY_CASES) {
  test(`display comparison agrees at ${name}`, () => {
    const tracker = trackerFor("/comparison-probe");
    tracker.check({ subject: "PMV", aspect: "value", inputs: {}, app: displayed, deployed: reference });
    tracker.assertListedStillHold();
  });
}

test("crossing a display boundary fails even with a small raw difference", () => {
  expect(() => trackerFor("/comparison-probe").check({
    subject: "PMV", aspect: "value", inputs: {}, app: 0.0049, deployed: 0.0051,
  })).toThrow(/Unlisted difference/);
});

for (const invalid of [NaN, Infinity, -Infinity, 1e308]) {
  test(`invalid comparison value ${String(invalid)} fails on either side`, () => {
    for (const [app, deployed] of [[invalid, 0], [0, invalid], [invalid, invalid]]) {
      expect(() => trackerFor("/comparison-probe").check({
        subject: "PMV", aspect: "value", inputs: {}, app, deployed,
      })).toThrow(/Cannot compare/);
    }
  });
}
