/**
 * A slot's scan: the grid every scanned chart sweeps, the frame a chart's
 * slots share and the field a slot's scan gives, read cell by cell off the
 * model's own runs, with each Comfort zone's membership and boundary
 * crossings found on those runs and on the few more a boundary asks for.
 */
import type { ComfortZone, Range, RegisteredModel } from "$lib/core/modelDeclaration";
import { resultNumber, resultWarnings, runOn } from "$lib/core/modelRun";
import type { Quantity } from "$lib/core/quantities";
import { withEnteredValues, withEntryModes, type Slot, type ValueEntryModes } from "$lib/core/slot";
import type { RegionGrid } from "./regionTracer";
import { samples } from "./specParts";

/**
 * One count for every axis, every model and both scanned charts: 51 points are
 * 50 intervals, so the SI steps are round (ADR-0002 decision 28).
 */
export const GRID = 51;

/**
 * How many times a grid line is halved where a bound ends a zone: eight, so
 * the crossing is placed to 1/256 of a cell (ADR-0002 decision 78, rule 1).
 */
export const BISECTIONS = 8;

/** A quantity a scan sweeps, and the range, in SI, it is swept across. */
export interface Sweep {
  readonly quantity: Quantity;
  readonly range: Range;
}

/**
 * What every slot's scan on one chart shares (ADR-0002 decision 61): the
 * model and the output it scans, the two quantities swept, the entry modes
 * the slot is converted into, and the atmospheric pressure. A slot's scan is
 * a function of this and the slot alone, so the outputs can keep one per slot
 * and an edit to one slot scans that slot and no other
 * (`state/compute.svelte.ts`). Each chart builds its own frame; the scan is
 * the same for both.
 */
export interface ScanFrame {
  readonly model: RegisteredModel;
  readonly output: Quantity;
  readonly x: Sweep;
  readonly y: Sweep;
  readonly entryModes: ValueEntryModes;
  readonly atmosphericPressure: number;
}

/** One slot's scan of the `GRID × GRID` field, every table `[yIndex][xIndex]`. */
export interface ScannedField {
  /** The model's own number for the frame's output, in the output's SI unit. */
  readonly values: readonly (readonly number[])[];
  /**
   * Each Comfort zone of the model, in {@link comfortZonesOf}'s order, as the
   * region tracer reads it, over the frame's samples in SI (ADR-0002 decision
   * 78, rule 1). A grid point is a member where its run gives a finite number
   * within the zone's limit and breaks no bound, no row of its `warnings`
   * (decision 77, rule 1). Between a member and a point that is not, the
   * boundary crosses where the number crosses the limit, interpolated in the
   * two numbers, or where the run starts to break a bound or stops giving a
   * number, bisected on the run itself; where both end the zone there, at
   * the crossing nearer the member. A saddle cell's centre is run. No bound's
   * value is read here: the bisection asks the run.
   */
  readonly zones: readonly RegionGrid[];
}

/**
 * The Comfort zones a scanned chart draws of each slot's scan, largest
 * first: the model's scan's own (`core/comfortZones`), each where |PMV| is
 * inside its limit. None for a model whose scan declares none; a model
 * declaring the psychrometric chart has some, which a registry-wide test holds
 * (`core/modelDeclaration.test.ts`).
 */
export function comfortZonesOf(model: RegisteredModel): readonly ComfortZone[] {
  return [...(model.scan?.comfortZones ?? [])].sort((a, b) => b.limit - a.limit);
}

/**
 * `slot` scanned in `frame`: converted into the frame's entry modes first, by
 * the entry-mode change's own conversion, so a slot entered in another mode
 * is swept on the quantities it would hold after that change; then each cell
 * entered over the two swept quantities, as the person enters a value, and
 * the model run. A swept humidity quantity puts the cell in that humidity's
 * entry mode, so the slot's own conversion gives the cell its relative
 * humidity and the scan converts nothing itself. Every cell is run once: one
 * the model has no number for is `NaN`. A zone's boundary runs the same
 * converted slot at points between the cells, where it bisects a crossing
 * and at a saddle cell's centre.
 */
