# Humidity Entry Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The input panel offers five humidity representations, every conversion is a library call, and a model whose `inputs` omit `q.rh` never receives `rh`.

**Architecture:** Entry groups are read from `RegisteredModel.inputs` by two predicates; each `HumidityMode` carries its own two conversion functions (library calls), so no caller switches on mode identity; the dynamic chart keeps sweeping the library's `rh` in every mode. Canonical pressure becomes Pa (the library's unit) with kPa as the SI display unit.

**Tech Stack:** Svelte 5 runes, TypeScript 6, Vitest, `jsthermalcomfort` fork (`../../forked repo/jsthermalcomfort`, branch `typescript`, build output already contains `hr_to_rh`, `rh_from_dew_point`, `rh_from_wet_bulb`, `rh_from_vapour_pressure`, `psy_ta_rh`).

**Spec:** `docs/superpowers/specs/2026-09-08-humidity-entry-modes-design.md`

## Global Constraints

- The app writes no formula and no threshold; every conversion is a `jsthermalcomfort/psychrometrics` call. Unit scaling for display lives only in `core/units.ts`.
- `p_atm` is never passed: the library default (101325 Pa) applies.
- Objects compared by identity live in `$state.raw` and are replaced, never mutated.
- Closed sets are `as const` objects with a `satisfies Record<string, …>`; no string keys anywhere in the app.
- Quantity display names come from `Quantity.label`; the only new copy is `humidityInput: "Humidity input"`.
- No `RegisteredModel` field is added.
- Fork quantity keys: `q.hr`, `q.dew_point_tmp`, `q.wet_bulb_tmp`, `q.p_vap` (not `t_dp` / `t_wb`).
- **No git writes.** The user commits; a task ends when its tests pass. Run a single file with `npx vitest run <path>`.
- Every `.svelte` change is checked with the Svelte MCP `svelte-autofixer` tool.
- Edits are made one site at a time with the edit tool after reading the surrounding code.

---

### Task 1: Entry-group predicates gate resolution

**Files:**
- Modify: `src/core/modelDeclaration.ts` (append after `limitFor`)
- Modify: `src/core/libraryInputs.ts:31-50` (`resolveQuantities`)
- Test: `src/core/libraryInputs.test.ts`

**Interfaces:**
- Produces: `hasHumidityGroup(model: RegisteredModel): boolean`, `hasTemperatureGroup(model: RegisteredModel): boolean` in `core/modelDeclaration.ts`.

- [ ] **Step 1: Write the failing tests** — add to the `describe("toLibraryInputs")` block in `src/core/libraryInputs.test.ts`:

```ts
  it("sends no rh to a model whose inputs do not name it", () => {
    const withoutHumidity = defineModel({
      ...pmvIso,
      inputs: pmvIso.inputs.filter(([quantity]) => quantity !== q.rh),
    });
    expect(toLibraryInputs(separateSlot(), withoutHumidity)).not.toHaveProperty("rh");
  });

  it("does not expand an operative entry for a model without separate temperatures", () => {
    const withoutTemperatures = defineModel({
      ...pmvIso,
      inputs: pmvIso.inputs.filter(([quantity]) => quantity !== q.tdb && quantity !== q.tr),
    });
    const init = toLibraryInputs(operativeSlot(24), withoutTemperatures);
    expect(init).not.toHaveProperty("tdb");
    expect(init).not.toHaveProperty("tr");
    expect(init.operative_tmp).toBe(24);
  });
```

- [ ] **Step 2: Run** `npx vitest run src/core/libraryInputs.test.ts` — expected: both new tests FAIL (`rh` present; `tdb` present).

- [ ] **Step 3: Add the predicates** at the end of `src/core/modelDeclaration.ts`:

```ts
/**
 * Entry groups are read from `inputs`, not declared (ADR §4.2, 2026-09-08):
 * a model has the humidity group when it takes `rh`, and the temperature
 * group when it takes both `tdb` and `tr`.
 */
export function hasHumidityGroup(model: RegisteredModel): boolean {
  return model.inputs.some(([quantity]) => quantity === quantities.rh);
}

export function hasTemperatureGroup(model: RegisteredModel): boolean {
  const entered = model.inputs.map(([quantity]) => quantity);
  return entered.includes(quantities.tdb) && entered.includes(quantities.tr);
}
```

