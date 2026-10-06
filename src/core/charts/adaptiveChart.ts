import { chartInk } from "$lib/core/bandPalette";
import { toLibraryInputs } from "$lib/core/libraryInputs";
import { adaptiveChartOf, requireAxisRange, type ZonePolygon } from "$lib/core/modelDeclaration";
import { enteredValue, withEntryModes } from "$lib/core/slot";
import type { SlotHue } from "$lib/core/slotBadge";
import { displayUnitFor } from "$lib/core/units";
import type { ChartRequest } from "./chartRequest";
import type { ChartSpec, LegendEntry, PathTrace, Trace } from "./chartSpec";
import { containsPoint } from "./polygon";
import { axisFor, hoverGridFor, labelFor, markerFor } from "./specParts";

/**
 * The adaptive chart of every slot of the request (ADR-0002 decisions 50 and
 * 62): the exact polygons the model's `comfortZones` source traces for each
 * slot (ADR §4.4), with no scan at all, on the chart's own declared axes in
 * every entry mode: nothing is mapped to an entry mode, and an operative axis
 * is marked at the slot's operative temperature in either mode (ADR-0002
 * decision 37). The polygons are nested Comfort zones, largest first, so they
 * are painted as the psychrometric chart paints its own: the slot's hue with
 * the opacity rising inwards, outlined in its zone line, never the
 * thermal-sensation palette. A filled polygon cannot report where the pointer
 * is inside it, so the polygons read nothing and a hover grid over the same
 * `GRID × GRID` field reads for them: both axis values, and the innermost
 * zone of each slot the cell is in. Then each slot's marker; no other chrome.
 * A model that declares no adaptive chart throws, naming it.
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

  const traces: Trace[] = [];
  /** Each slot's legend entries, zones first, so the legend reads slot by slot. */
  const legendOfSlot = request.slots.map((): LegendEntry[] => []);

  const polygonsOfSlot = request.slots.map((charted) =>
    chart.comfortZones({ values: toLibraryInputs(withEntryModes(charted.slot, modes, model), model, atmosphericPressure), xRange }),
  );
  request.slots.forEach((charted, position) => {
    const polygons = polygonsOfSlot[position];
    for (const [index, polygon] of polygons.entries()) {
      // A zone never captures the pointer, so the hover grid below reads for it.
      const zone = zoneFor(
        labelFor(request, charted, polygon.label),
        polygon.x.map((value) => xUnit.fromSi(value)),
        polygon.y.map((value) => yUnit.fromSi(value)),
        index,
        polygons.length,
        charted.hue,
      );
      traces.push(zone.trace);
      legendOfSlot[position].push(zone.legendEntry);
    }
  });
  traces.push(
    hoverGridFor({ quantity: x, range: xRange }, { quantity: y, range: yRange }, unitSystem, (cell) =>
      request.slots.flatMap((charted, position) =>
        innermostLabels(polygonsOfSlot[position], cell.x, cell.y).map((label) => labelFor(request, charted, label)),
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

/**
 * A Comfort zone's polygon through `x` and `y`, already in display units, and
 * the legend entry that names it. Zone `level` of `levels` nested ones, 0 the
 * outermost, is filled in `hue` by that level and outlined in the hue's zone
 * line. Its fill cannot say where the pointer is inside it, so it never
 * captures the pointer.
 */
function zoneFor(
  label: string,
  x: readonly number[],
  y: readonly number[],
  level: number,
  levels: number,
  hue: SlotHue,
): { readonly trace: PathTrace; readonly legendEntry: LegendEntry } {
  const fill = chartInk.zoneFill(hue, level, levels);
  return {
    trace: { kind: "path", x, y, color: hue.zoneLine, width: chartInk.zoneLineWidth, fill, hover: "off", label },
    legendEntry: { label, swatch: "fill", color: fill },
  };
}

/**
 * The label of the innermost zone containing the point: the zones are nested
 * and listed largest first, so the last one that contains it. None outside
 * every zone.
 */
function innermostLabels(zones: readonly ZonePolygon[], x: number, y: number): readonly string[] {
  return zones.filter((zone) => containsPoint(zone, x, y)).slice(-1).map((zone) => zone.label);
}
