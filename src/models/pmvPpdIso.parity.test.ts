import { describe, expect, it } from "vitest";
import { toLibraryInputs } from "$lib/core/libraryInputs";
import { quantities } from "$lib/core/quantities";
import { InputSlot } from "$lib/state/session.svelte";
import deployed from "./pmvPpdIso.parity.json";
import { pmvPpdIso } from "./pmvPpdIso";

const q = quantities;

// Result-table parity with the deployed CBE tool, checked in.
//
// Issue #21's acceptance re-runs this comparison by hand ("comf.pmvEN vs the
// app's run over the same eight input sets, |Δpmv| ≤ 1e-12") because it was
// never checked in. The expected values are not transcribed: the fixture is the
// deployed tool's own `comf.pmvEN` output, produced by
// scripts/generate-pmv-ppd-iso-parity.cjs, like chart-online.json for the zone.
//
// Each case goes through the app's whole input path: a slot holding the raw
// entered values, `toLibraryInputs` (which applies v → vr as the deployed tool
// does), then the declaration's `run`.
//
// The tolerance is the rewrite plan's own figure. The plan records the app
// reproducing `comf.pmvEN` to 2.6e-14 while the library kept the pre-2025
// `t_cla` initial guess. The library has since adopted the Annex D guess for
// both ISO editions, which the plan predicted would move PMV "by up to
// 5.1e-3"; the largest difference over these cases is now 1.2e-3. This test
// therefore guards the published figure rather than bit-equality, and fails if
// the gap widens past what the plan allows.
const PMV_TOLERANCE = 5.1e-3;
const PPD_TOLERANCE = 5e-2;

function runAsEntered(inputs: (typeof deployed.cases)[number]["inputs"]) {
  const slot = new InputSlot(pmvPpdIso);
  slot.values.set(q.tdb, inputs.tdb);
  slot.values.set(q.tr, inputs.tr);
  slot.values.set(q.v, inputs.v);
  slot.values.set(q.met, inputs.met);
  slot.values.set(q.clo, inputs.clo);
  slot.setHumidityValue(inputs.rh);
  return pmvPpdIso.run(toLibraryInputs(slot, pmvPpdIso));
}

describe("PMV (ISO 7730) parity with the deployed CBE tool", () => {
  it("has cases to compare, including the model's defaults", () => {
    expect(deployed.cases.length).toBeGreaterThanOrEqual(8);
    const defaults = Object.fromEntries(pmvPpdIso.inputs.map(({ quantity, value }) => [quantity.key, value]));
    expect(deployed.cases.map((entry) => entry.inputs)).toContainEqual(defaults);
  });

  it.each(deployed.cases)(
    "matches comf.pmvEN at tdb $inputs.tdb, tr $inputs.tr, v $inputs.v, rh $inputs.rh, met $inputs.met, clo $inputs.clo",
    ({ inputs, pmv, ppd }) => {
      const result = runAsEntered(inputs);
      expect(Math.abs(result.pmv - pmv)).toBeLessThanOrEqual(PMV_TOLERANCE);
      expect(Math.abs(result.ppd - ppd)).toBeLessThanOrEqual(PPD_TOLERANCE);
    },
  );
});
