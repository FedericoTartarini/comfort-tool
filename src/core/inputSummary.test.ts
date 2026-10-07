import { describe, expect, it } from "vitest";
import { registeredModels } from "$lib/models";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { bandListOf } from "./bands";
import { enteredSlotFor } from "./declarationTestSlots";
import { airSpeedMode, clothingMode, humidityMode, temperatureMode } from "./entryModes";
import { inputSummary, type DrawnRun } from "./inputSummary";
import type { RegisteredModel } from "./modelDeclaration";
import { formatNumber } from "./numberFormat";
import { copy } from "$lib/text/copy";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, quantityFor, type Quantity } from "./quantities";
import { panelQuantities, startingSlot, withEntryModes, withHumidityMode, withOption, type Slot } from "./slot";
import { namesSlots, slotBadges } from "./slotBadge";
import { standardCaptionFor } from "./standard";
import { displayUnitFor, labelWithUnit } from "./units";
import { unitSystem, type UnitSystem } from "./unitSystem";

const q = quantities;
const si = unitSystem.si;

/** `slot` drawn as the slot at `position`, at `atmosphericPressure`. */
function runOf(slot: Slot, position = 0, atmosphericPressure = DEFAULT_ATMOSPHERIC_PRESSURE): DrawnRun {
  return { name: slotBadges[position].name, slot, atmosphericPressure };
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

const ashraeOption = pmvPpdAshrae.options[0];
const LOWER_PRESSURE = 90_000;

describe("inputSummary", () => {
  it("of one run on a model's defaults lists the model, its standard, the panel's rows, its options and the pressure, with no slot heading", () => {
    const summary = summaryOf(pmvPpdAshrae, [runOf(startingSlot(pmvPpdAshrae))]);
    expect(summary).toEqual([
      [copy.summaryModel(pmvPpdAshrae.info.label, standardCaptionFor(pmvPpdAshrae.standard))],
      [
        ...pmvPpdAshrae.inputs.map(({ quantity, value }) => `${rowOf(quantity)}${formatNumber(value)}`),
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
      expect(lines, model.info.label).toHaveLength(rows.length + model.options.length + 1);
      rows.forEach((quantity, index) => expect(lines[index]).toMatch(new RegExp(`^${escaped(rowOf(quantity))}\\d`)));
      model.options.forEach((option, index) => expect(lines[rows.length + index]).toBe(`${option.label}: ${copy.no}`));
    }
  });

  it("gives a model with no standard its name alone", () => {
    const [chart] = summaryOf(heatIndexRothfusz, [runOf(startingSlot(heatIndexRothfusz))]);
    expect(chart).toEqual([heatIndexRothfusz.info.label]);
  });

  it("gives three runs three groups in slot order, each headed by its slot's name", () => {
    const runs = [0, 1, 2].map((position) => runOf(startingSlot(pmvPpdIso), position));
    const [, ...slots] = summaryOf(pmvPpdIso, runs);
    expect(slots.map((lines) => lines[0])).toEqual(slotBadges.map((badge) => badge.name));
  });

  it("heads a slot by its name exactly where the chart's legend names the slots", () => {
    const runs = [0, 1, 2].map((position) => runOf(startingSlot(pmvPpdIso), position));
    for (const drawn of [1, 2, 3]) {
      const [, first] = summaryOf(pmvPpdIso, runs.slice(0, drawn));
      expect(first[0] === slotBadges[0].name, `${drawn} drawn`).toBe(namesSlots(drawn));
    }
    // Slot 2 drawn alone is named as the legend names it.
    const [, alone] = summaryOf(pmvPpdIso, [runOf(startingSlot(pmvPpdIso), 1)]);
    expect(alone).not.toContain(slotBadges[1].name);
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
    const [, first, second] = summaryOf(pmvPpdAshrae, [runOf(off, 0), runOf(on, 1, LOWER_PRESSURE)]);
    expect(first).toContain(`${ashraeOption.label}: ${copy.no}`);
    expect(second).toContain(`${ashraeOption.label}: ${copy.yes}`);
    expect(first).toContain(`${rowOf(q.p_atm)}${DEFAULT_ATMOSPHERIC_PRESSURE}`);
    expect(second).toContain(`${rowOf(q.p_atm)}${LOWER_PRESSURE}`);
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
    expect(summaryOf(pmvPpdIso, [runOf(startingSlot(pmvPpdIso))]).flat().some((line) => line.includes(scan.output.label))).toBe(false);
  });

  it("holds no result of the model", () => {
    for (const model of registeredModels) {
      const slot = startingSlot(model);
      const lines = summaryOf(model, [runOf(slot)]).flat();
      const entered = panelQuantities(model, slot);
      for (const key of Object.keys(model.info.outputs)) {
        const output = quantityFor(key);
        if (output && !entered.includes(output)) {
          expect(lines.some((line) => line.startsWith(`${output.label}`)), `${model.info.label} ${key}`).toBe(false);
        }
      }
    }
  });
});

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