export function scannedField(frame: ScanFrame, slot: Slot): ScannedField {
  const { model, output, x, y, atmosphericPressure } = frame;
  const converted = withEntryModes(slot, frame.entryModes, model);
  const run = (point: Point): Reading => {
    const cell = withEnteredValues(converted, new Map([
      [x.quantity, point.x],
      [y.quantity, point.y],
    ]));
    const result = runOn(cell, model, atmosphericPressure);
    return { value: resultNumber(result, output), withinBounds: resultWarnings(model, result).length === 0 };
  };
  const grid = { x: samples(x.range, GRID), y: samples(y.range, GRID) };
  const readings = grid.y.map((yValue) => grid.x.map((xValue) => run({ x: xValue, y: yValue })));
  const asked = askedRunsOf(grid, run);
  return {
    values: readings.map((row) => row.map((reading) => reading.value)),
    zones: comfortZonesOf(model).map((zone) => zoneGridOf(zone, grid, readings, asked)),
  };
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** A grid point by its indices. */
interface GridIndex {
  readonly i: number;
  readonly j: number;
}

/** The scan's samples along each axis, in SI. */
interface Samples {
  readonly x: readonly number[];
  readonly y: readonly number[];
}

/** What one run gives a zone: the model's number, and whether the run broke no bound. */
interface Reading {
  readonly value: number;
  readonly withinBounds: boolean;
}

/** Whether a run lies where its model applies: a finite number, from a run that broke no bound. */
function isApplicable(reading: Reading): boolean {
  return reading.withinBounds && Number.isFinite(reading.value);
}

/** The runs a zone's boundary asks for beyond the grid's, each made once for all the zones of a scan. */
interface AskedRuns {
  /**
   * Where, as a fraction of the way from `from` to `to`, two neighbouring
   * grid points the first applicable and the second not, the runs between
   * them stop being applicable.
   */
  readonly endOfApplicability: (from: GridIndex, to: GridIndex) => number;
  /** The run at the centre of the cell whose lower-left corner is (`i`, `j`). */
  readonly centre: (corner: GridIndex) => Reading;
}

/** The runs `run` makes beyond `grid`'s points when a zone asks for them, each kept for the next zone that asks. */
function askedRunsOf(grid: Samples, run: (point: Point) => Reading): AskedRuns {
  const point = ({ i, j }: GridIndex): Point => ({ x: grid.x[i], y: grid.y[j] });
  const ends = new Map<string, number>();
  const centres = new Map<string, Reading>();
  return {
    endOfApplicability(from, to) {
      const key = `${from.i} ${from.j} ${to.i} ${to.j}`;
      let fraction = ends.get(key);
      if (fraction === undefined) {
        fraction = bisected(point(from), point(to), (at) => isApplicable(run(at)));
        ends.set(key, fraction);
      }
      return fraction;
    },
    centre(corner) {
      const key = `${corner.i} ${corner.j}`;
      let reading = centres.get(key);
      if (reading === undefined) {
        const [lower, upper] = [point(corner), point({ i: corner.i + 1, j: corner.j + 1 })];
        reading = run({ x: (lower.x + upper.x) / 2, y: (lower.y + upper.y) / 2 });
        centres.set(key, reading);
      }
      return reading;
    },
  };
}

/**
 * Where, from `from`, where `holds` is true, to `to`, where it is not, it
 * stops holding: the line halved {@link BISECTIONS} times, keeping the half
 * it changes in, and the middle of the last half given, as a fraction of the
 * way.
 */
function bisected(from: Point, to: Point, holds: (at: Point) => boolean): number {
  let [inside, outside] = [0, 1];
  for (let step = 0; step < BISECTIONS; step++) {
    const middle = (inside + outside) / 2;
    if (holds({ x: from.x + middle * (to.x - from.x), y: from.y + middle * (to.y - from.y) })) {
      inside = middle;
    } else {
      outside = middle;
    }
  }
  return (inside + outside) / 2;
}

/** `zone` over the scan's `readings` as the region tracer reads it ({@link ScannedField.zones}). */
function zoneGridOf(zone: ComfortZone, grid: Samples, readings: readonly (readonly Reading[])[], asked: AskedRuns): RegionGrid {
  const withinLimit = (value: number) => (zone.inclusive ? Math.abs(value) <= zone.limit : Math.abs(value) < zone.limit);
  const isMember = (reading: Reading) => isApplicable(reading) && withinLimit(reading.value);
  const inside = readings.map((row) => row.map(isMember));

  /**
   * Where the boundary crosses from the member `from` to its neighbour `to`,
   * which is not, as a fraction of the way: at the limit, where the number
   * crosses it, or where the runs stop being applicable, whichever of the two
   * ending the zone there is nearer the member.
   */
  const crossingFrom = (from: GridIndex, to: GridIndex): number => {
    const member = readings[from.j][from.i].value;
    const other = readings[to.j][to.i];
    const crossings: number[] = [];
    if (Number.isFinite(other.value) && !withinLimit(other.value)) {
      const limit = Math.sign(other.value) * zone.limit;
      crossings.push((limit - member) / (other.value - member));
    }
    if (!isApplicable(other)) {
      crossings.push(asked.endOfApplicability(from, to));
    }
    return Math.min(...crossings);
  };
  /** The crossing between the neighbours `lower` and `upper`, as a fraction from `lower`, where one is a member and the other not. */
  const crossingBetween = (lower: GridIndex, upper: GridIndex): number | undefined => {
    if (inside[lower.j][lower.i] === inside[upper.j][upper.i]) {
      return undefined;
    }
    return inside[lower.j][lower.i] ? crossingFrom(lower, upper) : 1 - crossingFrom(upper, lower);
  };
  /** Whether the cell whose lower-left corner is (`i`, `j`) is a saddle: two diagonal corners members, the other two not. */
  const isSaddle = ({ i, j }: GridIndex) =>
    inside[j][i] === inside[j + 1][i + 1] && inside[j][i + 1] === inside[j + 1][i] && inside[j][i] !== inside[j][i + 1];

  const columns = grid.x.length;
  const rows = grid.y.length;
  return {
    x: grid.x,
    y: grid.y,
    inside,
    across: inside.map((row, j) => row.map((_, i) => (i + 1 < columns ? crossingBetween({ i, j }, { i: i + 1, j }) : undefined))),
    up: inside.map((row, j) => row.map((_, i) => (j + 1 < rows ? crossingBetween({ i, j }, { i, j: j + 1 }) : undefined))),
    centre: inside.map((row, j) =>
      row.map((_, i) => (i + 1 < columns && j + 1 < rows && isSaddle({ i, j }) ? isMember(asked.centre({ i, j })) : undefined)),
    ),
  };
}