Change the import at the top from `import type { Outcome, Quantity } from "jsthermalcomfort/io";` to `import { quantities, type Outcome, type Quantity } from "jsthermalcomfort/io";`.

- [ ] **Step 4: Gate `resolveQuantities`** in `src/core/libraryInputs.ts`. Import `hasHumidityGroup, hasTemperatureGroup` from `./modelDeclaration` (extend the existing import line). Replace the body's two blocks:

```ts
  if (hasTemperatureGroup(model) && slot.temperature.mode === temperatureMode.operative) {
    const operative = requireValue(resolved, q.operative_tmp);
    resolved.set(q.tdb, operative);
    resolved.set(q.tr, operative);
    resolved.delete(q.operative_tmp);
  }

  if (hasHumidityGroup(model)) {
    // Relative humidity is the only humidity mode until Task 3 adds the conversions.
    resolved.set(q.rh, slot.humidity.value);
  }
```

- [ ] **Step 5: Run** `npx vitest run src/core/libraryInputs.test.ts` — expected: all PASS.

---

### Task 2: Five humidity modes carrying their conversions

**Files:**
- Modify: `src/core/entryModes.ts:38-51` (`HumidityMode`, `humidityMode`)
- Create: `src/core/entryModes.test.ts`

**Interfaces:**
- Produces: `HumidityMode { id, quantity, toRelativeHumidity(value, tdb), fromRelativeHumidity(rh, tdb) }`; `humidityMode.rh | .humidityRatio | .dewPoint | .wetBulb | .vapourPressure`.

- [ ] **Step 1: Write the failing test** `src/core/entryModes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { quantities } from "jsthermalcomfort/io";
import { humidityMode } from "./entryModes";

describe("humidityMode", () => {
  it("names the library quantity each mode enters", () => {
    expect(humidityMode.rh.quantity).toBe(quantities.rh);
    expect(humidityMode.humidityRatio.quantity).toBe(quantities.hr);
    expect(humidityMode.dewPoint.quantity).toBe(quantities.dew_point_tmp);
    expect(humidityMode.wetBulb.quantity).toBe(quantities.wet_bulb_tmp);
    expect(humidityMode.vapourPressure.quantity).toBe(quantities.p_vap);
  });

  it("is the identity in rh mode", () => {
    expect(humidityMode.rh.toRelativeHumidity(50, 25)).toBe(50);
    expect(humidityMode.rh.fromRelativeHumidity(50, 25)).toBe(50);
  });

  // Round-trip bounds follow the fork's tests/psychrometrics.test.ts: the
  // algebraic inverses are exact, wet bulb carries wet_bulb_tmp's 0.1 °C
  // rounding, dew point carries dew_point_tmp's own approximation error.
  it.each([
    [humidityMode.humidityRatio, 9],
    [humidityMode.vapourPressure, 9],
    [humidityMode.wetBulb, 0],
    [humidityMode.dewPoint, 0],
  ])("round-trips 50 % rh at 25 °C through $id", (mode, digits) => {
    const entered = mode.fromRelativeHumidity(50, 25);
    expect(mode.toRelativeHumidity(entered, 25)).toBeCloseTo(50, digits);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/core/entryModes.test.ts` — expected: FAIL (`humidityRatio` undefined).

- [ ] **Step 3: Implement** — in `src/core/entryModes.ts` add the import

```ts
import {
  hr_to_rh,
  psy_ta_rh,
  rh_from_dew_point,
  rh_from_vapour_pressure,
  rh_from_wet_bulb,
} from "jsthermalcomfort/psychrometrics";
```

and replace the `HumidityMode` doc comment, interface and `humidityMode` object (the block from `/**\n * How the user enters humidity.` to the end of file) with:

