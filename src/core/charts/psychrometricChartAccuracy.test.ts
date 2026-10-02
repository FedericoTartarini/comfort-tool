/**
 * ADR-0001 acceptance criterion 3 as ADR-0002 decision 61 splits it, one test
 * per kind of error. 3a, rendering: the psychrometric chart's contour of a
 * Comfort zone sits where the library's own number crosses the zone's limit.
 * 3b, oracle: the same contour, of the model of the deployed tool's standard
 * at the deployed tool's inputs, sits on the deployed tool's own vertices
 * (`chart-online.json`, the deployed tool's record).
 */
import { describe, expect, it } from "vitest";
import { hr_to_rh } from "jsthermalcomfort";
import { enteredSlotFor } from "$lib/core/declarationTestSlots";
import { psychrometricChartOf, requireScan, type RegisteredModel } from "$lib/core/modelDeclaration";
import { resultNumber, runOn } from "$lib/core/modelRun";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "$lib/core/quantities";
import { withEnteredValues, type Slot } from "$lib/core/slot";
import { displayUnitFor } from "$lib/core/units";
import { unitSystem } from "$lib/core/unitSystem";
import { registeredModels } from "$lib/models";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import record from "$lib/temporary-library/chart-online.json" with { type: "json" };
import type { ContourZoneTrace } from "./chartSpec";
import { chartRequestFor } from "./chartTestRequests";
import { psychrometricSpec } from "./psychrometricChart";

const q = quantities;
const p = DEFAULT_ATMOSPHERIC_PRESSURE;
/** Humidity ratio as the SI chart draws it, in g/kg. */
const hrUnit = displayUnitFor(q.hr, unitSystem.si);

/**
 * 3a's bound per model, in the model's scanned output: how far the model's
 * own number at a drawn crossing may sit from the limit. Fixed 2026-10-02
 * from the worst residual over the record's conditions, measured at or below
 * saturation.
 *
 * PMV (ISO 7730): measured 0.00002. The kernel is smooth, so what is left is
 * the linear interpolation between two cells.
 *
 * PMV (ASHRAE 55): measured 0.00805. The library's `cooling_effect` rounds to
 * two decimals, as pythermalcomfort's does, so PMV is a staircase in the
 * temperature, a step of up to 0.0048 PMV, that no grid locates.
 */
const renderingBounds: readonly { readonly model: RegisteredModel; readonly bound: number }[] = [
  { model: pmvPpdIso, bound: 0.005 },
  { model: pmvPpdAshrae, bound: 0.01 },
];

/**
 * 3b's bound per standard of the record, in °C, and the registered model of
 * that standard. Loose on purpose: it holds the kernel difference and the
 * rendering together and catches a wrong binding, not a precision. Worst
 * measured 2026-10-02 over the record's zones: 0.0093 °C for ISO, 0.0228 °C
 * for ASHRAE.
 *
 * ASHRAE: the library's `cooling_effect` rounds to two decimals, the deployed
 * tool's does not, and its staircase moves the contour by up to about
 * 0.016 °C.
 *
 * ISO: the library's PMV kernel starts its clothing-temperature iteration
 * from ISO 7730 Annex D's initial guess, as pythermalcomfort 4.6.0 does, and
 * the record was made with the deployed tool's kernel, which does not.
 * Regenerating the record from the library would make this test circular,
 * and matching the deployed kernel is ruled out by the library's ADR 0001.
 */
const oracleBounds = {
  ISO: { model: pmvPpdIso, bound: 0.02 },
  ASHRAE: { model: pmvPpdAshrae, bound: 0.03 },
} as const;

/**
 * The deployed tool traces each side of a zone at 0 to 100 % relative
 * humidity in steps of 10: the record lists the cool side's eleven vertices
 * from dry up, then the saturation line, then the warm side's eleven from
 * saturated down.
 */
const SIDE_VERTICES = 11;

/** The record's distinct conditions as a person enters them; it draws each under both standards. */
const conditions = [...new Map(record.zones.map((zone) => [JSON.stringify(zone.conditions), zone.conditions])).values()];

/** A drawn Comfort zone's contour in SI: the temperatures of its columns, the humidity ratios of its rows, and its scan. */
interface Contour {
  readonly temperatures: readonly number[];
  readonly humidityRatios: readonly number[];
  readonly z: ContourZoneTrace["z"];
}

/** The contour `model`'s chart of `slot` draws for its zone of `limit`, as the Standard page asks for it. */
function contourOf(model: RegisteredModel, slot: Slot, limit: number): Contour {
  const spec = psychrometricSpec(chartRequestFor(model, slot));
  const trace = spec.traces.find((entry): entry is ContourZoneTrace => entry.kind === "contourZone" && entry.upper === limit);
  if (!trace) {
    throw new Error(`${model.info.label} draws no zone of limit ${limit}`);
  }
  return { temperatures: trace.x, humidityRatios: trace.y.map((hr) => hrUnit.toSi(hr)), z: trace.z };
}

/**
 * The temperatures at which grid row `yIndex` of `contour` crosses `level`:
 * between the two bracketing cells, linearly, as the contour draws a cell's
 * edge.
 */
