import { describe, expect, it } from "vitest";
import { adaptive_ashrae } from "jsthermalcomfort";
import { _adaptive_ashrae_zone, adaptive_ashrae_zone } from "./adaptive_ashrae_zone.ts";
import type { AdaptivePoint } from "./adaptive_ashrae_zone.ts";

// Below 0.6 m/s the function's bands are the ones the CBE Thermal Comfort
// Tool draws at comfort.cbe.berkeley.edu, and the oracle there is that tool's
// own vertices, quoted from `drawChart` and `redrawBounds` in
// `comfort_tool/static/js/ASHRAE/adaptive-chart-ashrae.js` (e809c96) as
// [running mean, (ta + tr) / 2] in °C. The tool draws each limit out to a
// running mean of 36 and clips the picture to 10–33.5. From 0.6 m/s the
// function draws what `adaptive_ashrae` accepts and the tool does not: the tool
// steps each upper limit where its base line reaches 25 °C. There the oracles
// are the standard's equations worked by hand, and the library's own answers
// on either side of every edge.
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
 * The air speeds that carry a cooling effect, [m/s], and the effect each adds
 * to the upper limits, [°C], as `adaptive_ashrae` adds them, ASHRAE 55-2013
 * Table 5.4.2.4's.
 */
const COOLING_EFFECT = [
  [0.6, 1.2],
  [0.9, 1.8],
  [1.2, 2.2],
] as const;

/**
 * Each band's upper limit at each air speed of {@link COOLING_EFFECT}, over
 * running means 10–33.5 °C, worked by hand from ASHRAE 55's
 * t_cmf = 0.31 trm + 17.8, the 80 % upper limit at t_cmf + 3.5 and the 90 % at
 * t_cmf + 2.5, each plus the cooling effect from an operative temperature of
 * 25 °C. The 80 % base line reaches 25 °C at 3.7 / 0.31 = 11.94, the 90 % at
 * 4.7 / 0.31 = 15.16. Each limit runs along its base line to there, back along
 * 25 °C to where its shifted line reaches 25 °C, or to the lowest running mean
 * and up it where the shifted line is past 25 °C already, then along the
 * shifted line.
 */
const UPPER_LIMIT_WITH_STRIP = {
  0.6: {
    acceptability_80: [[10, 24.4], [3.7 / 0.31, 25], [10, 25], [10, 25.6], [33.5, 32.885]],
    acceptability_90: [[10, 23.4], [4.7 / 0.31, 25], [3.5 / 0.31, 25], [33.5, 31.885]],
  },
  0.9: {
    acceptability_80: [[10, 24.4], [3.7 / 0.31, 25], [10, 25], [10, 26.2], [33.5, 33.485]],
    acceptability_90: [[10, 23.4], [4.7 / 0.31, 25], [10, 25], [10, 25.2], [33.5, 32.485]],
  },
  1.2: {
    acceptability_80: [[10, 24.4], [3.7 / 0.31, 25], [10, 25], [10, 26.6], [33.5, 33.885]],
    acceptability_90: [[10, 23.4], [4.7 / 0.31, 25], [10, 25], [10, 25.6], [33.5, 32.885]],
  },
} as const;

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

/** The z component of (b − a) × (c − a): positive when c lies left of the line from a to b. */
function cross(a: AdaptivePoint, b: AdaptivePoint, c: AdaptivePoint): number {
  return (
    (b.t_running_mean - a.t_running_mean) * (c.operative_tmp - a.operative_tmp) -
    (b.operative_tmp - a.operative_tmp) * (c.t_running_mean - a.t_running_mean)
  );
}

/** Whether `c`, collinear with the segment from `a` to `b`, lies on it. */
function within(a: AdaptivePoint, b: AdaptivePoint, c: AdaptivePoint): boolean {
  return (
    Math.min(a.t_running_mean, b.t_running_mean) <= c.t_running_mean &&
    c.t_running_mean <= Math.max(a.t_running_mean, b.t_running_mean) &&
    Math.min(a.operative_tmp, b.operative_tmp) <= c.operative_tmp &&
    c.operative_tmp <= Math.max(a.operative_tmp, b.operative_tmp)
  );
}

/** Whether the segments from `a` to `b` and from `c` to `d` share a point. */
function segmentsMeet(a: AdaptivePoint, b: AdaptivePoint, c: AdaptivePoint, d: AdaptivePoint): boolean {
  const [abc, abd, cda, cdb] = [cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)];
  if (Math.sign(abc) * Math.sign(abd) < 0 && Math.sign(cda) * Math.sign(cdb) < 0) return true;
  return (
    (abc === 0 && within(a, b, c)) ||
    (abd === 0 && within(a, b, d)) ||
    (cda === 0 && within(c, d, a)) ||
    (cdb === 0 && within(c, d, b))
  );
}