```ts
/**
 * How the user enters humidity. The entered quantity is the truth; `rh` is
 * derived in `core/libraryInputs.ts` (ADR §4.5). Each mode carries its own
 * two conversions — library calls, `p_atm` left at the library's default
 * until "Set pressure" brings `environment` (rewrite plan, Phase 3.6 item 2)
 * — so no caller switches on mode identity. Object order is the panel's order.
 */
export interface HumidityMode {
  readonly id: string;
  readonly quantity: Quantity;
  /** The entered value as relative humidity, at this dry-bulb temperature. */
  readonly toRelativeHumidity: (value: number, tdb: number) => number;
  /** Relative humidity expressed in this mode, at this dry-bulb temperature. */
  readonly fromRelativeHumidity: (rh: number, tdb: number) => number;
}

export const humidityMode = {
  rh: {
    id: "relative-humidity",
    quantity: quantities.rh,
    toRelativeHumidity: (rh) => rh,
    fromRelativeHumidity: (rh) => rh,
  },
  humidityRatio: {
    id: "humidity-ratio",
    quantity: quantities.hr,
    toRelativeHumidity: (hr, tdb) => hr_to_rh(hr, tdb),
    fromRelativeHumidity: (rh, tdb) => psy_ta_rh(tdb, rh).hr,
  },
  dewPoint: {
    id: "dew-point",
    quantity: quantities.dew_point_tmp,
    toRelativeHumidity: (dewPoint, tdb) => rh_from_dew_point(dewPoint, tdb),
    fromRelativeHumidity: (rh, tdb) => psy_ta_rh(tdb, rh).dew_point_tmp,
  },
  wetBulb: {
    id: "wet-bulb",
    quantity: quantities.wet_bulb_tmp,
    toRelativeHumidity: (wetBulb, tdb) => rh_from_wet_bulb(wetBulb, tdb),
    fromRelativeHumidity: (rh, tdb) => psy_ta_rh(tdb, rh).wet_bulb_tmp,
  },
  vapourPressure: {
    id: "vapour-pressure",
    quantity: quantities.p_vap,
    toRelativeHumidity: (vapourPressure, tdb) => rh_from_vapour_pressure(vapourPressure, tdb),
    fromRelativeHumidity: (rh, tdb) => psy_ta_rh(tdb, rh).p_vap,
  },
} as const satisfies Record<string, HumidityMode>;
```

- [ ] **Step 4: Run** `npx vitest run src/core/entryModes.test.ts` — expected: PASS. If the wet-bulb or dew-point round trip fails at 0 digits, report the actual delta rather than loosening further; the fork's tests bound it.

---

### Task 3: Slot resolution, marker and sweep under any humidity mode

**Files:**
- Modify: `src/core/libraryInputs.ts` (`resolveQuantities`, `enteredValue`, `withEnteredValues`; new `relativeHumidityOf`)
- Test: `src/core/libraryInputs.test.ts`

**Interfaces:**
- Consumes: `HumidityMode.toRelativeHumidity` (Task 2), `hasHumidityGroup` (Task 1).
- Produces: `relativeHumidityOf(slot: SlotInputs): number`.

- [ ] **Step 1: Write the failing tests** — add to `describe("entered values")` in `src/core/libraryInputs.test.ts`:

```ts
  it("derives rh from a dew-point entry at the slot's dry-bulb temperature", () => {
    const dewPoint = humidityMode.dewPoint.fromRelativeHumidity(50, 25);
    const slot: SlotInputs = { ...separateSlot(), humidity: { mode: humidityMode.dewPoint, value: dewPoint } };
    expect(toLibraryInputs(slot, pmvIso).rh).toBeCloseTo(50, 0);
    expect(enteredValue(slot, q.dew_point_tmp)).toBe(dewPoint);
    expect(enteredValue(slot, q.rh)).toBeCloseTo(50, 0);
  });

  it("derives rh from the operative temperature under operative entry", () => {
    const dewPoint = humidityMode.dewPoint.fromRelativeHumidity(50, 24);
    const slot: SlotInputs = { ...operativeSlot(24), humidity: { mode: humidityMode.dewPoint, value: dewPoint } };
    expect(toLibraryInputs(slot, pmvIso).rh).toBeCloseTo(50, 0);
  });

  it("sweeps rh as rh whatever the entry mode", () => {
    const slot: SlotInputs = { ...separateSlot(), humidity: { mode: humidityMode.dewPoint, value: 10 } };
    const swept = withEnteredValues(slot, new Map([[q.rh, 70]]));
    expect(swept.humidity).toEqual({ mode: humidityMode.rh, value: 70 });
    expect(toLibraryInputs(swept, pmvIso).rh).toBe(70);
    expect(slot.humidity.mode).toBe(humidityMode.dewPoint);
  });
```

