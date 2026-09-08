# Entry groups and the four humidity entry modes

Phase 3.6 items 1 and 2 of [docs/rewrite-plan.md](../../rewrite-plan.md). Decisions 1–6 taken 2026-09-08 and
recorded in the ADR and the plan; this document is the design that follows from them.

## Goal

The input panel lets the user enter humidity as relative humidity, humidity ratio, dew-point temperature,
wet-bulb temperature or water vapour partial pressure, and a model that takes no humidity (Adaptive) never
receives `rh`. The app writes no formula: every conversion is a library call.

## Decisions this design rests on

| # | Decision | Where recorded |
|---|----------|----------------|
| 3 | No `entryGroups` field. Humidity group ⇔ `inputs` names `q.rh`; temperature group ⇔ `inputs` names `q.tdb` and `q.tr` | ADR §4.2 / §4.3, plan 3.6 item 1 |
| 4 | `p_atm` omitted; library default 101325 Pa until "Set pressure" brings `environment` | plan 3.6 item 2 |
| 5 | SI pressure display unit is kPa, `fromSi = /1000`; library `p_vap` / `p_atm` are Pa | plan 3.6 item 2 |
| 6 | Mode switch converts the current value, lossy and one-way, as temperature does | this document |

## Design

### `core/modelDeclaration.ts` — group predicates

Two plain functions beside `limitFor`, no new `RegisteredModel` field:

```ts
export function hasHumidityGroup(model: RegisteredModel): boolean;     // inputs name q.rh
export function hasTemperatureGroup(model: RegisteredModel): boolean;  // inputs name q.tdb and q.tr
```

### `core/entryModes.ts` — the five humidity modes carry their own conversions

`HumidityMode` grows two plain functions so that no caller switches on mode identity:

```ts
export interface HumidityMode {
  readonly id: string;
  readonly quantity: Quantity;
  /** The entered value as relative humidity, at this dry-bulb temperature. */
  readonly toRelativeHumidity: (value: number, tdb: number) => number;
  /** Relative humidity expressed in this mode, at this dry-bulb temperature. */
  readonly fromRelativeHumidity: (rh: number, tdb: number) => number;
}

export const humidityMode = {
  rh:             { id: "relative-humidity", quantity: q.rh,            toRelativeHumidity: (rh) => rh,                         fromRelativeHumidity: (rh) => rh },
  humidityRatio:  { id: "humidity-ratio",    quantity: q.hr,            toRelativeHumidity: (hr, tdb) => hr_to_rh(hr, tdb),     fromRelativeHumidity: (rh, tdb) => psy_ta_rh(tdb, rh).hr },
  dewPoint:       { id: "dew-point",         quantity: q.dew_point_tmp, toRelativeHumidity: rh_from_dew_point,                  fromRelativeHumidity: (rh, tdb) => psy_ta_rh(tdb, rh).dew_point_tmp },
  wetBulb:        { id: "wet-bulb",          quantity: q.wet_bulb_tmp,  toRelativeHumidity: rh_from_wet_bulb,                   fromRelativeHumidity: (rh, tdb) => psy_ta_rh(tdb, rh).wet_bulb_tmp },
  vapourPressure: { id: "vapour-pressure",   quantity: q.p_vap,         toRelativeHumidity: rh_from_vapour_pressure,            fromRelativeHumidity: (rh, tdb) => psy_ta_rh(tdb, rh).p_vap },
} as const satisfies Record<string, HumidityMode>;
```

All from `jsthermalcomfort/psychrometrics`, all SI, `p_atm` defaulted (decision 4). The library's inverses already
clamp to [0, 100]. Object order is the panel's button order. Quantity keys are the fork's (`dew_point_tmp`,
`wet_bulb_tmp`), not the plan's earlier `t_dp` / `t_wb`.

### `core/libraryInputs.ts` — resolution reads the groups

The entry representation is the panel's business; the dynamic chart keeps sweeping the library's `rh`, so an
`rh` axis works in every humidity mode and a swept `tdb` keeps the entered dew point (ADR §4.5).

