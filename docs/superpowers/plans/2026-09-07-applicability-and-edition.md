# Applicability Violations and ISO Edition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The library reports every applicability row a run broke as typed `Outcome.violations`; the app pins ISO 7730 edition `"7730-2005"` through a new io field and shows derived / output violations without blocking calculation.

**Architecture:** Two repos. In the fork, `range_violations` returns `ApplicabilityLimit` rows by identity, the PMV kernel evaluates the ISO-only derived / output rows regardless of `limit_inputs`, and every `io` outcome carries `violations` (with `warnings` derived from it). The ISO io path gains `PmvPpdIsoInit.edition`, echoed on `PmvPpdIsoOutputs.edition`. In the app, `Outputs` stores them, the input panel filters the non-output rows into a hint line, and the result table annotates output rows and names the edition.

**Tech Stack:** Fork: TypeScript, Vitest, prettier, eslint (`npm run typecheck && npm test && npm run lint && npm run check:format && npm run build`). App: Svelte 5 runes, Vitest, svelte-check (`npm test && npm run check && npm run lint && npm run build`).

**Spec:** `docs/rewrite-plan.md` Phase 3.6 items 3 and 4 (decisions of 2026-09-07); `docs/adr-0001-architecture.md` §3 table row `Outcome.violations`, §4.1.2 last bullet, §4.1.3.

## Global Constraints

- **No git writes by the implementer.** Every "Commit" step below means: report the proposed commit message and the `git diff --stat`; the user runs git. Never run `git add`, `git commit`, `git stash`, `git checkout`.
- **One site at a time.** Every edit is made with the Edit tool after reading the surrounding code. No sed / awk / perl / scripted rewrites.
- **Fork paths.** Fork repo: `/Users/yehuihuang/SoftwareProjects/USYD/forked repo/jsthermalcomfort`, branch `typescript`, HEAD `46e8a0c`, working tree clean. The app consumes the fork's **build output** (`lib/esm/`): after any fork change, `npm run build` in the fork before running anything in the app.
- **App paths.** App repo: `/Users/yehuihuang/SoftwareProjects/USYD/main repo/comfort-tool`, branch `rewrite/v1`, HEAD `ae1c079`.
- **Library naming follows pythermalcomfort** (ADR §3): snake_case functions, kwargs objects, no `_`-prefixed exports, `edition` not `model`. Any deviation from upstream gets its reason written at the site.
- **App naming** (CLAUDE.md): a module-level scalar literal is `CONSTANT_CASE`; closed-set tables are `camelCase`; functions start with a verb; no `utils` / `helper` filenames. Quantities and limit rows are compared by identity, never by key string.
- **App rules**: `core/` imports nothing from `svelte`, `state/`, `ui/`, `routes/`. `ui/` business components use no Tailwind utilities. `$effect` in `state/` is the one recorded exemption (`compute.svelte.ts`); do not add a second. `$state.raw` for anything compared by identity.
- **Public model functions keep upstream's return shape**: `pmv_ppd_iso` / `pmv_ppd_ashrae` still return `{ pmv, ppd }`; `violations` lives on the kernel's internal return and on the `io` outcomes only.
- **`warnings` strings do not change**, in content or order. `tests/baseline.test.ts` pins them.
- **Test placement.** Fork tests live under `tests/` (vitest, `.js` for models/utilities, `.ts` for io). App tests sit beside the module: `src/core/x.test.ts`.
- **Language.** Code, comments, commit messages, test names in English.

---

## Part A — Fork (`jsthermalcomfort`, branch `typescript`)

### Task 1: `range_violations` — the row-returning check

**Files:**
- Modify: `src/utilities/utilities.ts:80-111` (`_range_warnings`), `:58-78` (`check_standard_compliance`)
- Test: `tests/utilities/utilities.test.js` (append after the `check_standard_compliance` describe, line ~508)

**Interfaces:**
- Produces: `export function range_violations(kwargs: ComplianceKwargs, limits: readonly ApplicabilityLimit[]): ApplicabilityLimit[]` — the `role: "input"` rows that the numeric fields of `kwargs` break, in `Object.entries(kwargs)` order, each element being the table's own object.
- `_range_warnings` becomes `range_violations(...).map((row) => row.warning)` so the two cannot drift.

- [ ] **Step 1: Write the failing tests**

Append to `tests/utilities/utilities.test.js` (add `range_violations` to the existing import from the utilities module at the top of the file, and add `import { iso7730PmvLimits, ashrae55PmvLimits } from "../../src/reference/limits.js";` — match the path style the file already uses for `src/`):

```js
describe("range_violations", () => {
  it("returns the table's own row objects, in the caller's key order", () => {
    const rows = range_violations(
      { tdb: 45, tr: 25, v: 1.5, met: 1.2, clo: 0.5 },
      iso7730PmvLimits,
    );
    const tdbRow = iso7730PmvLimits.find((row) => row.quantity.key === "tdb");
    const vRow = iso7730PmvLimits.find(
      (row) => row.quantity.key === "v" && row.role === "input",
    );
    expect(rows).toEqual([tdbRow, vRow]);
    expect(rows[0]).toBe(tdbRow);
  });

  it("ignores non-input rows and non-numeric fields", () => {
    const rows = range_violations(
      { tdb: 25, tr: 25, v: 0.1, met: 1.2, clo: 0.5, airspeed_control: false },
      iso7730PmvLimits,
    );
    expect(rows).toEqual([]);
  });

  it("is what check_standard_compliance's sentences come from", () => {
    const kwargs = { tdb: 45, tr: 45, v: 0.1, met: 0.5, clo: 0.5 };
    expect(check_standard_compliance("ISO", kwargs)).toEqual(
      range_violations(kwargs, iso7730PmvLimits).map((row) => row.warning),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/utilities/utilities.test.js -t "violations"`
Expected: FAIL — `range_violations is not a function` (or not exported).

- [ ] **Step 3: Implement**

In `src/utilities/utilities.ts`, replace `_range_warnings` (lines 80-111) with:

```ts
/**
 * The `role: "input"` rows of `limits` that the numeric fields of `kwargs`
 * fall outside, as the table's own objects.
 *
 * The arguments are iterated, not the table: the caller's key order is what
 * decides the order of the returned rows, and `tests/baseline.test.ts`
 * compares the sentences derived from them positionally.
 *
 * Not in upstream, which has no published limit tables to return rows from.
 * A consumer rendering applicability needs the row and its `role`, not a
 * sentence, so this is the primitive and `_range_warnings` maps over it.
 *
 * @internal
 */
export function range_violations(
  kwargs: ComplianceKwargs,
  limits: readonly ApplicabilityLimit[],
): ApplicabilityLimit[] {
  const violations: ApplicabilityLimit[] = [];
  for (const [key, value] of Object.entries(kwargs)) {
    // Only numeric fields are range-checked here; `airspeed_control` is a
    // boolean and is handled by the cross-field checks in the callers.
    if (typeof value !== "number") continue;
    // Matched by identity, not by spelling: the field name resolves to the one
    // `Quantity` object the table rows also point at, so the two can never
    // drift apart the way two copies of a string can.
    const quantity = quantityFor(key);
    // `role: "input"` only. A table may also carry rows for values the model
    // derives or returns (ISO 7730's vapour pressure and PMV bounds); those
    // are not arguments, so they are enforced where the value exists rather
    // than here.
    const limit = limits.find(
      (row) => row.quantity === quantity && row.role === "input",
    );
    if (limit === undefined) continue;
    if (value < limit.min || value > limit.max) violations.push(limit);
  }
  return violations;
}

/** The sentences of {@link range_violations}, for the string-returning checks. */
function _range_warnings(
  kwargs: ComplianceKwargs,
  limits: readonly ApplicabilityLimit[],
): string[] {
  return range_violations(kwargs, limits).map((row) => row.warning);
}
```