function crossingsOnRow(contour: Contour, yIndex: number, level: number): number[] {
  const row = contour.z[yIndex];
  const { temperatures } = contour;
  return row.slice(0, -1).flatMap((left, xIndex) => {
    const right = row[xIndex + 1];
    if (left === null || right === null || left < level === right < level) {
      return [];
    }
    return [temperatures[xIndex] + ((level - left) / (right - left)) * (temperatures[xIndex + 1] - temperatures[xIndex])];
  });
}

/**
 * The temperature at which `contour` crosses `level` at the humidity ratio
 * `hr`: the crossings on the two grid rows around it, joined by the straight
 * segment the contour draws between them.
 */
function crossingAt(contour: Contour, hr: number, level: number): number {
  const { humidityRatios } = contour;
  const above = humidityRatios.findIndex((rowHr) => rowHr > hr);
  const below = above === -1 ? humidityRatios.length - 2 : Math.max(above - 1, 0);
  const [lower, upper] = [below, below + 1].map((yIndex) => {
    const crossings = crossingsOnRow(contour, yIndex, level);
    if (crossings.length !== 1) {
      throw new Error(`row ${yIndex} crosses ${level} ${crossings.length} times`);
    }
    return crossings[0];
  });
  return lower + ((hr - humidityRatios[below]) / (humidityRatios[below + 1] - humidityRatios[below])) * (upper - lower);
}

/** `model`'s own scanned number for `slot` at `temperature` and the humidity ratio `hr`, in SI. */
function numberAt(model: RegisteredModel, slot: Slot, temperature: number, hr: number): number {
  const cell = withEnteredValues(slot, new Map([
    [slot.temperature.mode.axis, temperature],
    [q.rh, hr_to_rh(hr, temperature, p)],
  ]));
  return resultNumber(runOn(cell, model, p), requireScan(model).output);
}

describe("criterion 3a: the psychrometric chart's contour against the library", () => {
  it("crosses each Comfort zone's limit within the model's bound of it on every grid row, for every registered model with a psychrometric chart", () => {
    const psychrometricModels = registeredModels.filter((model) => psychrometricChartOf(model));
    expect(psychrometricModels.length).toBeGreaterThan(0);
    for (const model of psychrometricModels) {
      const bound = renderingBounds.find((entry) => entry.model === model)?.bound;
      if (bound === undefined) {
        throw new Error(`${model.info.label} has no rendering bound: measure its worst residual and fix one`);
      }
      let worst = { residual: 0, at: "" };
      let compared = 0;
      for (const entered of conditions) {
        const slot = enteredSlotFor(model, { tr: entered.tr, v: entered.vel, met: entered.met, clo: entered.clo });
        for (const zone of requireScan(model).comfortZones ?? []) {
          const contour = contourOf(model, slot, zone.limit);
          for (const level of [-zone.limit, zone.limit]) {
            contour.humidityRatios.forEach((hr, yIndex) => {
              for (const temperature of crossingsOnRow(contour, yIndex, level)) {
                // Above saturation the contour runs on under the cover, unseen,
                // and PMV (ASHRAE 55)'s cooling effect jumps there by up to
                // 0.1 PMV per 0.01 °C (measured 2026-10-02, from 105 %).
                if (hr_to_rh(hr, temperature, p) > 100) {
                  continue;
                }
                compared += 1;
                const residual = Math.abs(numberAt(model, slot, temperature, hr) - level);
                if (residual > worst.residual) {
                  worst = { residual, at: `${JSON.stringify(entered)}, level ${level}, row ${yIndex}` };
                }
              }
            });
          }
        }
      }
      expect(compared, model.info.label).toBeGreaterThan(0);
      expect(worst.residual, `${model.info.label}, worst at ${worst.at}`).toBeLessThanOrEqual(bound);
    }
  });
});

describe("criterion 3b: the psychrometric chart's contour against the deployed tool", () => {
  it.each(record.zones)("crosses the record's vertices: $standard ±$pmvLimit met=$met clo=$clo", (zone) => {
    const { model, bound } = oracleBounds[zone.standard as keyof typeof oracleBounds];
    // The record's inputs are those the deployed tool's tracer was called on,
    // the air speed and the clothing already corrected, so they are entered
    // as such.
    const slot = enteredSlotFor(model, { tr: zone.tr, vr: zone.vr, met: zone.met, clo_dynamic: zone.clo });
    const contour = contourOf(model, slot, zone.pmvLimit);
    const sides = [
      { vertices: zone.boundary.slice(0, SIDE_VERTICES), level: -zone.pmvLimit },
      { vertices: zone.boundary.slice(-SIDE_VERTICES).reverse(), level: zone.pmvLimit },
    ];
    for (const { vertices, level } of sides) {
      // Each side is the deployed tool's 0, 10, …, 100 % rows, so no
      // saturation-line vertex is compared: the cover's edge is the library's
      // saturation line.
      expect(vertices.map((vertex) => Math.round(hr_to_rh(vertex.hr, vertex.db, p) / 10))).toEqual(Array.from({ length: SIDE_VERTICES }, (_, step) => step));
      const off = vertices.flatMap((expected) => {
        const crossing = crossingAt(contour, expected.hr, level);
        return Math.abs(crossing - expected.db) <= bound ? [] : [{ expected, crossing }];
      });
      expect(off).toEqual([]);
    }
  });
});
