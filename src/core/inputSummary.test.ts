import { describe, expect, it } from "vitest";
import { Standard } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { violationRows, warningFor } from "./applicability";
import { bandListOf } from "./bands";
import { enteredSlotFor } from "./declarationTestSlots";
import { airSpeedMode, clothingMode, humidityMode, temperatureMode } from "./entryModes";
import { inputSummary, type DrawnRun } from "./inputSummary";
import { inputsOf, optionsOf, type RegisteredModel } from "./modelDeclaration";
import { runOn } from "./modelRun";
import { formatNumber } from "./numberFormat";
import { copy } from "$lib/text/copy";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, quantityFor, type Quantity } from "./quantities";
import { panelQuantities, startingSlot, withEntryModes, withHumidityMode, withOption, type Slot } from "./slot";
import { slotNames } from "./slotBadge";
import { standardEntryFor } from "./standard";
import { displayUnitFor, labelWithUnit } from "./units";
import { unitSystem, type UnitSystem } from "./unitSystem";
import type { SlotPosition } from "./writtenSession";

const q = quantities;
const si = unitSystem.si;

/** `slot` drawn unnamed, at `atmosphericPressure`, its run breaking nothing. */
function runOf(slot: Slot, atmosphericPressure = DEFAULT_ATMOSPHERIC_PRESSURE): DrawnRun {
  return { slot, atmosphericPressure, violations: [] };
}

/** `slot` drawn unnamed at the default pressure, with the violation rows `model`'s run of it reports. */
function reportedRunOf(model: RegisteredModel, slot: Slot): DrawnRun {
  const result = runOn(slot, model, DEFAULT_ATMOSPHERIC_PRESSURE);
  return { ...runOf(slot), violations: violationRows(model, result, slot) };
}

/** The lines of a run's broken limits: the limits popover's heading, then each limit in its row's sentence. */
function limitLinesOf(run: DrawnRun): string[] {
  return [copy.limitsBrokenHeading, ...run.violations.map((row) => warningFor(row, si))];
}

/** `slot` drawn as the slot at `position` while the slots are named. */
function namedRunOf(slot: Slot, position: SlotPosition): DrawnRun {
  return { ...runOf(slot), name: slotNames[position] };
}

/** The summary of `runs` on Standard: no Band list. */
function summaryOf(model: RegisteredModel, runs: readonly DrawnRun[], system: UnitSystem = si) {
  return inputSummary({ model, runs, unitSystem: system, bands: null });
}

/** The start of the line that gives `quantity`'s value, as its panel row is labelled. */
function rowOf(quantity: Quantity, system: UnitSystem = si): string {
  return `${labelWithUnit(quantity, displayUnitFor(quantity, system))}: `;
}

function hasRowOf(lines: readonly string[], quantity: Quantity): boolean {
  return lines.some((line) => line.startsWith(rowOf(quantity)));
}

const [ashraeOption] = optionsOf(pmvPpdAshrae);
const LOWER_PRESSURE = 90_000;