- New `relativeHumidityOf(slot): number` — `slot.humidity.mode.toRelativeHumidity(value, tdb)` with `tdb` from
  `values.get(q.tdb) ?? values.get(q.operative_tmp)`. The one place the conversion is invoked on a slot.
- `resolveQuantities`: the operative expansion runs only when `hasTemperatureGroup(model)`; `rh` is set only when
  `hasHumidityGroup(model)`, to `relativeHumidityOf(slot)`.
- `enteredQuantities(model, mode)`: unchanged — it is what the chart offers as axes, and the `rh` row stays `rh`.
- `enteredValue(slot, quantity)`: for `slot.humidity.mode.quantity` the entered value, as today; for `q.rh` under
  another mode, `relativeHumidityOf(slot)`, so the chart marker lands where the sweep runs.
- `withEnteredValues`: an override of `q.rh` replaces `humidity` with `{ mode: humidityMode.rh, value }` whatever
  the current mode; other overrides as today.
- `outOfRangeInputs`, `enteredRange`: unchanged. A consequence worth naming: ISO's `p_vap ≤ 2700 Pa` row now
  gates a directly entered vapour pressure like any entered value (entered → correctable, blocks the call), and no
  row constrains the other four entries.

### `state/session.svelte.ts` — the mode switch

```ts
setHumidityMode(mode: HumidityMode): void   // no-op when unchanged
```

`tdb` is `values.get(q.tdb) ?? require(q.operative_tmp)`; `rh = current.mode.toRelativeHumidity(current.value, tdb)`;
the new value is `mode.fromRelativeHumidity(rh, tdb)`. Replaces `humidity` wholesale (`$state.raw`). The
constructor is unchanged: it already routes `q.rh`'s default through `setHumidityValue`.

### `core/units.ts` — pressure

`pressure.si` becomes `{ symbol: "kPa", step: 0.1, toSi: (kPa) => kPa * 1000, fromSi: (Pa) => Pa / 1000 }`; the
inHg pair converts from Pa accordingly (one constant, `PASCALS_PER_INCH_OF_MERCURY`). `humidityRatio` and
`temperature` already exist, so the two temperature-kind modes and `hr` need nothing.

### `ui/inputs/InputPanel.svelte` — two mode rows

- The temperature row renders only when `hasTemperatureGroup(model)`; a humidity row of the same shape renders
  only when `hasHumidityGroup(model)`, one button per `Object.values(humidityMode)`, label `mode.quantity.label`.
- `rows` is `enteredQuantities(model, mode)` with the `q.rh` row swapped for `inputSlot.humidity.mode.quantity`,
  a one-line map in the `$derived`. `commit` is unchanged.
- New copy: `humidityInput: "Humidity input"`. Nothing else — mode names are quantity labels.
- A `select` primitive replaces the button row when Phase 3.6's third block ships it; not in scope here.

### Out of scope

`axisRanges` for the four new quantities (they cannot carry a dynamic-chart axis, like today's rule for any
undeclared quantity); share links (Phase 5); `environment` (decision 4); the SI-only warning sentence under IP
display (3.6 item 7).

## Testing

- `core/entryModes.test.ts` (new): for each mode, `fromRelativeHumidity` then `toRelativeHumidity` at
  (tdb 25, rh 50) returns 50 within the bound the fork's `tests/psychrometrics.test.ts` documents for `p_sat`'s
  rounding; `rh` mode is exact.
- `core/libraryInputs.test.ts`: a dew-point slot produces the same `init.rh` as the rh slot; a model declared
  without `q.rh` yields an init with no `rh` key; a model without `q.tdb` / `q.tr` under operative mode gets no
  `tdb` / `tr` written; `enteredValue(slot, q.rh)` under dew-point mode equals the converted rh; `withEnteredValues`
  with an `rh` override under dew-point mode yields an rh-mode slot.
- `core/units.test.ts`: 2700 Pa displays as 2.7 kPa and round-trips.
- Panel behaviour is verified in the browser at the end (Chrome DevTools MCP): switch modes, watch the value
  convert, confirm PMV unchanged to two decimals.

## Done

`npm test`, `npm run check`, `npm run lint`, `npm run build` green; `svelte-autofixer` clean on the panel; the
CLAUDE.md layout unchanged (no new directory, one new test file).