- [ ] **Step 2: Run** `npx vitest run src/core/libraryInputs.test.ts` — expected: the three new tests FAIL.

- [ ] **Step 3: Implement** in `src/core/libraryInputs.ts`. Extend the entryModes import to `import { humidityMode, temperatureMode, type HumidityMode, type TemperatureMode } from "./entryModes";`. Add after `requireValue`:

```ts
/**
 * The slot's humidity as the library's `rh`, converted from whatever the user
 * entered at the slot's dry-bulb temperature (the operative temperature under
 * operative entry, ADR §4.5). The one place the mode's conversion is invoked.
 */
export function relativeHumidityOf(slot: SlotInputs): number {
  const tdb = slot.values.get(q.tdb) ?? requireValue(slot.values, q.operative_tmp);
  return slot.humidity.mode.toRelativeHumidity(slot.humidity.value, tdb);
}
```

In `resolveQuantities`, replace the humidity block with:

```ts
  if (hasHumidityGroup(model)) {
    resolved.set(q.rh, relativeHumidityOf(slot));
  }
```

Replace `enteredValue`:

```ts
/**
 * What the user entered for `quantity`, humidity included. `rh` is answered
 * in every mode — the dynamic chart sweeps and marks the library's `rh`, not
 * the entered representation.
 */
export function enteredValue(slot: SlotInputs, quantity: Quantity): number | undefined {
  if (quantity === slot.humidity.mode.quantity) {
    return slot.humidity.value;
  }
  if (quantity === q.rh) {
    return relativeHumidityOf(slot);
  }
  return slot.values.get(quantity);
}
```

In `withEnteredValues`, replace the loop body with:

```ts
    if (quantity === humidity.mode.quantity) {
      humidity = { mode: humidity.mode, value };
    } else if (quantity === q.rh) {
      // An rh sweep overrides the humidity entry outright: the chart's axis is the library's rh.
      humidity = { mode: humidityMode.rh, value };
    } else {
      values.set(quantity, value);
    }
```

- [ ] **Step 4: Run** `npx vitest run src/core/libraryInputs.test.ts` — expected: all PASS, including the pre-existing "reads the humidity entry from where the slot keeps it" and "sweeps the humidity entry as well".

---

### Task 4: Pressure in pascals, displayed as kPa

**Files:**
- Modify: `src/core/units.ts:32` (constant) and `:63-71` (`pressure`)
- Test: `src/core/units.test.ts:23-26`

- [ ] **Step 1: Update the tests** — replace the body of `it("converts pressure between kPa and inHg")` and add one case:

```ts
  it("converts pressure from the library's pascals to kPa and inHg", () => {
    const kilopascals = displayUnitFor(quantities.p_vap, unitSystem.si);
    expect(kilopascals.symbol).toBe("kPa");
    expect(kilopascals.fromSi(2700)).toBe(2.7);
    expect(kilopascals.toSi(2.7)).toBeCloseTo(2700, 9);
    const inchesOfMercury = displayUnitFor(quantities.p_atm, unitSystem.ip);
    expect(inchesOfMercury.fromSi(101325)).toBeCloseTo(29.92, 2);
    expect(inchesOfMercury.toSi(29.92)).toBeCloseTo(101325, -1);
  });
```

- [ ] **Step 2: Run** `npx vitest run src/core/units.test.ts` — expected: FAIL (`fromSi(2700)` is 2700).

- [ ] **Step 3: Implement** — rename the constant to `const PASCALS_PER_INCH_OF_MERCURY = 3386.389;` and `const PASCALS_PER_KILOPASCAL = 1000;`, then:

```ts
  // The library's pressures (`p_vap`, `p_atm`) are in pascals; kPa is the
  // display unit, as in the deployed tool.
  pressure: {
    si: {
      symbol: "kPa",
      step: 0.1,
      toSi: (kilopascals) => kilopascals * PASCALS_PER_KILOPASCAL,
      fromSi: (pascals) => pascals / PASCALS_PER_KILOPASCAL,
    },
    ip: {
      symbol: "inHg",
      step: 0.01,
      toSi: (inchesOfMercury) => inchesOfMercury * PASCALS_PER_INCH_OF_MERCURY,
      fromSi: (pascals) => pascals / PASCALS_PER_INCH_OF_MERCURY,
    },
  },
```

