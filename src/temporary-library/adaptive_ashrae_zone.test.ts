import { describe, expect, it } from "vitest";
import type { adaptive_ashrae } from "jsthermalcomfort";
import { _adaptive_ashrae_zone, adaptive_ashrae_zone } from "./adaptive_ashrae_zone.ts";
import type { AdaptivePoint } from "./adaptive_ashrae_zone.ts";

// The function's claim is that it draws the bands the CBE Thermal Comfort Tool
// draws at comfort.cbe.berkeley.edu. The oracle is that tool's own vertices,
// quoted from `drawChart` and `redrawBounds` in
// `comfort_tool/static/js/ASHRAE/adaptive-chart-ashrae.js` (e809c96) as
// [running mean, (ta + tr) / 2] in °C. The tool draws each limit out to a
// running mean of 36 and clips the picture to 10–33.5; its cooling effect is
// added to the last two upper vertices, 1.2, 1.8 or 2.2 °C at 0.6, 0.9 or
// 1.2 m/s (`ASHRAE/ashrae.js`, `velaSelect.onchange`).
const DEPLOYED = {
  acceptability_80: {
    upper: [[10, 24.4], [12, 25], [36, 32.46]],
    lower: [[10, 17.4], [36, 25.46]],
  },
  acceptability_90: {
    upper: [[10, 23.4], [15.16, 25], [36, 31.46]],
    lower: [[10, 18.4], [36, 26.46]],
  },
} as const;

/** The bands, by the names of the `adaptive_ashrae` outputs they are the regions of, 80 % first. */
const LABELS = ["acceptability_80", "acceptability_90"] as const;

/**
 * How far a vertex may sit from the deployed tool's, in °C. The tool's
 * vertices are hand-rounded to two decimals; its 36 °C ends are exactly the
 * library's lines, which puts its upper 80 % limit 0.002 °C under the library
 * at 33.5.
 */
const TOLERANCE = 0.01;

/**
 * How far each band's step may sit from the deployed vertex, in running-mean
 * °C. The library's 90 % base line reaches 25 °C at 4.7 / 0.31 = 15.161; its
 * 80 % one at 3.7 / 0.31 = 11.935, which the deployed tool rounds to 12 (its
 * first 80 % segment rises 0.6 over 2, a slope of 0.30 against the standard's
 * 0.31).
 */
const STEP_TOLERANCE = { acceptability_80: 0.07, acceptability_90: TOLERANCE } as const;

/** The deployed air speeds that carry a cooling effect, [m/s], and the effect it adds, [°C]. */
const DEPLOYED_COOLING_EFFECT = [
  [0.6, 1.2],
  [0.9, 1.8],
  [1.2, 2.2],
] as const;

/** The deployed polyline's operative temperature at `runningMean`, by straight interpolation between its vertices. */
function deployedAt(vertices: readonly (readonly [number, number])[], runningMean: number): number {
  for (let index = 1; index < vertices.length; index += 1) {
    const [x0, y0] = vertices[index - 1]!;
    const [x1, y1] = vertices[index]!;
    if (runningMean <= x1) return y0 + ((runningMean - x0) * (y1 - y0)) / (x1 - x0);
  }
  throw new Error(`${runningMean} is past the deployed polyline`);
}

/**
 * Asserts a limit's vertices. The label is part of what is compared, so a
 * failure names the limit, and lists each vertex that is off by its index.
 */
function expectLimit(
  actual: readonly AdaptivePoint[],
  expected: readonly (readonly [number, number])[],
  label: string,
  runningMeanTolerance = 1e-9,
) {
  const off = expected.flatMap(([runningMean, operative], vertex) => {
    const drawn = actual[vertex];
    const on =
      drawn !== undefined &&
      Math.abs(drawn.t_running_mean - runningMean) < runningMeanTolerance &&
      Math.abs(drawn.operative_tmp - operative) < TOLERANCE;
    return on ? [] : [{ vertex, drawn, expected: [runningMean, operative] }];
  });
  expect({ limit: label, vertex_count: actual.length, off }).toEqual({
    limit: label,
    vertex_count: expected.length,
    off: [],
  });
}