Check `src/utilities/index.ts`: if it re-exports named functions from `utilities.ts` one by one, do **not** add `range_violations` (it is `@internal`, like `pmv_ppd_with_warnings`). If it uses `export *`, leave it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/utilities/utilities.test.js tests/baseline.test.ts`
Expected: PASS, including every baseline case (the sentences and their order are unchanged).

- [ ] **Step 5: Commit (report only)**

Proposed message: `feat(utilities): range_violations returns limit rows; warnings derive from it`

---

### Task 2: The PMV kernel reports violations regardless of `limit_inputs`

**Files:**
- Modify: `src/models/pmv_ppd.ts:1-15` (imports), `:219-345` (`pmv_ppd_with_warnings`)
- Test: `tests/models/pmv_ppd_iso.test.js` (append)

**Interfaces:**
- Consumes: `range_violations` from Task 1.
- Produces: `pmv_ppd_with_warnings(...)` returns `PmvPpdResult & { pmv_unrounded: number; warnings: readonly string[]; violations: readonly ApplicabilityLimit[] }`. `violations` = input rows (caller order) followed by, for ISO only, `iso7730VapourPressureLimit` then `iso7730PmvRangeLimit` when broken — **evaluated whether or not `limit_inputs` is set**. `warnings` = `check_standard_compliance` sentences followed by the same two ISO sentences. NaN-ing is unchanged and still gated by `limit_inputs`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/models/pmv_ppd_iso.test.js`. Add `pmv_ppd_with_warnings` to the import from `pmv_ppd.js` (add an import line in the same style as the file's existing `src/` imports if there is none), and import `iso7730PmvLimits, iso7730VapourPressureLimit, iso7730PmvRangeLimit` from the reference limits module.

```js
describe("pmv_ppd_with_warnings violations", () => {
  const inRange = [25, 25, 0.1, 50, 1.2, 0.5];

  test("is empty when every row holds", () => {
    const out = pmv_ppd_with_warnings(...inRange, 0, "ISO");
    expect(out.violations).toEqual([]);
    expect(out.warnings).toEqual([]);
  });

  test("returns the input row object the argument broke", () => {
    const out = pmv_ppd_with_warnings(45, 25, 0.1, 50, 1.2, 0.5, 0, "ISO");
    const tdbRow = iso7730PmvLimits.find((row) => row.quantity.key === "tdb");
    expect(out.violations[0]).toBe(tdbRow);
    expect(out.warnings).toEqual(out.violations.map((row) => row.warning));
  });

  test("reports the derived vapour-pressure row even with limit_inputs false", () => {
    // tdb 30 is the ISO upper bound, inclusive, so no input row fires; at
    // rh 95 the derived pa is about 4030 Pa, beyond the 2700 Pa bound.
    const out = pmv_ppd_with_warnings(30, 30, 0.1, 95, 1.2, 0.5, 0, "ISO", {
      limit_inputs: false,
    });
    expect(out.violations).toEqual([iso7730VapourPressureLimit]);
    expect(out.violations[0]).toBe(iso7730VapourPressureLimit);
    expect(out.warnings).toEqual([iso7730VapourPressureLimit.warning]);
    expect(Number.isFinite(out.pmv)).toBe(true);
  });

  test("reports the output PMV row and still returns the number", () => {
    // Every argument is inside its row; the PMV they produce is not.
    const out = pmv_ppd_with_warnings(30, 40, 0.1, 50, 4, 2, 0, "ISO", {
      limit_inputs: false,
    });
    expect(out.violations).toEqual([iso7730PmvRangeLimit]);
    expect(out.pmv).toBeGreaterThan(2);
  });

  test("keeps NaN-ing gated by limit_inputs", () => {
    const out = pmv_ppd_with_warnings(30, 40, 0.1, 50, 4, 2, 0, "ISO");
    expect(out.violations).toEqual([iso7730PmvRangeLimit]);
    expect(out.pmv).toBeNaN();
  });

  test("orders input rows before the ISO-only rows", () => {
    const out = pmv_ppd_with_warnings(45, 45, 0.1, 95, 1.2, 0.5, 0, "ISO", {
      limit_inputs: false,
    });
    const roles = out.violations.map((row) => row.role);
    expect(roles.indexOf("derived")).toBeGreaterThan(roles.lastIndexOf("input"));
  });

  test("ASHRAE has no derived or output rows", () => {
    const out = pmv_ppd_with_warnings(30, 40, 0.1, 95, 4, 1.5, 0, "ASHRAE", {
      limit_inputs: false,
    });
    expect(out.violations.every((row) => row.role === "input")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/models/pmv_ppd_iso.test.js -t "violations"`
Expected: FAIL — `out.violations` is `undefined`.

- [ ] **Step 3: Implement**

In `src/models/pmv_ppd.ts`, extend the import from `../utilities/utilities.js` (lines 1-8) with `range_violations`, and extend the value import from `../reference/limits.js` (lines 11-14) with `ashrae55PmvLimits, iso7730PmvLimits`; add `import type { ApplicabilityLimit } from "../reference/limits.js";`

Replace the return type and body of `pmv_ppd_with_warnings` from line 244 (`): PmvPpdResult & {`) to the end of the function (line 345) with:

```ts
): PmvPpdResult & {
  pmv_unrounded: number;
  warnings: readonly string[];
  violations: readonly ApplicabilityLimit[];
} {
  const default_kwargs: Required<PmvPpdKwargs> = {
    units: "SI",
    limit_inputs: true,
    airspeed_control: true,
    round_output: true,
  };
  const resolved: Required<PmvPpdKwargs> = Object.assign(
    default_kwargs,
    kwargs,
  );
  validateInputs(
    {
      tdb,
      tr,
      vr,
      rh,
      met,
      clo,
      wme,
      standard,
      units: resolved.units.toUpperCase(),
      limit_inputs: resolved.limit_inputs,
      airspeed_control: resolved.airspeed_control,
      round_output: resolved.round_output,
    },
    PMV_PPD_SCHEMA,
  );

  if (resolved.units.toUpperCase() === "IP") {
    // Conversion from IP to SI units
    ({ tdb, tr, vr } = units_converter({ tdb, tr, vr }, "IP"));
  }

  // One kwargs object for both checks, so the sentences and the rows come out
  // in the same order.
  const compliance_kwargs = {
    tdb,
    tr,
    v: vr,
    met,
    clo,
    airspeed_control: resolved.airspeed_control,
  };
  const compliance_warnings = check_standard_compliance(
    standard,
    compliance_kwargs,
  );
  const compliance_violations = range_violations(
    compliance_kwargs,
    standard === "ISO" ? iso7730PmvLimits : ashrae55PmvLimits,
  );
  let ce = 0;
  if (standard === "ASHRAE") {
    //if v_r is higher than 0.1 follow methodology ASHRAE Appendix H, H3
    ce = vr > 0.1 ? cooling_effect(tdb, tr, vr, rh, met, clo, wme).ce : 0;
  }

  tdb = tdb - ce;
  tr = tr - ce;
  vr = ce > 0 ? 0.1 : vr;

  let pmv = pmv_calculation(tdb, tr, vr, rh, met, clo, wme);
  let ppd =
    100.0 -
    95.0 *
      Math.exp(-0.03353 * Math.pow(pmv, 4.0) - 0.2179 * Math.pow(pmv, 2.0));

  // ISO 7730 Clause 4 bounds two more quantities that `check_standard_compliance`
  // cannot see, because neither is an argument: the vapour pressure the model
  // derives, and the PMV it returns. Upstream checks both inline in
  // `pythermalcomfort/models/pmv_ppd_iso.py`, and only under `limit_inputs`;
  // here they are evaluated always, because a consumer that asked for numbers
  // rather than NaN still needs to know which rows the numbers broke
  // (2026-09-07). The bounds are read from the published table so there is
  // still one copy of each number. ASHRAE 55 has neither bound, so both apply
  // to ISO only.
  const iso_only_violations: ApplicabilityLimit[] = [];
  if (standard === "ISO") {
    const pa = rh * 10 * antoine(tdb);
    if (
      pa < iso7730VapourPressureLimit.min ||
      pa > iso7730VapourPressureLimit.max
    )
      iso_only_violations.push(iso7730VapourPressureLimit);
    if (!(pmv >= iso7730PmvRangeLimit.min && pmv <= iso7730PmvRangeLimit.max))
      iso_only_violations.push(iso7730PmvRangeLimit);
  }

  // Checks that inputs are within the bounds accepted by the model if not return NaN
  if (
    resolved.limit_inputs &&
    (isNaN(pmv) ||
      compliance_warnings.length > 0 ||
      iso_only_violations.length > 0)
  ) {
    pmv = NaN;
    ppd = NaN;
  }

  const violations = [...compliance_violations, ...iso_only_violations];
  const warnings = [
    ...compliance_warnings,
    ...iso_only_violations.map((row) => row.warning),
  ];

  if (resolved.round_output) {
    return {
      pmv: round(pmv, 2),
      ppd: round(ppd, 1),
      pmv_unrounded: pmv,
      warnings,
      violations,
    };
  }
  return { pmv, ppd, pmv_unrounded: pmv, warnings, violations };
}
```

Also update the JSDoc above the function (lines 219-233): after "that `pmv_ppd` computes and discards." add a paragraph:

```
 * `violations` is the same information as the rows of the published limit
 * tables rather than as sentences: input rows first, then ISO's derived
 * vapour-pressure and output PMV rows. Unlike upstream, those two are
 * evaluated whether or not `limit_inputs` is set — only the NaN-ing is gated.
 * `warnings` is `violations` spelled out, plus the one ASHRAE cross-field rule
 * that has no row.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/models tests/io.test.ts tests/baseline.test.ts tests/charts.test.ts`
Expected: PASS. `tests/io.test.ts` still passes because `PmvPpdIsoOutputs` destructures `{ warnings, pmv_unrounded, ...result }` — `violations` would leak into `result` and break the key-parity assertion at `tests/io.test.ts:86`; that is fixed in Task 5. **If Task 5 has not run yet, this parity test fails here** — that is expected; proceed to Task 5 before reporting the fork green.

- [ ] **Step 5: Commit (report only)**

Proposed message: `feat(models)!: pmv_ppd_with_warnings returns violations; ISO derived and output rows evaluated regardless of limit_inputs`

---

### Task 3: Edition default and assertion published from `pmv_ppd_iso.ts`

**Files:**
- Modify: `src/models/pmv_ppd_iso.ts:15-43`, `:94-102`
- Do **not** touch `src/models/index.ts` or `tests/index.test.js`: the constant is `@internal`.
- Test: `tests/models/pmv_ppd_iso.test.js:94-115`

**Interfaces:**
- Produces: `export const PMV_PPD_ISO_DEFAULT_EDITION: PmvPpdIsoEdition = "7730-2025"` — the one place the default is spelled. `@internal`: consumers read `pmv_ppd_iso.editions`, whose last entry is the default.
- Produces: `export function assert_pmv_ppd_iso_edition(edition: string): asserts edition is PmvPpdIsoEdition` — throws the existing message.

- [ ] **Step 1: Write the failing tests**

In `tests/models/pmv_ppd_iso.test.js`, extend the import from the `pmv_ppd_iso` module with `PMV_PPD_ISO_DEFAULT_EDITION`, and append inside `describe("pmv_ppd_iso edition", ...)`:

```js
  test("defaults to the newest published edition", () => {
    expect(pmv_ppd_iso.editions.at(-1)).toBe(PMV_PPD_ISO_DEFAULT_EDITION);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/models/pmv_ppd_iso.test.js -t "edition"`
Expected: FAIL — the two new exports are undefined.

- [ ] **Step 3: Implement**

In `src/models/pmv_ppd_iso.ts`, after `PmvPpdIsoEdition` (line 27) add:

```ts
/**
 * The edition {@link pmv_ppd_iso} applies when none is asked for: the newest,
 * as upstream. Spelled once, here; the `io` layer reads it rather than
 * repeating it. Consumers read `pmv_ppd_iso.editions` — the last entry is the
 * default.
 *
 * @internal
 */
export const PMV_PPD_ISO_DEFAULT_EDITION: PmvPpdIsoEdition = "7730-2025";

/**
 * Rejects an edition this package does not implement.
 *
 * Shared by {@link pmv_ppd_iso} and the `io` layer, which runs the kernel
 * directly for its warnings and would otherwise bypass this check.
 *
 * @internal
 */
export function assert_pmv_ppd_iso_edition(
  edition: string,
): asserts edition is PmvPpdIsoEdition {
  if (!(PMV_PPD_ISO_EDITIONS as readonly string[]).includes(edition))
    throw new Error(
      `Edition '${edition}' is not supported. Supported editions are: ${PMV_PPD_ISO_EDITIONS.join(", ")}.`,
    );
}
```

Update the `edition?` JSDoc in `PmvPpdIsoKwargs` (line 36) to say `Default {@link PMV_PPD_ISO_DEFAULT_EDITION}, as upstream.`

Replace the body of `pmv_ppd_iso` (lines 94-102) with:

```ts
  // `edition` is checked here and not forwarded: it selects which edition the
  // result is reported under, and both run the same kernel over the same
  // limits, so nothing downstream needs to see it.
  const { edition = PMV_PPD_ISO_DEFAULT_EDITION, ...rest } = kwargs;
  assert_pmv_ppd_iso_edition(edition);
  return pmv_ppd(tdb, tr, vr, rh, met, clo, wme, "ISO", rest);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/models/pmv_ppd_iso.test.js tests/index.test.js`
Expected: PASS.

- [ ] **Step 5: Commit (report only)**

Proposed message: `feat(models): publish the ISO default edition and share its assertion with io`

---

### Task 4: `PmvPpdIsoInit` / `PmvPpdIsoInputs` carry `edition`

**Files:**
- Modify: `src/io/classes_input.ts:50-66` (after `PmvPpdInit`), `:86-111` (after `PmvPpdInputs`)
- Modify: `src/io/index.ts:28-39`

**Interfaces:**
- Produces: `export interface PmvPpdIsoInit extends PmvPpdInit { edition?: PmvPpdIsoEdition | undefined }`.
- Produces: `export class PmvPpdIsoInputs extends PmvPpdInputs { readonly edition: PmvPpdIsoEdition }` — defaults to `PMV_PPD_ISO_DEFAULT_EDITION`, does not validate (the outcome does, Task 5).

- [ ] **Step 1: Implement** (no separate test: Task 5's tests exercise these through `pmvPpdIso`)

In `src/io/classes_input.ts`, add to the imports at the top:

```ts
import { PMV_PPD_ISO_DEFAULT_EDITION } from "../models/pmv_ppd_iso.js";
import type { PmvPpdIsoEdition } from "../models/pmv_ppd_iso.js";
```

After `PmvPpdInit` (after line 66) add:

```ts
/** What {@link PmvPpdIsoInputs} accepts. */
export interface PmvPpdIsoInit extends PmvPpdInit {
  /**
   * ISO 7730 edition the result is reported under. Default
   * {@link PMV_PPD_ISO_DEFAULT_EDITION}. Changes no numbers today; see
   * `PmvPpdIsoKwargs.edition`.
   */
  edition?: PmvPpdIsoEdition | undefined;
}
```

After the `PmvPpdInputs` class (after line 111) add:

```ts
/**
 * Inputs for the ISO 7730 PMV/PPD model. Adds `edition`, which only that
 * standard has; the value is defaulted here and validated when the model runs
 * (`PmvPpdIsoOutputs`), as every other argument is.
 *
 * @public
 */
export class PmvPpdIsoInputs extends PmvPpdInputs {
  readonly edition: PmvPpdIsoEdition;

  constructor(init: PmvPpdIsoInit) {
    super(init);
    this.edition = init.edition ?? PMV_PPD_ISO_DEFAULT_EDITION;
  }
}
```

Update the JSDoc of `PmvPpdInputs` (line 87-88): "Used as-is for ISO 7730; ASHRAE 55 extends it with `airspeed_control`." → "ISO 7730 extends it with `edition`, ASHRAE 55 with `airspeed_control`."

In `src/io/index.ts`, add `PmvPpdIsoInputs` to the class export list (lines 28-33) and `PmvPpdIsoInit` to the type export list (lines 34-39), each directly after the `PmvPpd…` entry it extends.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (nothing consumes the new class yet).

---

### Task 5: `Outcome.violations`, and the ISO outcome echoes `edition`

**Files:**
- Modify: `src/io/classes_return.ts:1-26` (imports), `:33-55` (`Outcome`), `:79-141` (`PmvPpdIsoOutputs`), `:143-197` (`PmvPpdAshraeOutputs`), `:375-382` (`pmvPpdIso` factory)
- Test: `tests/io.test.ts` (extend the parity harness and the `warnings` block)

**Interfaces:**
- Produces: `Outcome.violations: readonly ApplicabilityLimit[]` (required on the interface — Task 6 supplies it for the adaptive classes; until then `npm run typecheck` fails on those two classes, which is expected between Tasks 5 and 6).
- Produces: `PmvPpdIsoOutputs.edition: PmvPpdIsoEdition`; `pmvPpdIso(inputs: PmvPpdIsoInit): PmvPpdIsoOutputs`.

- [ ] **Step 1: Write the failing tests**

In `tests/io.test.ts`, add `iso7730VapourPressureLimit, iso7730PmvLimits` to the imports from the reference module (add the import in the style the file uses), then append a new describe block at the end:

```ts
describe("violations", () => {
  const inRange = { tdb: 25, tr: 25, vr: 0.1, rh: 50, met: 1.2, clo: 0.5 };

  it("is empty for an in-range run, on every outcome class", () => {
    expect(pmvPpdIso(inRange).violations).toEqual([]);
    expect(pmvPpdAshrae(inRange).violations).toEqual([]);
  });

  it("hands back the table row itself, so a consumer can read its role", () => {
    const out = pmvPpdIso({ ...inRange, tdb: 45 });
    const tdbRow = iso7730PmvLimits.find((row) => row.quantity.key === "tdb");
    expect(out.violations[0]).toBe(tdbRow);
  });

  it("reports a derived row through the wrapper, by identity", () => {
    // clo 0.3 keeps PMV inside ±2 so only the derived row fires.
    const out = pmvPpdIso({ ...inRange, tdb: 30, tr: 30, rh: 95, clo: 0.3, limit_inputs: false });
    expect(out.violations).toHaveLength(1);
    expect(out.violations[0]).toBe(iso7730VapourPressureLimit);
  });

  it("keeps warnings as the sentences of violations", () => {
    const out = pmvPpdIso({ ...inRange, tdb: 45, rh: 95, limit_inputs: false });
    expect(out.warnings).toEqual(out.violations.map((row) => row.warning));
  });
});

describe("edition", () => {
  const inputs = { tdb: 25, tr: 25, vr: 0.1, rh: 50, met: 1.2, clo: 0.5 };

  it("defaults to the newest edition and echoes it", () => {
    expect(pmvPpdIso(inputs).edition).toBe("7730-2025");
    expect(pmvPpdIso(inputs).inputs.edition).toBe("7730-2025");
  });

  it("echoes a pinned edition and changes no number", () => {
    const pinned = pmvPpdIso({ ...inputs, edition: "7730-2005" });
    expect(pinned.edition).toBe("7730-2005");
    expect(pinned.result).toEqual(pmvPpdIso(inputs).result);
  });

  it("rejects an edition the model does not implement", () => {
    expect(() =>
      pmvPpdIso({ ...inputs, edition: "7730-1994" as never }),
    ).toThrow(/7730-2005, 7730-2025/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/io.test.ts`
Expected: FAIL — `violations` undefined and `edition` undefined.

- [ ] **Step 3: Implement**

In `src/io/classes_return.ts`:

Imports: change line 5 to also import the assertion, and add the type imports:

```ts
import {
  assert_pmv_ppd_iso_edition,
  pmv_ppd_iso,
} from "../models/pmv_ppd_iso.js";
```
```ts
import type { PmvPpdIsoEdition } from "../models/pmv_ppd_iso.js";
import type { ApplicabilityLimit } from "../reference/limits.js";
```
and extend the class import from `./classes_input.js` (lines 11-15) with `PmvPpdIsoInputs`, and the type import (lines 21-25) with `PmvPpdIsoInit`.

Replace the `Outcome` interface (lines 47-55) with:

```ts
export interface Outcome<TInputs = unknown, TResult = unknown> {
  /** The inputs this result came from, defaults resolved. */
  readonly inputs: TInputs;
  /** Exactly what the model function returns for these inputs. */
  readonly result: TResult;
  /**
   * The applicability rows this run broke, as the published table's own
   * objects — so a consumer can dispatch on `role` and never compares a
   * sentence. Evaluated whether or not `limit_inputs` is set; that switch only
   * decides whether `result` is NaN. Input rows first, then any derived or
   * output rows. Empty when every row held.
   *
   * Not in upstream, which has no `io` layer and returns NaN without saying
   * which bound was crossed (2026-09-07).
   */
  readonly violations: readonly ApplicabilityLimit[];
  /**
   * `violations` as sentences, in the same order, plus the one ASHRAE
   * cross-field air-speed rule that has no row. Empty when every row held.
   */
  readonly warnings: readonly string[];
  toMeasures(): readonly Measure[];
}
```

Replace the `PmvPpdIsoOutputs` class header and constructor (lines 84-120) with:

```ts
export class PmvPpdIsoOutputs implements Outcome<PmvPpdIsoInputs, PmvPpdResult> {
  readonly inputs: PmvPpdIsoInputs;
  /** `{ pmv, ppd }`, as `pmv_ppd_iso` returns it. */
  readonly result: PmvPpdResult;
  /**
   * Thermal sensation band, e.g. `"Slightly Cool"`. `undefined` when the PMV
   * falls outside the scale — NaN included.
   */
  readonly tsv: string | undefined;
  /** The edition this result is reported under; `inputs.edition`, echoed. */
  readonly edition: PmvPpdIsoEdition;
  readonly violations: readonly ApplicabilityLimit[];
  readonly warnings: readonly string[];

  constructor(inputs: PmvPpdIsoInputs) {
    // The kernel rather than pmv_ppd_iso(): same arithmetic, same rounding,
    // but it also hands back the applicability rows the public function
    // discards. That bypasses the edition check, so it is applied here.
    assert_pmv_ppd_iso_edition(inputs.edition);
    const { warnings, violations, pmv_unrounded, ...result } =
      pmv_ppd_with_warnings(
        inputs.tdb,
        inputs.tr,
        inputs.vr,
        inputs.rh,
        inputs.met,
        inputs.clo,
        inputs.wme,
        "ISO",
        {
          units: inputs.units,
          limit_inputs: inputs.limit_inputs,
          round_output: inputs.round_output,
        },
      );
    this.inputs = inputs;
    this.result = result;
    // Classified from the returned PMV, so rounding is applied first — the
    // order pythermalcomfort uses (`mapping()` runs after `np.round`).
    this.tsv = pmv_ppd_iso.tsv.labelFor(result.pmv);
    this.edition = inputs.edition;
    this.violations = violations;
    this.warnings = warnings;
  }
```

In `PmvPpdAshraeOutputs`: add `readonly violations: readonly ApplicabilityLimit[];` above `readonly warnings` (line 168); change the destructure at line 171 to `const { warnings, violations, pmv_unrounded, ...result } =`; add `this.violations = violations;` before `this.warnings = warnings;` (line 196).

Replace the `pmvPpdIso` factory (lines 380-382) with:

```ts
export function pmvPpdIso(inputs: PmvPpdIsoInit): PmvPpdIsoOutputs {
  return new PmvPpdIsoOutputs(new PmvPpdIsoInputs(inputs));
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/io.test.ts -t "matches the model functions|violations|edition|warnings"`
Expected: PASS for the PMV classes. `npm run typecheck` still fails on `AdaptiveAshraeOutputs` / `AdaptiveEnOutputs` (missing `violations`) — Task 6 fixes that.

- [ ] **Step 5: Commit (report only, together with Task 6)**

---

### Task 6: The adaptive outcomes carry `violations`

**Files:**
- Read first: `src/models/adaptive_ashrae.ts:150-210` (`adaptive_ashrae_with_warnings`), `src/models/adaptive_en.ts` (grep `33.5`, `valid_range`, `limits`), `src/reference/limits.ts:225-250` (`ashrae55AdaptiveLimits`), `src/reference/index.ts`
- Modify: `src/reference/limits.ts` (add `en16798AdaptiveLimits`), `src/reference/index.ts` (export it), `src/models/adaptive_ashrae.ts` (`adaptive_ashrae_with_warnings` returns `violations`), `src/models/adaptive_en.ts` (read the bound from the row; attach `.limits`), `src/io/classes_return.ts:240-373` (both adaptive classes and `adaptiveEnWarnings`)
- Test: `tests/io.test.ts`, `tests/reference.test.ts`

**Interfaces:**
- Produces: `export const en16798AdaptiveLimits: readonly ApplicabilityLimit[]` — one row, `t_running_mean`, `role: "input"`, `min: 10`, `max: 33.5`, `warning: "EN running mean outdoor temperature applicability limits between 10.0 and 33.5 °C"` (byte-identical to the string at `classes_return.ts:371`; U+00B0 degree sign).
- Produces: `adaptive_ashrae_with_warnings(...)` returns its existing fields plus `violations: readonly ApplicabilityLimit[]` from `range_violations(kwargs, ashrae55AdaptiveLimits)` in the same kwargs order its warnings use.
- Produces: `AdaptiveAshraeOutputs.violations`, `AdaptiveEnOutputs.violations`; `warnings` on both equal `violations.map((row) => row.warning)`.

- [ ] **Step 1: Write the failing tests**

Append to the `violations` describe in `tests/io.test.ts` (import `ashrae55AdaptiveLimits, en16798AdaptiveLimits` from the reference module):

```ts
  it("adaptive models return their running-mean row", () => {
    const outside = { tdb: 25, tr: 25, t_running_mean: 9, v: 0.1 };
    const ashraeRow = ashrae55AdaptiveLimits.find(
      (row) => row.quantity.key === "t_running_mean",
    );
    expect(adaptiveAshrae(outside).violations[0]).toBe(ashraeRow);
    expect(adaptiveEn(outside).violations).toEqual(en16798AdaptiveLimits);
    expect(adaptiveEn(outside).warnings).toEqual(
      en16798AdaptiveLimits.map((row) => row.warning),
    );
    expect(adaptiveEn({ ...outside, t_running_mean: 20 }).violations).toEqual([]);
  });
```

Add to `tests/reference.test.ts` (inside whatever describe covers the limit tables; match its style):

```ts
  it("publishes EN 16798-1's adaptive applicability as one input row", () => {
    expect(en16798AdaptiveLimits).toHaveLength(1);
    expect(en16798AdaptiveLimits[0]).toMatchObject({
      role: "input",
      min: 10,
      max: 33.5,
    });
    expect(en16798AdaptiveLimits[0]!.quantity).toBe(quantities.t_running_mean);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/io.test.ts tests/reference.test.ts -t "adaptive|EN 16798"`
Expected: FAIL — `en16798AdaptiveLimits` is not exported.

- [ ] **Step 3: Implement**

`src/reference/limits.ts`, after `ashrae55AdaptiveLimits`:

```ts
/**
 * EN 16798-1 applicability limits for the adaptive model: the running mean
 * outdoor temperature alone.
 *
 * Source, not mirror: `adaptive_en` reads this row for its bound and the `io`
 * layer reads it for the sentence, so the number and the message have one
 * home. The wording keeps the U+00B0 degree sign the sentence has always had.
 *
 * @public
 */
export const en16798AdaptiveLimits: readonly ApplicabilityLimit[] = [
  {
    quantity: quantities.t_running_mean,
    role: "input",
    min: 10,
    max: 33.5,
    warning:
      "EN running mean outdoor temperature applicability limits between 10.0 and 33.5 °C",
  },
];
```

`src/reference/index.ts`: export `en16798AdaptiveLimits` beside `ashrae55AdaptiveLimits`.

`src/models/adaptive_en.ts`: find the inline bound on `t_running_mean` (grep `33.5`). Replace the two literals with reads from the row — e.g. `const [runningMeanLimit] = en16798AdaptiveLimits;` then `valid_range(t_running_mean, [runningMeanLimit.min, runningMeanLimit.max])` in whatever shape the existing call has; keep the surrounding logic. If the function carries metadata like `adaptive_ashrae` does (`.label`, `.standard`), attach `adaptive_en.limits = en16798AdaptiveLimits;` beside them with the same one-line JSDoc `adaptive_ashrae` uses for `.limits`.

`src/models/adaptive_ashrae.ts`: in `adaptive_ashrae_with_warnings`, wherever `warnings` are assembled, assemble `violations` from the same kwargs with `range_violations(kwargs, ashrae55AdaptiveLimits)` (import both; `range_violations` from `../utilities/utilities.js`) and add `violations` to the returned object and its return type. If the running-mean check there is currently an inline comparison producing a pushed sentence rather than a `range_violations` call, route it through `range_violations` with `{ t_running_mean }` so the row comes back by identity; the sentence must stay byte-identical (it is pinned).

`src/io/classes_return.ts`: in `AdaptiveAshraeOutputs`, add `readonly violations: readonly ApplicabilityLimit[];`, destructure `violations` from `adaptive_ashrae_with_warnings`, assign it. Replace `adaptiveEnWarnings` (lines 353-373) with:

```ts
/**
 * ponytail: re-evaluates the row `adaptive_en` also checks, gated differently
 * (the model only under `limit_inputs`, this always); fold into an
 * `adaptive_en_with_warnings` the moment a second consumer needs the rows.
 */
function adaptiveEnViolations(
  inputs: AdaptiveInputs,
): readonly ApplicabilityLimit[] {
  const t_running_mean =
    inputs.units === "IP"
      ? units_converter({ t_running_mean: inputs.t_running_mean })
          .t_running_mean
      : inputs.t_running_mean;
  return range_violations({ t_running_mean }, en16798AdaptiveLimits);
}
```
and in `AdaptiveEnOutputs` set `this.violations = adaptiveEnViolations(inputs); this.warnings = this.violations.map((row) => row.warning);` (add the `readonly violations` field). Import `range_violations` and `en16798AdaptiveLimits`.

- [ ] **Step 4: Run the whole fork suite**

Run: `npm run typecheck && npm test`
Expected: PASS, 633 + the new tests. If `tests/reference.test.ts` or `tests/index.test.js` pins export lists, add `en16798AdaptiveLimits` (and, if you attached it, `adaptive_en.limits`) to the expected lists.

- [ ] **Step 5: Commit (report only)**

Proposed message: `feat(io)!: every Outcome carries violations; ISO outcomes accept and echo edition`

---

### Task 7: Fork done criteria and build

**Files:** none new.

- [ ] **Step 1: Lint and format**

Run: `npm run lint && npm run check:format`
If `check:format` fails: `npm run format`, then re-run both.

- [ ] **Step 2: Build**

Run: `npm run build && npm run check:exports`
Expected: PASS; `lib/esm/io/classes_return.js` contains `this.violations`, `lib/esm/types/io/classes_input.d.ts` contains `PmvPpdIsoInit`.

- [ ] **Step 3: Report**

Report `git status --short` and `git diff --stat` for the fork, and the three proposed commit messages from Tasks 1-2, 3, 5-6 (one commit per group is fine; the user decides). Do not run git.

---

## Part B — App (`comfort-tool`, branch `rewrite/v1`)

Precondition: Part A built (`lib/esm/` fresh). Verify with `ls -la node_modules/jsthermalcomfort/lib/esm/io/classes_return.js` and `grep -c violations` on it (> 0).

Task 8 (`core/applicability.ts`) was cut on 2026-09-07 after the ponytail review: two one-line filters with one caller each are inlined as `$derived` in Task 11. The remaining tasks keep their numbers, so Part B starts at Task 9.

### Task 9: `pmvIso.ts` pins the edition; `RegisteredModel.edition`

**Files:**
- Modify: `src/core/modelDeclaration.ts:107-128` (`RegisteredModel`)
- Modify: `src/models/pmvIso.ts`
- Test: `src/core/libraryInputs.test.ts` (append a describe)

**Interfaces:**
- Produces: `RegisteredModel.edition?: string` — "The edition of the standard `run` pins, named beside the results. The declaration passes the same constant to `run`, so the two cannot differ."
- Produces: `pmvIso.edition === "7730-2005"`; `pmvIso.run(init)` returns a `PmvPpdIsoOutputs` whose `.edition` is `"7730-2005"`.

- [ ] **Step 1: Write the failing test**

Append to `src/core/libraryInputs.test.ts` (add `import type { PmvPpdIsoOutputs } from "jsthermalcomfort/io";`):

```ts
describe("edition", () => {
  it("pins ISO 7730:2005 and the library echoes it", () => {
    expect(pmvIso.edition).toBe("7730-2005");
    const outcome = pmvIso.run(toLibraryInputs(separateSlot(), pmvIso)) as PmvPpdIsoOutputs;
    expect(outcome.edition).toBe(pmvIso.edition);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/libraryInputs.test.ts -t edition`
Expected: FAIL — `pmvIso.edition` undefined (and `svelte-check` would reject the property).

- [ ] **Step 3: Implement**

`src/core/modelDeclaration.ts`, inside `RegisteredModel` after `readonly model: LibraryModel;` (line 110):

```ts
  /**
   * The edition of the standard `run` pins, named beside the results. Absent
   * when the library offers none. The declaration passes the same constant to
   * `run`, so the label and the call cannot disagree (rewrite plan, Phase 3.6
   * item 3: pinned, never offered as an option while editions share a kernel).
   */
  readonly edition?: string;
```

`src/models/pmvIso.ts`: change the import to `import { io, pmv_ppd_iso } from "jsthermalcomfort"; import type { PmvPpdIsoEdition, PmvPpdIsoInit } from "jsthermalcomfort";` (if `PmvPpdIsoEdition` is not re-exported from the root, import it from `"jsthermalcomfort/models"` — allowed in `src/models/`). Then above `export const pmvIso`:

```ts
// 7730-2005, not the library's 2025 default: rewrite plan, Phase 3.6 item 3.
const ISO_EDITION: PmvPpdIsoEdition = "7730-2005";
```

and in the declaration replace `run: io.pmvPpdIso,` with:

```ts
  run: (init: PmvPpdIsoInit) => io.pmvPpdIso({ ...init, edition: ISO_EDITION }),
  edition: ISO_EDITION,
```

- [ ] **Step 4: Run the tests and the checks**

Run: `npx vitest run src/core && npm run check && npm run lint`
Expected: PASS. The existing `toLibraryInputs` test at line 48-54 still lists exactly eight keys (the app's init does not carry `edition`; `run` adds it).

- [ ] **Step 5: Commit (report only)**

Proposed message: `feat(models): pin ISO 7730:2005 in the PMV declaration`

---

### Task 10: `Outputs.violations` and the retired gate comment

**Files:**
- Modify: `src/state/compute.svelte.ts:12-22`, `:47-61`
- Modify: `src/core/libraryInputs.ts:53-65`, `:87-104`
- Test: `src/core/libraryInputs.test.ts` (append to `outOfRangeInputs` describe)

**Interfaces:**
- Produces: `Outputs.violations: readonly ApplicabilityLimit[]` (`$state.raw`, default `[]`) — the rows the last **run** broke. Not touched when the gate blocks a run, so it stays paired with `perSlot[0]`.

- [ ] **Step 1: Write the failing test** (core-level: proves the gate lets a derived violation through to the run)

Append inside `describe("outOfRangeInputs", ...)` in `src/core/libraryInputs.test.ts`:

```ts
  it("lets a derived violation through the gate", () => {
    // tdb at the ISO bound, rh 95: no entered value breaks a row; the derived vapour pressure does (Task 5 pins that).
    const slot = separateSlot({ tdb: 30, tr: 30 });
    const humid: SlotInputs = { ...slot, humidity: { mode: humidityMode.rh, value: 95 } };
    expect(outOfRangeInputs(humid, pmvIso)).toEqual([]);
  });
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/core/libraryInputs.test.ts -t "derived violation"`
Expected: PASS already (the library does this since Part A). It is a regression pin, not a red step; keep it.

- [ ] **Step 3: Implement the state field**

`src/state/compute.svelte.ts`: add `import type { ApplicabilityLimit } from "jsthermalcomfort/reference";` and, in `Outputs`, after `outOfRange` (line 19):

```ts
  /**
   * Applicability rows the last run broke (`Outcome.violations`), kept with
   * the result they describe: not touched while the gate blocks a run.
   */
  violations = $state.raw<readonly ApplicabilityLimit[]>([]);
```

In `observeSession`, replace line 56 (`const measures = model.run(...).toMeasures();`) with:

```ts
    const outcome = model.run(toLibraryInputs(slot, model));
    const measures = outcome.toMeasures();
    outputs.violations = outcome.violations;
```

- [ ] **Step 4: Retire the gate's `ponytail` comment**

`src/core/libraryInputs.ts`: replace the comment at lines 61-63 with:

```ts
  // `limit_inputs: false`: the app gates entered values against `model.limits`
  // before calling, and the library then always returns numbers rather than
  // NaN — the behaviour of the deployed CBE tool. The rows a run still breaks
  // (derived, output, or `vr` while `v` is in range) come back on
  // `Outcome.violations` and are reported, not gated (the input panel and the
  // result table filter them by `role`).
```

and the comment at lines 96-97 (`// ponytail: …`) with:

```ts
  // `vr = v + 0.3(met − 1)` can break its row while `v` is within its own; that
  // is an input row on `Outcome.violations`, reported beside the inputs.
```

- [ ] **Step 5: Run checks**

Run: `npm test && npm run check && npm run lint`
Expected: PASS. `compute.svelte.ts` still carries exactly one `eslint-disable` (the recorded exemption); the new assignment sits inside it.

- [ ] **Step 6: Commit (report only)**

Proposed message: `feat(state): keep the last run's violations beside its result`

---

### Task 11: Show it — hint line, result caveat, edition caption

**Files:**
- Modify: `src/text/copy.ts`
- Modify: `src/ui/inputs/InputPanel.svelte`
- Modify: `src/ui/outputs/ResultTable.svelte`
- Modify: `src/routes/StandardPage.svelte:78-95`

**Interfaces:**
- Consumes: `Outputs.violations` (Task 10); `RegisteredModel.edition` (Task 9).
- `InputPanel` prop `violations: readonly ApplicabilityLimit[]`; `ResultTable` prop `violations: readonly ApplicabilityLimit[]`.

- [ ] **Step 1: Copy**

`src/text/copy.ts`: add after `outOfRange`:

```ts
  applicabilityHint: "Outside the standard's applicability:",
  edition: (edition: string): string => `Edition ${edition}`,
```

- [ ] **Step 2: InputPanel**

`src/ui/inputs/InputPanel.svelte`:
- imports: add `import type { ApplicabilityLimit } from "jsthermalcomfort/reference";`
- `Props`: add `violations: readonly ApplicabilityLimit[];` and destructure it.
- after `const rows = …`:

```
// Everything but the result's own bound. Entered values are gated before the call, so an
// `input` row here is a quantity the panel never showed — `vr`, derived from `v` and `met`.
const reported = $derived(violations.filter((limit) => limit.role !== "output"));
```

- after the `{#each rows …}{/each}` block, inside the `<Stack>`:

```svelte
  {#if reported.length > 0}
    <Stack gap="1">
      <span class="hint">{copy.applicabilityHint}</span>
      {#each reported as limit (limit)}
        <span class="hint">{limit.warning}</span>
      {/each}
    </Stack>
  {/if}
```
- add a `<style>` block:

```svelte
<style>
  .hint {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
</style>
```

- [ ] **Step 3: ResultTable**

`src/ui/outputs/ResultTable.svelte`:
- imports: add `import type { ApplicabilityLimit } from "jsthermalcomfort/reference";`
- `Props`: add `violations: readonly ApplicabilityLimit[];` and destructure it.
- after `classified`: `const caveats = $derived(violations.filter((limit) => limit.role === "output"));` and change `hasCompliance` to `$derived(classified.length > 0 || caveats.length > 0)`.
- update the comment above `classified` (lines 22-24) to add: `// An output-role violation also opens the column: a PMV of 2.4 is shown, with the row it broke as its caveat.`
- inside the compliance `<Table.Cell>` after the `{#each classified …}{/each}` block:

```svelte
            {#each caveats as limit (limit)}
              <span class="band caveat">{limit.warning}</span>
            {/each}
```
- replace the caption block (lines 86-88) with:

```svelte
    {#if outOfRange || model.edition}
      <Table.Caption>
        {#if outOfRange}{copy.outOfRange}{/if}
        {#if model.edition}<span class="edition">{copy.edition(model.edition)}</span>{/if}
      </Table.Caption>
    {/if}
```
- styles: add

```css
  .caveat {
    color: var(--muted-foreground);
    font-size: 0.75rem;
  }

  .edition {
    margin-left: 0.75em;
  }
```

- [ ] **Step 4: StandardPage wiring**

`src/routes/StandardPage.svelte`: pass `violations={outputs.violations}` to both `<InputPanel …>` (after `outOfRange={outputs.outOfRange}`) and `<ResultTable …>` (after `outOfRange={outputs.outOfRange.length > 0}`).

- [ ] **Step 5: Autofixer, checks, manual look**

Run the two changed `.svelte` files through `svelte-autofixer` (Svelte MCP). Then:

Run: `npm test && npm run check && npm run lint && npm run build`
Expected: PASS.

Then `npm run dev`, open the PMV (ISO 7730) page, and check three states, reporting what you see:
1. Defaults: no hint line; caption reads `Edition 7730-2005`.
2. `tdb` 30, `tr` 30, `rh` 95: inputs stay black, result stays a number, hint line shows the vapour-pressure sentence.
3. `tdb` 30, `tr` 40, `met` 4, `clo` 2: PMV above 2 is shown; Compliance cell shows the band and the sentence `ISO PMV applicability limits between -2 and 2`.

- [ ] **Step 6: Commit (report only)**

Proposed message: `feat(ui): report derived and output applicability rows; name the pinned edition`

---

### Task 12: Docs and checklist

**Files:**
- Modify: `docs/rewrite-plan.md` (Phase 3.6 items 3 and 4), `docs/adr-0001-architecture.md` §4.1.3 `warnings` bullet
- Modify (gitignored mirrors, same session): `local-docs/REWRITE-PLAN.md`, `local-docs/adr-0001-architecture.md`
- Read: `docs/code-quality-checklist.md` against the whole app diff

- [ ] **Step 1: Record what landed**

`docs/rewrite-plan.md`: at the end of Phase 3.6 item 3 append `Landed 2026-09-0X (fork `<hash>`, app `<hash>`): the edition half — `RegisteredModel.edition`, the pin, the caption. `OptionSpec` itself is still open.` and at the end of item 4 append `Landed 2026-09-0X: `Outputs.violations`, the hint line and the caveat; the fork's `range_violations`, `Outcome.violations` on all four outcomes, `en16798AdaptiveLimits`.` (fill the date and hashes from the user's commits; if not yet committed, write `uncommitted` and say so in the report).

`docs/adr-0001-architecture.md` §4.1.3, the `violations` bullet: after "`warnings` is derived from it and keeps its byte-pinned strings." add "(plus the one ASHRAE cross-field air-speed rule, which has no row)". Also note in §4.1.2's reference-data bullet that `en16798AdaptiveLimits` now exists as the source for `adaptive_en`'s bound.

Mirror each of those edits, section by section, in `local-docs/REWRITE-PLAN.md` and `local-docs/adr-0001-architecture.md` (Chinese; keep their own wording style — e.g. 「已落地 2026-09-0X」, 「外加 ASHRAE 那条没有对应行的跨字段风速规则」).

- [ ] **Step 2: Checklist**

Read `docs/code-quality-checklist.md` and walk its human half against `git diff ae1c079 -- src/`. Report each item as pass / fail / n.a. with a one-line reason.

- [ ] **Step 3: Final verification**

Fork: `npm run typecheck && npm test && npm run lint && npm run check:format && npm run build`.
App: `npm test && npm run check && npm run lint && npm run build`.
Report both outputs' last lines verbatim, `git status --short` for both repos, and the proposed commit messages. Do not run git.

---

## Self-review

- **Spec coverage.** Item 4 (three kinds): library evaluates all rows always (Task 2), typed rows (Tasks 1, 5, 6), state (Task 10), hint line + caveat (Task 11), `ponytail` retired (Task 10). Task 8 was removed on 2026-09-07 (ponytail review); Task 11 inlines the two filters. Item 3's edition half: L2 (Tasks 3-5), pin (Task 9), caption (Task 11). ADR §3 row and §4.1.3 code block match the produced API (`.violations`, `.warnings`, `.edition`, `edition` on the init). Out of scope, deliberately: `OptionSpec` toggle, `entryGroups`, humidity modes, presets, model dropdown, visual tokens — separate plans.
- **Type consistency.** `range_violations(kwargs, limits)` (Task 1) is used with that argument order in Tasks 2 and 6. `PmvPpdIsoInit` / `PmvPpdIsoInputs` / `PmvPpdIsoEdition` / `PMV_PPD_ISO_DEFAULT_EDITION` / `assert_pmv_ppd_iso_edition` are spelled identically in Tasks 3, 4, 5, 9. `Outputs.violations` (Task 10) feeds `violations` props (Task 11).
- **Known uncertainty.** Task 6 was written without the adaptive model sources in front of me; its Step 3 tells the implementer what to read first and what the result must satisfy, and its tests are exact. If `adaptive_en` turns out to have no metadata to hang `.limits` on, skip that one line and say so.
