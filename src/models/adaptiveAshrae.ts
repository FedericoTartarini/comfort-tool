import { adaptive_ashrae, ADAPTIVE_ASHRAE_INFO, Standard } from "jsthermalcomfort";
import { chartType } from "$lib/core/chartType";
import type { RegisteredModel, ZoneLimits } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";
import { adaptive_ashrae_zone, type AdaptiveAshraeBand, type AdaptivePoint } from "$lib/temporary-library/adaptive_ashrae_zone";

const q = quantities;

/** A point of the temporary library's SI geometry on the chart's two axes. */
function toAxes(point: AdaptivePoint): { x: number; y: number } {
  return { x: point.t_running_mean, y: point.operative_tmp };
}

/** One band of the temporary library's SI geometry as its two limit lines on the chart's axes. */
function toZoneLimits(band: AdaptiveAshraeBand, label: string): ZoneLimits {
  return { label, lower: band.lower_limit.map(toAxes), upper: band.upper_limit.map(toAxes) };
}

export const adaptiveAshrae = {
  info: ADAPTIVE_ASHRAE_INFO,
  // The one version `adaptive_ashrae` implements.
  standard: Standard.ashrae_55_2023,
  // After the quantities, the app's fixed policy: `limit_inputs: false`, since
  // the app gates entered values itself and reads the rows the run breaks off
  // `warnings`; `round_output: false`, since the library rounds `tmp_cmf`
  // before deriving the limits and the answers from it, and the display
  // rounds. No `units`: the library's default is SI, and so is the boundary
  // (ADR-0002 decision 1). The function takes no `standard`.
  run: (values) =>
    adaptive_ashrae({
      tdb: values.tdb,
      tr: values.tr,
      t_running_mean: values.t_running_mean,
      v: values.v,
      limit_inputs: false,
      round_output: false,
    }),
  // The deployed CBE tool's order and defaults. No humidity: the model takes none.
  inputs: [
    { quantity: q.tdb, value: 25 },
    { quantity: q.tr, value: 25 },
    { quantity: q.t_running_mean, value: 25 },
    { quantity: q.v, value: 0.3 },
  ],
  // Demonstration ranges, each at least as wide as what may be entered: the
  // operative temperature over the 10–40 °C `tdb` and `tr` are entered within.
  // The running mean's axis is its applicability, which an undeclared quantity
  // falls back to (ADR-0002 decision 5). No other quantity carries an axis.
  axisRanges: [
    { quantity: q.operative_tmp, min: 10, max: 40 },
  ],
  // The library's outputs, in its order. The two acceptabilities are the
  // reading, as Yes or No: the compliance column appears only for a classified
  // output or a broken output row, and Adaptive has neither, so there is no
  // compliance line (Phase 4b spec, Out of Scope).
  table: [
    q.tmp_cmf,
    q.tmp_cmf_80_low,
    q.tmp_cmf_80_up,
    q.tmp_cmf_90_low,
    q.tmp_cmf_90_up,
    q.acceptability_80,
    q.acceptability_90,
  ],
  charts: [
    // On running mean × operative temperature in every entry mode. The marker
    // sits at the library's air-speed-weighted `t_o` of dry-bulb and mean
    // radiant under separate entry (`slot.operativeTemperatureOf`), where the
    // run's two answers are read, and not at the plain mean the deployed tool
    // puts it at.
    //
    // The bands follow the library: each is the region where
    // `adaptive_ashrae` answers its acceptability true, whose upper limit is
    // shifted by the cooling effect wherever the operative temperature is
    // 25 °C or more. So at 0.6 m/s or more a band also holds the strip from
    // 25 °C up to its shifted limit where its base limit lies below 25 °C,
    // and a marker the table answers Yes for is inside its band. The deployed
    // tool steps each upper limit where its own base line reaches 25 °C
    // instead, and leaves that strip out (`comfort_tool` PR #90, `163abcd`,
    // `static/js/comfort-models.js`).
    {
      type: chartType.adaptive,
      axes: { x: q.t_running_mean, y: q.operative_tmp },
      limits: ({ values, xRange }) => {
        const zone = adaptive_ashrae_zone({ v: values.v, t_running_mean_range: [xRange.min, xRange.max] });
        return [
          toZoneLimits(zone.acceptability_80, q.acceptability_80.label),
          toZoneLimits(zone.acceptability_90, q.acceptability_90.label),
        ];
      },
    },
  ],
} satisfies RegisteredModel;