- [ ] **Step 4: Run** `npx vitest run src/core/units.test.ts` and `grep -rn "KILOPASCALS_PER" src` — expected: PASS, no remaining references.

---

### Task 5: Mode switch in the slot and the panel's humidity row

**Files:**
- Modify: `src/state/session.svelte.ts:40-42` (after `setHumidityValue`)
- Modify: `src/text/copy.ts:11` (after `operativeTemperature`)
- Modify: `src/ui/inputs/InputPanel.svelte`

**Interfaces:**
- Consumes: `humidityMode`, `HumidityMode` (Task 2); `hasHumidityGroup`, `hasTemperatureGroup` (Task 1); `relativeHumidityOf` (Task 3).
- Produces: `InputSlot.setHumidityMode(mode: HumidityMode): void`; `copy.humidityInput`.

- [ ] **Step 1: Add the slot method** in `src/state/session.svelte.ts`, directly after `setHumidityValue`:

```ts
  /**
   * Re-express the stored humidity in the new representation at the current
   * dry-bulb temperature. Lossy and one-way, like the temperature switch.
   */
  setHumidityMode(mode: HumidityMode): void {
    if (mode === this.humidity.mode) {
      return;
    }
    const tdb = this.values.get(q.tdb) ?? this.require(q.operative_tmp);
    const rh = this.humidity.mode.toRelativeHumidity(this.humidity.value, tdb);
    this.humidity = { mode, value: mode.fromRelativeHumidity(rh, tdb) };
  }
```

- [ ] **Step 2: Add the copy** in `src/text/copy.ts` after `operativeTemperature: "Operative",`: `humidityInput: "Humidity input",`.

- [ ] **Step 3: Update the panel** `src/ui/inputs/InputPanel.svelte`:

Imports: change the entryModes line to `import { humidityMode, temperatureMode, type HumidityMode } from "$lib/core/entryModes";` and the modelDeclaration line to `import { hasHumidityGroup, hasTemperatureGroup, type RegisteredModel } from "$lib/core/modelDeclaration";`.

Replace the `rows` derivation with:

```ts
  // The panel shows the entered representation in the rh row's place; the chart keeps rh.
  const rows = $derived(
    enteredQuantities(model, inputSlot.temperature.mode).map((quantity) =>
      quantity === humidityMode.rh.quantity ? inputSlot.humidity.mode.quantity : quantity,
    ),
  );
  const showTemperatureRow = $derived(hasTemperatureGroup(model));
  const showHumidityRow = $derived(hasHumidityGroup(model));
```

Add beside `variantFor`:

```ts
  function humidityVariantFor(mode: HumidityMode) {
    return inputSlot.humidity.mode === mode ? "default" : "outline";
  }
```

Wrap the existing temperature `<Inline>` in `{#if showTemperatureRow} … {/if}` and add, directly after it:

```svelte
  {#if showHumidityRow}
    <Inline gap="2" align="center">
      <span>{copy.humidityInput}</span>
      {#each Object.values(humidityMode) as mode (mode)}
        <Button size="sm" variant={humidityVariantFor(mode)} onclick={() => inputSlot.setHumidityMode(mode)}>
          {mode.quantity.label}
        </Button>
      {/each}
    </Inline>
  {/if}
```

- [ ] **Step 4: Run** the Svelte MCP `svelte-autofixer` on the panel file; apply what it reports and run it again until clean.

- [ ] **Step 5: Run** `npm run check` and `npm run lint` — expected: both green.

---

### Task 6: Full verification

**Files:** none modified.

- [ ] **Step 1: Run** `npm test`, `npm run check`, `npm run lint`, `npm run build` — expected: all green. Paste the summary lines.

- [ ] **Step 2: Browser check** (Chrome DevTools MCP against `npm run dev`): on the PMV page, note PMV; click each humidity button in turn and confirm the value field re-labels with the quantity's label and unit (kPa for vapour pressure, kg/kg for humidity ratio, °C for dew point and wet bulb), the number converts, and PMV stays the same to two decimals; set the dynamic chart's y axis to `rh` while in dew-point mode and confirm the surface and marker still render; switch to IP and confirm pressure reads inHg.

- [ ] **Step 3: Report** which checks passed and any discrepancy, verbatim. Do not commit; the user does.