describe("adaptive ASHRAE 55 acceptability bands", () => {
  it("draws the deployed tool's straight limits below 0.6 m/s", () => {
    const zone = adaptive_ashrae_zone({ v: 0.3, t_running_mean_range: [10, 33.5] });
    expect(Object.keys(zone)).toEqual(LABELS);
    for (const label of LABELS) {
      // The deployed tool keeps its step vertices at no cooling effect, a
      // zero-height step; the limit is the one straight segment between the ends.
      const { upper, lower } = DEPLOYED[label];
      expectLimit(zone[label].upper_limit, [[10, deployedAt(upper, 10)], [33.5, deployedAt(upper, 33.5)]], `${label} upper`);
      expectLimit(zone[label].lower_limit, [[10, deployedAt(lower, 10)], [33.5, deployedAt(lower, 33.5)]], `${label} lower`);
    }
  });

  it("steps each upper limit by the deployed cooling effect where its base line reaches 25 °C", () => {
    for (const [v, coolingEffect] of DEPLOYED_COOLING_EFFECT) {
      const zone = adaptive_ashrae_zone({ v, t_running_mean_range: [10, 33.5] });
      for (const label of LABELS) {
        const [start, step, end] = DEPLOYED[label].upper;
        expectLimit(
          zone[label].upper_limit,
          [start, step, [step[0], step[1] + coolingEffect], [33.5, deployedAt([step, end], 33.5) + coolingEffect]],
          `${label} upper at ${v} m/s`,
          STEP_TOLERANCE[label],
        );
      }
    }
  });

  it("draws the running means asked for, and none outside 10–33.5 °C", () => {
    const wide = adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [0, 40] });
    expect(wide).toEqual(adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [10, 33.5] }));

    // Worked by hand from ASHRAE 55's t_cmf = 0.31 trm + 17.8, the 80 % limits
    // at ±3.5 and the 90 % at ±2.5, and 1.2 °C of cooling effect at 0.6 m/s.
    // Past both steps, each upper limit is shifted end to end.
    const past = adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [20, 30] });
    expectLimit(past.acceptability_80.upper_limit, [[20, 28.7], [30, 31.8]], "80 % upper past the step");
    expectLimit(past.acceptability_80.lower_limit, [[20, 20.5], [30, 23.6]], "80 % lower past the step");
    expectLimit(past.acceptability_90.upper_limit, [[20, 27.7], [30, 30.8]], "90 % upper past the step");
    // Short of both steps, neither upper limit is.
    const short = adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [10, 11] });
    expectLimit(short.acceptability_80.upper_limit, [[10, 24.4], [11, 24.71]], "80 % upper short of the step");
    expectLimit(short.acceptability_90.upper_limit, [[10, 23.4], [11, 23.71]], "90 % upper short of the step");
  });

  it.each(LABELS.flatMap((label) => [[label, 0, 5] as const, [label, 35, 40] as const]))(
    "draws no %s band over running means %s–%s °C, wholly outside 10–33.5 °C",
    (label, low, high) => {
      const outside = adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [low, high] });
      expect(outside[label].polygon).toEqual([]);
    },
  );

  it.each(LABELS)("closes the %s band as one polygon, upper limit out and lower limit back", (label) => {
    const zone = adaptive_ashrae_zone({ v: 0.9, t_running_mean_range: [10, 33.5] });
    expect(Object.keys(zone[label]).sort()).toEqual(["lower_limit", "polygon", "upper_limit"]);
    const { upper_limit, lower_limit, polygon } = zone[label];
    expect(polygon).toEqual([...upper_limit, ...[...lower_limit].reverse(), upper_limit[0]]);
  });

  it("draws whatever the model returns, and transcribes none of its numbers", () => {
    // Nothing like the standard: 80 % from trm to trm + 10, 90 % from trm + 1
    // to trm + 9, and 3 °C of cooling effect from 0.6 m/s whatever the
    // operative temperature. Only the onset at 25 °C is the function's own.
    const standIn: typeof adaptive_ashrae = ({ t_running_mean, v }) => {
      const coolingEffect = v >= 0.6 ? 3 : 0;
      return {
        tmp_cmf: t_running_mean + 5,
        tmp_cmf_80_low: t_running_mean,
        tmp_cmf_80_up: t_running_mean + 10 + coolingEffect,
        tmp_cmf_90_low: t_running_mean + 1,
        tmp_cmf_90_up: t_running_mean + 9 + coolingEffect,
        acceptability_80: false,
        acceptability_90: false,
        warnings: [],
      };
    };
    const { acceptability_80, acceptability_90 } = _adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [10, 33.5] }, standIn);
    expectLimit(acceptability_80.upper_limit, [[10, 20], [15, 25], [15, 28], [33.5, 46.5]], "stubbed 80 % upper");
    expectLimit(acceptability_80.lower_limit, [[10, 10], [33.5, 33.5]], "stubbed 80 % lower");
    expectLimit(acceptability_90.upper_limit, [[10, 19], [16, 25], [16, 28], [33.5, 45.5]], "stubbed 90 % upper");
    expectLimit(acceptability_90.lower_limit, [[10, 11], [33.5, 34.5]], "stubbed 90 % lower");
  });

  it.each(DEPLOYED_COOLING_EFFECT.flatMap(([v]) => LABELS.map((label) => [label, v] as const)))(
    "never moves the %s lower limit with air speed, at %s m/s",
    (label, v) => {
      const still = adaptive_ashrae_zone({ v: 0, t_running_mean_range: [10, 33.5] });
      const moving = adaptive_ashrae_zone({ v, t_running_mean_range: [10, 33.5] });
      expect(moving[label].lower_limit).toEqual(still[label].lower_limit);
    },
  );
});