/** The sides of a closed polygon, whose last vertex repeats its first, each as its two ends. */
function sidesOf(polygon: readonly AdaptivePoint[]): [AdaptivePoint, AdaptivePoint][] {
  return polygon.slice(1).map((end, index) => [polygon[index]!, end]);
}

/**
 * The pairs of a closed polygon's sides that break its being simple, by their
 * indices: two sides that are not neighbours and share a point, or two
 * neighbours that fold back over each other. Empty for a simple polygon.
 */
function selfContacts(polygon: readonly AdaptivePoint[]): [number, number][] {
  const sides = sidesOf(polygon);
  const contacts: [number, number][] = [];
  sides.forEach(([a, b], first) => {
    for (let second = first + 1; second < sides.length; second += 1) {
      const [c, d] = sides[second]!;
      const neighbours = second === first + 1 || (first === 0 && second === sides.length - 1);
      const folds = neighbours && cross(a, b, second === first + 1 ? d : c) === 0 && within(a, b, second === first + 1 ? d : c);
      if (neighbours ? folds : segmentsMeet(a, b, c, d)) contacts.push([first, second]);
    }
  });
  return contacts;
}

/** Whether `point` lies inside the closed `polygon`, by the even-odd rule. */
function inside(polygon: readonly AdaptivePoint[], point: AdaptivePoint): boolean {
  return sidesOf(polygon).reduce((odd, [a, b]) => {
    const straddles = a.operative_tmp > point.operative_tmp !== b.operative_tmp > point.operative_tmp;
    const crossing =
      a.t_running_mean +
      ((point.operative_tmp - a.operative_tmp) * (b.t_running_mean - a.t_running_mean)) / (b.operative_tmp - a.operative_tmp);
    return straddles && point.t_running_mean < crossing ? !odd : odd;
  }, false);
}

/** How far either side of a polygon's side the region is sampled, [°C]. */
const SIDE_OFFSET = 1e-6;

