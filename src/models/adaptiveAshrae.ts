import { adaptive_ashrae, ADAPTIVE_ASHRAE_INFO, Standard } from "jsthermalcomfort";
import { chartType } from "$lib/core/chartType";
import { requireValue } from "$lib/core/libraryInputs";
import type { RegisteredModel, ZonePolygon } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";
import { adaptive_ashrae_zone, type AdaptiveAshraeBand } from "$lib/temporary-library/adaptive_ashrae_zone";

const q = quantities;

// The one version `adaptive_ashrae` implements.
const ASHRAE_EDITION = Standard.ashrae_55_2023;

/** One band of the temporary library's SI geometry, split onto the chart's two axes. */
function toZonePolygon(band: AdaptiveAshraeBand, label: string): ZonePolygon {
  return {
    label,
    x: band.polygon.map((point) => point.t_running_mean),
    y: band.polygon.map((point) => point.operative_tmp),
  };
}

export const adaptiveAshrae = {
  info: ADAPTIVE_ASHRAE_INFO,
  standard: ASHRAE_EDITION,
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
  options: [],
  // `adaptive_ashrae` takes the entered air speed, `v`, not a relative one.
  relativeAirSpeed: false,
  // The deployed tool's extents, for the two axes the chart is locked on. No
  // other quantity carries an axis, so none declares a range.
  axisRanges: [
    { quantity: q.t_running_mean, min: 10, max: 33.5 },
    { quantity: q.operative_tmp, min: 14, max: 35 },
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
    // Locked on running mean × operative temperature. The marker sits at the
    // library's air-speed-weighted `t_o` of dry-bulb and mean radiant under
    // separate entry (`libraryInputs.operativeTemperatureOf`), where the run's
    // two answers are read, and not at the plain mean the deployed tool puts
    // it at.
    //
    // The bands step where the deployed tool steps them: each upper edge once
    // its own base line reaches 25 °C, whatever was entered. The run's upper
    // limits are shifted where the library shifts them: when its `t_o` of the
    // entered temperatures, the air-speed-weighted one the answers are read
    // at, is 25 °C or more. So at an air speed of 0.6 m/s or
    // more the table's upper limits and the chart's upper edge above the
    // marker can differ by the cooling effect; each follows its own source.
    {
      type: chartType.dynamic,
      axes: { x: q.t_running_mean, y: q.operative_tmp },
      zones: ({ values, xRange }) => {
        const zone = adaptive_ashrae_zone({ v: requireValue(values, q.v), t_running_mean_range: [xRange.min, xRange.max] });
        return [
          toZonePolygon(zone.acceptability_80, q.acceptability_80.label),
          toZonePolygon(zone.acceptability_90, q.acceptability_90.label),
        ];
      },
    },
  ],
} satisfies RegisteredModel;
