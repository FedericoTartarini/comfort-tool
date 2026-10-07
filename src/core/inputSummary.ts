import { copy } from "$lib/text/copy";
import type { BandList } from "./bands";
import { optionsReader } from "./libraryInputs";
import type { RegisteredModel } from "./modelDeclaration";
import { formatNumber } from "./numberFormat";
import { quantities, type Quantity } from "./quantities";
import { enteredValue, panelQuantities, type Slot } from "./slot";
import { namesSlots } from "./slotBadge";
import { standardCaptionFor } from "./standard";
import { displayUnitFor, labelWithUnit } from "./units";
import type { UnitSystem } from "./unitSystem";

/**
 * A slot the chart draws, as its last valid run left it: the slot as it was
 * entered and the atmospheric pressure it ran at (ADR-0002 decision 33), with
 * the name its position gives it.
 */
export interface DrawnRun {
  readonly name: string;
  readonly slot: Slot;
  readonly atmosphericPressure: number;
}

/**
 * The Input summary's lines in groups, in the order they stand: the chart's,
 * then one per drawn slot in slot order, then the Edges' where Bands are
 * painted.
 */
export type InputSummary = readonly (readonly string[])[];

/**
 * What the chart of `runs` is computed from, as an Image writes it under its
 * legend (ADR-0002 decision 64, rule 3): the model's name and its standard;
 * then each run's rows as the input panel lists them for its slot, its
 * options and its pressure, headed by the slot's name where the legend names
 * slots; then, given the Band list the chart paints, its Edges. It reads the
 * runs and never the session's slots, so what is being typed out of range
 * cannot appear in it, and no line names an entry mode: a run's rows are
 * those of its own modes, and their quantities say which. It holds no result.
 */
export function inputSummary(parts: {
  model: RegisteredModel;
  runs: readonly DrawnRun[];
  unitSystem: UnitSystem;
  bands: BandList | null;
}): InputSummary {
  const { model, runs, unitSystem, bands } = parts;
  const modelLine = model.standard === undefined ? model.info.label : copy.summaryModel(model.info.label, standardCaptionFor(model.standard));
  const named = namesSlots(runs.length);
  const edges = bands && model.scan ? [[edgesLine(model.scan.output, bands, unitSystem)]] : [];
  return [[modelLine], ...runs.map((run) => runLines(model, run, unitSystem, named)), ...edges];
}

function runLines(model: RegisteredModel, run: DrawnRun, unitSystem: UnitSystem, named: boolean): string[] {
  const { slot, atmosphericPressure } = run;
  const options = optionsReader(slot.options);
  return [
    ...(named ? [run.name] : []),
    ...panelQuantities(model, slot).map((quantity) =>
      valueLine(quantity, enteredValue(slot, quantity, model, atmosphericPressure), unitSystem),
    ),
    ...model.options.map((option) => copy.summaryValue(option.label, options(option) ? copy.yes : copy.no)),
    valueLine(quantities.p_atm, atmosphericPressure, unitSystem),
  ];
}

/** `quantity`'s line as its panel row shows it: the label with the unit, and the SI `value` in that unit. */
function valueLine(quantity: Quantity, value: number | undefined, unitSystem: UnitSystem): string {
  const unit = displayUnitFor(quantity, unitSystem);
  const shown = value === undefined ? copy.notAvailable : formatNumber(unit.fromSi(value));
  return copy.summaryValue(labelWithUnit(quantity, unit), shown);
}

/** The Band list's Edges in order, in `output`'s display unit, as the Bands panel's Edge column reads them. */
function edgesLine(output: Quantity, bands: BandList, unitSystem: UnitSystem): string {
  const unit = displayUnitFor(output, unitSystem);
  return copy.summaryEdges(labelWithUnit(output, unit), bands.edges.map((edge) => formatNumber(unit.fromSi(edge))).join(", "));
}