describe("adaptive ASHRAE 55 acceptability bands", () => {
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

  it.each([0.3, 0.59])("draws the bands of still air at %s m/s, where the library adds no cooling effect", (v) => {
    const still = adaptive_ashrae_zone({ v: 0, t_running_mean_range: [10, 33.5] });
    expect(adaptive_ashrae_zone({ v, t_running_mean_range: [10, 33.5] })).toEqual(still);
  });

  it.each(COOLING_EFFECT.map(([v]) => v))(
    "holds the strip from 25 °C to the shifted limit in each upper limit at %s m/s",
    (v) => {
      const zone = adaptive_ashrae_zone({ v, t_running_mean_range: [10, 33.5] });
      for (const label of LABELS) {
        expectLimit(zone[label].upper_limit, UPPER_LIMIT_WITH_STRIP[v][label], `${label} upper at ${v} m/s`);
      }
    },
  );

  it.each(LABELS.flatMap((label) => [0, 0.3, ...COOLING_EFFECT.map(([v]) => v)].map((v) => [label, v] as const)))(
    "closes the %s band at %s m/s as one simple polygon",
    (label, v) => {
      const { polygon } = adaptive_ashrae_zone({ v, t_running_mean_range: [10, 33.5] })[label];
      expect(polygon[0]).toEqual(polygon[polygon.length - 1]);
      expect(selfContacts(polygon)).toEqual([]);
    },
  );

  it("finds a polygon that crosses itself, or folds a side back, not simple", () => {
    const corner = (t_running_mean: number, operative_tmp: number): AdaptivePoint => ({ t_running_mean, operative_tmp });
    const square = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1), corner(0, 0)];
    expect(selfContacts(square)).toEqual([]);
    expect(selfContacts([corner(0, 0), corner(1, 1), corner(1, 0), corner(0, 1), corner(0, 0)])).toEqual([[0, 2]]);
    // The fold back over side 0 ends on it, where side 2 starts.
    expect(selfContacts([corner(0, 0), corner(1, 0), corner(0.5, 0), corner(0.5, 1), corner(0, 0)])).toEqual([
      [0, 1],
      [0, 2],
    ]);
  });

  it.each(LABELS.flatMap((label) => [0.3, ...COOLING_EFFECT.map(([v]) => v)].map((v) => [label, v] as const)))(
    "holds the %s region adaptive_ashrae accepts at %s m/s, on either side of every side",
    (label, v) => {
      const [start, end] = [10, 33.5];
      const { polygon } = adaptive_ashrae_zone({ v, t_running_mean_range: [start, end] })[label];
      const samples = sidesOf(polygon).flatMap(([a, b]) => {
        const length = Math.hypot(b.t_running_mean - a.t_running_mean, b.operative_tmp - a.operative_tmp);
        // The unit normal to the left of the side, which either side of it is sampled along.
        const normal = {
          t_running_mean: -(b.operative_tmp - a.operative_tmp) / length,
          operative_tmp: (b.t_running_mean - a.t_running_mean) / length,
        };
        return [0.25, 0.5, 0.75].flatMap((along) =>
          [SIDE_OFFSET, -SIDE_OFFSET].map((offset) => ({
            t_running_mean: a.t_running_mean + along * (b.t_running_mean - a.t_running_mean) + offset * normal.t_running_mean,
            operative_tmp: a.operative_tmp + along * (b.operative_tmp - a.operative_tmp) + offset * normal.operative_tmp,
          })),
        );
      });
      // Past the drawn running means is where the chart stops, not a limit.
      const drawn = samples.filter((point) => start < point.t_running_mean && point.t_running_mean < end);
      const answers = drawn.map((point) => {
        const { t_running_mean, operative_tmp } = point;
        const run = adaptive_ashrae({
          tdb: operative_tmp,
          tr: operative_tmp,
          t_running_mean,
          v,
          limit_inputs: false,
          round_output: false,
        });
        return { point, accepted: run[label], inside: inside(polygon, point) };
      });
      expect(answers.filter((answer) => answer.accepted !== answer.inside)).toEqual([]);
      // Both answers are read, so the comparison is not vacuous.
      expect(new Set(answers.map((answer) => answer.accepted))).toEqual(new Set([true, false]));
    },
  );

  it("draws the running means asked for, and none outside 10–33.5 °C", () => {
    const wide = adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [0, 40] });
    expect(wide).toEqual(adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [10, 33.5] }));

    // Worked by hand from ASHRAE 55's t_cmf = 0.31 trm + 17.8, the 80 % limits
    // at ±3.5 and the 90 % at ±2.5, and 1.2 °C of cooling effect at 0.6 m/s.
    // Past both base lines' 25 °C, each upper limit is shifted end to end.
    const past = adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [20, 30] });
    expectLimit(past.acceptability_80.upper_limit, [[20, 28.7], [30, 31.8]], "80 % upper past 25 °C");
    expectLimit(past.acceptability_80.lower_limit, [[20, 20.5], [30, 23.6]], "80 % lower past 25 °C");
    expectLimit(past.acceptability_90.upper_limit, [[20, 27.7], [30, 30.8]], "90 % upper past 25 °C");
  });

  it("throws for a range that ends before a base line reaches 25 °C while its shifted line is past it", () => {
    // At 0.6 m/s the 80 % shifted line is past 25 °C from a running mean of
    // 8.06, its base line only from 11.94: over 10–11 °C the strip above 25 °C
    // touches no other part of the band, which one polygon cannot hold.
    expect(() => adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [10, 11] })).toThrow(RangeError);
    expect(() => adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [10, 11] })).toThrow("80 % band");
    // With no cooling effect there is no strip, and the same range draws.
    expect(adaptive_ashrae_zone({ v: 0.3, t_running_mean_range: [10, 11] }).acceptability_80.polygon).not.toEqual([]);
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
    const { acceptability_80, acceptability_90 } = _adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [10, 33.5] }, standIn);
    expectLimit(acceptability_80.upper_limit, [[10, 20], [15, 25], [12, 25], [33.5, 46.5]], "stubbed 80 % upper");
    expectLimit(acceptability_80.lower_limit, [[10, 10], [33.5, 33.5]], "stubbed 80 % lower");
    expectLimit(acceptability_90.upper_limit, [[10, 19], [16, 25], [13, 25], [33.5, 45.5]], "stubbed 90 % upper");
    expectLimit(acceptability_90.lower_limit, [[10, 11], [33.5, 34.5]], "stubbed 90 % lower");
  });

  it("keeps an upper limit on its base line where the shifted line stays below 25 °C", () => {
    // The stand-in's shifted lines reach 25 °C only at 12 and 13 °C; the
    // library's 80 % one is past 25 °C from 10 °C, so no range of the library's
    // keeps both bands short of it.
    const { acceptability_80, acceptability_90 } = _adaptive_ashrae_zone({ v: 0.6, t_running_mean_range: [10, 11.5] }, standIn);
    expectLimit(acceptability_80.upper_limit, [[10, 20], [11.5, 21.5]], "stubbed 80 % upper short of 25 °C");
    expectLimit(acceptability_90.upper_limit, [[10, 19], [11.5, 20.5]], "stubbed 90 % upper short of 25 °C");
  });

  it.each(COOLING_EFFECT.flatMap(([v]) => LABELS.map((label) => [label, v] as const)))(
    "never moves the %s lower limit with air speed, at %s m/s",
    (label, v) => {
      const still = adaptive_ashrae_zone({ v: 0, t_running_mean_range: [10, 33.5] });
      const moving = adaptive_ashrae_zone({ v, t_running_mean_range: [10, 33.5] });
      expect(moving[label].lower_limit).toEqual(still[label].lower_limit);
    },
  );
});
