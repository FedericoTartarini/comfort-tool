import { chartInk } from "$lib/core/bandPalette";
import { toLibraryInputs } from "$lib/core/libraryInputs";
import { adaptiveChartOf, requireAxisRange, type ZoneLimits } from "$lib/core/modelDeclaration";
import { enteredValue, withEntryModes } from "$lib/core/slot";
import { displayUnitFor } from "$lib/core/units";
import type { ChartRequest } from "./chartRequest";
import type { ChartSpec, LegendEntry, PathTrace, Trace } from "./chartSpec";
import { containsPoint, type Polygon } from "./polygon";
import { axisFor, hoverGridFor, labelFor, markerFor } from "./specParts";

/**
 * The adaptive chart of every slot of the request (ADR-0002 decisions 50 and
 * 62): the exact limit lines the model's `limits` source traces for each
 * slot (ADR §4.4), with no scan at all, on the chart's own declared axes in
 * every entry mode: nothing is mapped to an entry mode, and an operative axis
 * is marked at the slot's operative temperature in either mode (ADR-0002
 * decision 37). The zones are nested, largest first, so they are painted as
 * the psychrometric chart paints its own: the slot's hue with the opacity
 * rising inwards, never the thermal-sensation palette. Each is a fill with no
 * stroke over the region its two lines close, and the two lines stroked in
 * the hue's zone line, so the sides that close the region at the ends of the
 * x range, where the chart stops and the model sets no limit, are not drawn.
 * Neither reads the pointer, so a hover grid over the same `GRID × GRID`
 * field reads for them: both axis values, and the innermost zone of each slot
 * the cell is in. Laid in the one drawing order: every slot's fills, every
 * slot's lines, the hover grid, each slot's marker; no other chrome. A model
 * that declares no adaptive chart throws, naming it.
 */
export function adaptiveSpec(request: ChartRequest): ChartSpec {
  const { model, unitSystem, atmosphericPressure } = request;
  const chart = adaptiveChartOf(model);
  if (!chart) {
    throw new Error(`${model.info.label} declares no adaptive chart`);
  }
  const modes = request.entryModes;
  const { x, y } = chart.axes;
  const xRange = requireAxisRange(model, x);
  const yRange = requireAxisRange(model, y);
  const xUnit = displayUnitFor(x, unitSystem);
  const yUnit = displayUnitFor(y, unitSystem);
  /** A path given in SI, converted to display units. */
  const displayed = (path: Path): Path => ({
    x: path.x.map((value) => xUnit.fromSi(value)),
    y: path.y.map((value) => yUnit.fromSi(value)),
  });

  const fills: PathTrace[] = [];
  const lines: PathTrace[] = [];
  /** Each slot's legend entries, zones first, so the legend reads slot by slot. */
  const legendOfSlot = request.slots.map((): LegendEntry[] => []);

  const zonesOfSlot = request.slots.map((charted) =>
    chart.limits({ values: toLibraryInputs(withEntryModes(charted.slot, modes, model), model, atmosphericPressure), xRange }),
  );
  /** Each slot's zones as the regions their lines close, in SI: what is filled and what the hover grid reads. */
  const regionsOfSlot = zonesOfSlot.map((zones) => zones.map(regionOf));
  request.slots.forEach((charted, position) => {
    const zones = zonesOfSlot[position];
    for (const [index, zone] of zones.entries()) {
      const label = labelFor(request, charted, zone.label);
      const fill = chartInk.zoneFill(charted.hue, index, zones.length);
      // Neither the fill nor a line captures the pointer, so the hover grid below reads for them.
      fills.push({ kind: "path", ...displayed(regionsOfSlot[position][index]), color: fill, width: 0, fill, hover: "off", label });
      for (const limit of [zone.upper, zone.lower]) {
        lines.push({
          kind: "path",
          ...displayed(coordinatesOf(limit)),
          color: chartInk.zoneLine(charted.hue),
          width: chartInk.zoneLineWidth,
          hover: "off",
          label,
        });
      }
      legendOfSlot[position].push({ label, swatch: "fill", color: fill });
    }
  });
  const traces: Trace[] = [...fills, ...lines];
  traces.push(
    hoverGridFor({ quantity: x, range: xRange }, { quantity: y, range: yRange }, unitSystem, (cell) =>
      request.slots.flatMap((charted, position) =>
        innermostLabels(regionsOfSlot[position], cell.x, cell.y).map((label) => labelFor(request, charted, label)),
      ),
    ),
  );

  request.slots.forEach((charted, position) => {
    const slot = withEntryModes(charted.slot, modes, model);
    const markerX = enteredValue(slot, x, model, atmosphericPressure);
    const markerY = enteredValue(slot, y, model, atmosphericPressure);
    if (markerX !== undefined && markerY !== undefined) {
      const marker = markerFor(charted, xUnit.fromSi(markerX), yUnit.fromSi(markerY));
      traces.push(marker.trace);
      legendOfSlot[position].push(marker.legendEntry);
    }
  });

  return {
    traces,
    layout: { x: axisFor(x, xUnit, xRange), y: axisFor(y, yUnit, yRange) },
    legend: legendOfSlot.flat(),
    annotations: [],
  };
}

/** A path's two coordinate lists, open or closed. */
interface Path {
  readonly x: readonly number[];
  readonly y: readonly number[];
}

/** A Comfort zone named by its label: the region its limit lines close. */
interface ZoneRegion extends Polygon {
  readonly label: string;
}

/** `points` as a path's two coordinate lists. */
function coordinatesOf(points: ZoneLimits["upper"]): Path {
  return { x: points.map((point) => point.x), y: points.map((point) => point.y) };
}

/**
 * The region `zone`'s two limit lines close, as the deployed tool closes it:
 * the upper line out and the lower line back, the last vertex joining the
 * first. The two closing sides are where the chart stops, not limits.
 */
function regionOf(zone: ZoneLimits): ZoneRegion {
  return { label: zone.label, ...coordinatesOf([...zone.upper, ...[...zone.lower].reverse()]) };
}

/**
 * The label of the innermost zone containing the point: the zones are nested
 * and listed largest first, so the last one that contains it. None outside
 * every zone.
 */
function innermostLabels(zones: readonly ZoneRegion[], x: number, y: number): readonly string[] {
  return zones.filter((zone) => containsPoint(zone, x, y)).slice(-1).map((zone) => zone.label);
}
