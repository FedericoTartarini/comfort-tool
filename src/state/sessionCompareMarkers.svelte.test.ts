/**
 * A person who turns Compare on sees three markers, not one on another
 * (ADR-0002 decision 89's revision of rule 8, its registry-wide test): for
 * every registered model, at its defaults, in each entry mode of each group in
 * turn, slots 2 and 3 are enabled through the session, each chart the model
 * declares is drawn of the three slots as the page draws it, and every pair of
 * markers stands at least 2 % of an axis range apart. The check names no
 * quantity and no model, so a model added later is covered by its registry
 * line. Comfort zones are not checked: Adaptive's bands coincide below
 * 0.6 m/s, as the standard gives them.
 */
import type { InputsInfo } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import type { ChartSpec, PointTrace } from "$lib/core/charts/chartSpec";
import { chartType } from "$lib/core/chartType";
import { humidityMode, type ValueEntryMode } from "$lib/core/entryModes";
import { dynamicChartOf, hasHumidityGroup, type DeclaredChart, type RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities, type Quantity } from "$lib/core/quantities";
import { valueEntryGroups, type ValueEntryGroup } from "$lib/core/slot";
import { registeredModels } from "$lib/models";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { Outputs } from "./compute.svelte";
import { Session } from "./session.svelte";

const q = quantities;

/** The least distance two markers may stand apart: each axis's offset divided by that axis's drawn range. */
const LEAST_DISTANCE = 0.02;

/** One way into a model's entry modes: its defaults, or one group's other mode with the rest at theirs. */
interface ModeCase {
  readonly name: string;
  readonly enter: (session: Session) => void;
}

/** Each value entry group's mode set through the session, as the input panel's menu sets it. */
const setModeOf: Record<ValueEntryGroup["field"], (session: Session, mode: ValueEntryMode) => void> = {
  temperature: (session, mode) => session.setTemperatureMode(mode),
  airSpeed: (session, mode) => session.setAirSpeedMode(mode),
  clothing: (session, mode) => session.setClothingMode(mode),
};

/** The defaults, then every other mode of each group `model` has, the other groups at their defaults. */
function modeCasesOf(model: RegisteredModel): ModeCase[] {
  const fresh = new Session(model);
  const cases: ModeCase[] = [{ name: "the default entry modes", enter: () => {} }];
  for (const group of valueEntryGroups.filter((candidate) => candidate.appliesTo(model))) {
    for (const mode of group.modes.filter((candidate) => candidate !== group.modeOf(fresh.entryModes))) {
      cases.push({ name: `${group.field} entered as ${mode.id}`, enter: (session) => setModeOf[group.field](session, mode) });
    }
  }
  if (hasHumidityGroup(model)) {
    for (const mode of Object.values(humidityMode).filter((candidate) => candidate !== fresh.humidityMode)) {
      cases.push({ name: `humidity entered as ${mode.id}`, enter: (session) => session.setHumidityMode(mode) });
    }
  }
  return cases;
}

function markersOf(spec: ChartSpec): PointTrace[] {
  return spec.traces.filter((trace): trace is PointTrace => trace.kind === "point");
}

/** How far apart two markers stand, as {@link LEAST_DISTANCE} measures it. */
function distanceBetween(a: PointTrace, b: PointTrace, spec: ChartSpec): number {
  const span = ({ range: [min, max] }: { range: readonly [number, number] }) => max - min;
  return Math.hypot((a.x - b.x) / span(spec.layout.x), (a.y - b.y) / span(spec.layout.y));
}

/** `chart` drawn of the session's compared slots as the page draws it, at the chart's declared axes. */
function drawChart(session: Session, outputs: Outputs, chart: DeclaredChart): ChartSpec {
  session.chart.type = chart.type;
  const dynamic = dynamicChartOf(session.model);
  if (dynamic && chart === dynamic) {
    session.chart.setAxes(dynamic.axes);
  }
  const spec = outputs.chart;
  if (!spec) {
    throw new Error(`${session.model.info.label} draws no ${chart.type.title} chart`);
  }
  return spec;
}

/**
 * Every pair of markers on a chart `model` declares, entered as `modeCase`
 * says, that stands closer than {@link LEAST_DISTANCE} once Compare is on and
 * slot 3 enabled, each named by the model, the entry modes, the chart, the
 * pair and the distance; or a chart that draws other than three markers.
 */
function markersTooClose(model: RegisteredModel, modeCase: ModeCase): string[] {
  const session = new Session(model);
  const outputs = new Outputs(session);
  // Before Compare: a slot first enabled takes slot 1's entry modes, so the
  // move is tested in the mode, as a person who switched it first meets it.
  modeCase.enter(session);
  session.setCompare(true);
  session.setSlotEnabled(2, true);
  return model.charts.flatMap((chart) => {
    const spec = drawChart(session, outputs, chart);
    const where = `${model.info.label}, ${modeCase.name}, ${chart.type.title} chart`;
    const markers = markersOf(spec);
    if (markers.length !== 3) {
      return [`${where}: ${markers.length} markers drawn`];
    }
    return ([[0, 1], [0, 2], [1, 2]] as const).flatMap(([first, second]) => {
      const distance = distanceBetween(markers[first], markers[second], spec);
      return distance < LEAST_DISTANCE ? [`${where}: Input ${first + 1} and Input ${second + 1} stand ${distance.toFixed(4)} apart`] : [];
    });
  });
}

describe.each(registeredModels)("the three markers of $info.label once Compare is on and slot 3 enabled", (model) => {
  it.each(modeCasesOf(model))("stand apart on every chart it declares, in $name", (modeCase) => {
    expect(markersTooClose(model, modeCase)).toEqual([]);
  });
});

describe("the check that keeps the three markers apart", () => {
  // Dry bulb and mean radiant start at their applicability bound's upper end,
  // so the arrival cuts the move back and only values off the psychrometric
  // chart's axes move: the check must see one marker on another.
  it("catches markers on one another for a model whose only moved values are off its chart's axes", () => {
    const upperEndOf = (quantity: Quantity) => {
      const inputs: InputsInfo = pmvPpdAshrae.info.inputs;
      const field = inputs[quantity.key];
      const max = field?.kind === "numeric" ? field.applicability?.max : undefined;
      if (max === undefined) {
        throw new Error(`${pmvPpdAshrae.info.label} bounds no ${quantity.label} from above`);
      }
      return max;
    };
    const fixture = {
      ...pmvPpdAshrae,
      info: { ...pmvPpdAshrae.info, label: "Fixture at its temperature bound" },
      inputs: pmvPpdAshrae.inputs.map((input) =>
        "quantity" in input && (input.quantity === q.tdb || input.quantity === q.tr) ? { ...input, value: upperEndOf(input.quantity) } : input,
      ),
      charts: [{ type: chartType.psychrometric }],
    } satisfies RegisteredModel;
    expect(markersTooClose(fixture, modeCasesOf(fixture)[0])).toContainEqual(
      "Fixture at its temperature bound, the default entry modes, Psychrometric chart: Input 1 and Input 2 stand 0.0000 apart",
    );
  });
});