describe("inputSummary", () => {
  it("of one run on a model's defaults lists the model, its standard, the panel's rows, its options and the pressure, with no slot heading", () => {
    const summary = summaryOf(pmvPpdAshrae, [runOf(startingSlot(pmvPpdAshrae))]);
    expect(summary).toEqual([
      [copy.summaryModel(pmvPpdAshrae.info.label, standardEntryFor(Standard.ashrae_55_2023).name)],
      [
        ...inputsOf(pmvPpdAshrae).map(({ quantity, value }) => `${rowOf(quantity)}${formatNumber(value)}`),
        `${ashraeOption.label}: ${copy.no}`,
        `${rowOf(q.p_atm)}${DEFAULT_ATMOSPHERIC_PRESSURE}`,
      ],
    ]);
  });

  it("lists, for every registered model on its defaults, one row per quantity the panel lists and one line per declared option", () => {
    for (const model of registeredModels) {
      const slot = startingSlot(model);
      const [, lines] = summaryOf(model, [runOf(slot)]);
      const rows = panelQuantities(model, slot);
      expect(lines, model.info.label).toHaveLength(rows.length + optionsOf(model).length + 1);
      rows.forEach((quantity, index) => expect(lines[index]).toMatch(new RegExp(`^${escaped(rowOf(quantity))}\\d`)));
      optionsOf(model).forEach((option, index) => expect(lines[rows.length + index]).toBe(`${option.label}: ${copy.no}`));
    }
  });

  it("gives a model with no standard its name alone", () => {
    const [chart] = summaryOf(heatIndexRothfusz, [runOf(startingSlot(heatIndexRothfusz))]);
    expect(chart).toEqual([heatIndexRothfusz.info.label]);
  });

  it("gives three named runs three groups in slot order, each headed by its slot's name", () => {
    const runs = ([0, 1, 2] as const).map((position) => namedRunOf(startingSlot(pmvPpdIso), position));
    const [, ...slots] = summaryOf(pmvPpdIso, runs);
    expect(slots.map((lines) => lines[0])).toEqual(["Input 1", "Input 2", "Input 3"]);
  });

  it("heads each run by its name when the runs are named, whatever their count", () => {
    for (const positions of [[0], [1], [0, 2]] as const) {
      const [, ...slots] = summaryOf(pmvPpdIso, positions.map((position) => namedRunOf(startingSlot(pmvPpdIso), position)));
      expect(slots.map((lines) => lines[0])).toEqual(positions.map((position) => slotNames[position]));
    }
  });

  it("heads no run when the runs are unnamed, whatever their count", () => {
    const [{ quantity, value }] = inputsOf(pmvPpdIso);
    for (const count of [1, 2, 3]) {
      const runs = Array.from({ length: count }, () => runOf(startingSlot(pmvPpdIso)));
      const [, ...slots] = summaryOf(pmvPpdIso, runs);
      expect(slots.map((lines) => lines[0]), `${count} drawn`).toEqual(runs.map(() => `${rowOf(quantity)}${formatNumber(value)}`));
    }
  });

  it("lists each entry group's second mode under that mode's quantities and not the first mode's", () => {
    const second = { temperature: { mode: temperatureMode.operative }, airSpeed: { mode: airSpeedMode.corrected }, clothing: { mode: clothingMode.corrected } };
    const [, lines] = summaryOf(pmvPpdAshrae, [runOf(withEntryModes(startingSlot(pmvPpdAshrae), second, pmvPpdAshrae))]);
    for (const quantity of [q.operative_tmp, q.vr, q.clo_dynamic]) {
      expect(hasRowOf(lines, quantity), quantity.key).toBe(true);
    }
    for (const quantity of [q.tdb, q.tr, q.v, q.clo]) {
      expect(hasRowOf(lines, quantity), quantity.key).toBe(false);
    }
  });

  it("lists each humidity entry under its own quantity alone", () => {
    const modes = Object.values(humidityMode);
    for (const mode of modes) {
      const slot = withHumidityMode(startingSlot(pmvPpdIso), mode, DEFAULT_ATMOSPHERIC_PRESSURE);
      const [, lines] = summaryOf(pmvPpdIso, [runOf(slot)]);
      for (const other of modes) {
        expect(hasRowOf(lines, other.quantity), `${mode.quantity.key} lists ${other.quantity.key}`).toBe(other === mode);
      }
    }
  });

  it("writes IP's values and units in IP, and a value of more than two decimals at two", () => {
    const slot = enteredSlotFor(pmvPpdIso, { tdb: 25.123, v: 0.123456 });
    const [, ip] = summaryOf(pmvPpdIso, [runOf(slot)], unitSystem.ip);
    expect(ip).toContain(`${q.tdb.label} (°F): 77.22`);
    expect(ip).toContain(`${q.v.label} (fpm): 24.3`);
    const [, metric] = summaryOf(pmvPpdIso, [runOf(slot)]);
    expect(metric).toContain(`${q.tdb.label} (°C): 25.12`);
    expect(metric).toContain(`${q.v.label} (m/s): 0.12`);
  });

  it("lists each run's own option and its own pressure", () => {
    const off = startingSlot(pmvPpdAshrae);
    const on = withOption(off, ashraeOption, true);
    const [, first, second] = summaryOf(pmvPpdAshrae, [runOf(off), runOf(on, LOWER_PRESSURE)]);
    expect(first).toContain(`${ashraeOption.label}: ${copy.no}`);
    expect(second).toContain(`${ashraeOption.label}: ${copy.yes}`);
    expect(first).toContain(`${rowOf(q.p_atm)}${DEFAULT_ATMOSPHERIC_PRESSURE}`);
    expect(second).toContain(`${rowOf(q.p_atm)}${LOWER_PRESSURE}`);
  });

  it("writes the limits a run broke after its values, under the popover's heading, one line a limit", () => {
    const run = reportedRunOf(pmvPpdAshrae, enteredSlotFor(pmvPpdAshrae, { v: 0.9 }));
    const [, lines] = summaryOf(pmvPpdAshrae, [run]);
    const [, unbroken] = summaryOf(pmvPpdAshrae, [runOf(run.slot)]);
    expect(lines).toEqual([...unbroken, copy.limitsBrokenHeading, "Relative air speed must be ≤ 0.64 m/s"]);
  });

  it("writes a line for each limit a run broke", () => {
    const run = reportedRunOf(pmvPpdIso, enteredSlotFor(pmvPpdIso, { tdb: 30, tr: 40, met: 2, clo: 1, v: 1.5 }));
    expect(run.violations.length).toBeGreaterThan(1);
    const [, lines] = summaryOf(pmvPpdIso, [run]);
    expect(lines.slice(-limitLinesOf(run).length)).toEqual(limitLinesOf(run));
  });

  it("writes no limits for a run that broke none", () => {
    const run = reportedRunOf(pmvPpdIso, startingSlot(pmvPpdIso));
    expect(run.violations).toEqual([]);
    const [, lines] = summaryOf(pmvPpdIso, [run]);
    expect(lines).not.toContain(copy.limitsBrokenHeading);
    expect(lines[lines.length - 1]).toBe(`${rowOf(q.p_atm)}${DEFAULT_ATMOSPHERIC_PRESSURE}`);
  });

  it("writes, under Compare, each run's own limits after its own values", () => {
    const unbrokenSlot = startingSlot(pmvPpdIso);
    const runs = [
      { ...reportedRunOf(pmvPpdIso, unbrokenSlot), name: slotNames[0] },
      { ...reportedRunOf(pmvPpdIso, enteredSlotFor(pmvPpdIso, { tdb: 30, tr: 40, met: 2, clo: 1 })), name: slotNames[1] },
      { ...reportedRunOf(pmvPpdIso, enteredSlotFor(pmvPpdIso, { v: 1.5 })), name: slotNames[2] },
    ];
    const [, first, second, third] = summaryOf(pmvPpdIso, runs);
    const [, unbroken] = summaryOf(pmvPpdIso, [namedRunOf(unbrokenSlot, 0)]);
    expect(first).toEqual(unbroken);
    expect(second.slice(-limitLinesOf(runs[1]).length)).toEqual(limitLinesOf(runs[1]));
    expect(third.slice(-limitLinesOf(runs[2]).length)).toEqual(limitLinesOf(runs[2]));
    expect(limitLinesOf(runs[1])).not.toEqual(limitLinesOf(runs[2]));
  });

  it("ends, given a Band list, with the scanned output's label and every Edge in order", () => {
    const scan = pmvPpdIso.scan;
    if (!scan) {
      throw new Error("PMV (ISO 7730) declares no scan");
    }
    const bands = bandListOf(scan.classifier);
    const summary = inputSummary({ model: pmvPpdIso, runs: [runOf(startingSlot(pmvPpdIso))], unitSystem: si, bands });
    const last = summary[summary.length - 1];
    expect(last).toHaveLength(1);
    expect(last[0]).toContain(labelWithUnit(scan.output, displayUnitFor(scan.output, si)));
    expect(last[0]).toContain(bands.edges.map(formatNumber).join(", "));
    expect(summaryOf(pmvPpdIso, [runOf(startingSlot(pmvPpdIso))]).flat().some((line) => line.includes(rowOf(scan.output)))).toBe(false);
  });

  it("holds no result of the model", () => {
    for (const model of registeredModels) {
      const slot = startingSlot(model);
      const lines = summaryOf(model, [runOf(slot)]).flat();
      const entered = panelQuantities(model, slot);
      for (const key of Object.keys(model.info.outputs)) {
        const output = quantityFor(key);
        if (output && !entered.includes(output)) {
          // A value line, not the label alone: the model line "PMV / PPD (…)" starts with PMV's label.
          expect(hasRowOf(lines, output), `${model.info.label} ${key}`).toBe(false);
        }
      }
    }
  });
});

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
