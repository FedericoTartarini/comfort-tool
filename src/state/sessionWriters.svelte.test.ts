/**
 * Every writer of a slot other than a typed value keeps the input gate's rule
 * (ADR-0002 decision 84, rule 5): an input calculator's Apply commits its
 * result as a typed value commits, cut to the row's bound; a preset is judged
 * as a typed value is; and an entry-mode switch, the unit switch and Reset
 * leave no entry out of range, a switch cutting what its conversion puts past
 * a bound as an arrival cuts. Asserted at the seam the other session tests
 * use, a session in and its state out.
 */
import { clo_dynamic_ashrae, clo_individual_garments } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { enteredBound } from "$lib/core/applicability";
import { customEnsemble, shownRow } from "$lib/core/calculators";
import { airSpeedMode, clothingMode, humidityMode, temperatureMode, type HumidityMode } from "$lib/core/entryModes";
import { presetsFor } from "$lib/core/presets";
import { quantities } from "$lib/core/quantities";
import { panelRows, valueEntryGroups, type ValueEntryModes } from "$lib/core/slot";
import { unitSystem } from "$lib/core/unitSystem";
import { registeredModels } from "$lib/models";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { Session, slotPositions } from "./session.svelte";
import { heldSlot, outOfRangeRowsOf, sessionComparingThreeSlots } from "./sessionTestReaders";

const q = quantities;

/** PMV (ASHRAE 55)'s row of the clothing insulation it takes, which an entered dynamic clothing insulation is held to. */
const dynamicClothingBound = pmvPpdAshrae.info.inputs.clo!.applicability!;

/** A session on PMV (ASHRAE 55) under dynamic clothing entry, at its starting metabolic rate. */
function dynamicClothingSession(): Session {
  const session = new Session(pmvPpdAshrae);
  session.setClothingMode(clothingMode.corrected);
  return session;
}

describe("an input calculator's Apply", () => {
  it("of an ensemble past PMV (ASHRAE 55)'s dynamic clothing bound writes the bound's end, as the dock shows it", () => {
    const heaviest = Object.entries(clo_individual_garments)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([garment]) => garment);
    const result = customEnsemble.compute(heaviest);
    const session = dynamicClothingSession();
    const met = session.slots[0].values.get(q.met)!;
    expect(clo_dynamic_ashrae(result.outputs.get(q.clo)!, met)).toBeGreaterThan(dynamicClothingBound.max!);

    const shown = shownRow(session.slots[0], customEnsemble, result, pmvPpdAshrae, session.atmosphericPressure);
    expect([shown.after, shown.cutTo]).toEqual([dynamicClothingBound.max, dynamicClothingBound]);
    session.applyCalculator(0, customEnsemble, result);

    expect(session.slots[0].values.get(q.clo_dynamic)).toBe(dynamicClothingBound.max);
  });

  it("of an ensemble within the bound writes the result", () => {
    const result = customEnsemble.compute(["Men's underwear", "Long-sleeve dress shirt", "Thick trousers"]);
    const session = dynamicClothingSession();
    const met = session.slots[0].values.get(q.met)!;

    expect(session.applyCalculator(0, customEnsemble, result)).toEqual({ kind: "legal" });

    expect(session.slots[0].values.get(q.clo_dynamic)).toBeCloseTo(clo_dynamic_ashrae(result.outputs.get(q.clo)!, met), 2);
  });
});

describe("a preset", () => {
  const presetOf = (label: string) => presetsFor(q.met)!.find((preset) => preset.label === label)!;

  it("of a metabolic rate past PMV (ASHRAE 55)'s bound is not legal in any slot; one within is legal in each", () => {
    const session = sessionComparingThreeSlots(pmvPpdAshrae);
    const basketball = presetOf("Basketball");
    const typing = presetOf("Typing");
    expect(basketball.value).toBeGreaterThan(enteredBound(pmvPpdAshrae, q.met, session.slots[0], session.atmosphericPressure)!.max!);

    for (const position of slotPositions) {
      expect(session.judgeEntry(position, q.met, basketball.value).kind).not.toBe("legal");
      expect(session.judgeEntry(position, q.met, typing.value)).toEqual({ kind: "legal" });
    }
  });
});

/** A switch of one entry-mode control from one of its modes to another: the label it is reported by, and the two settings. */
interface ModeSwitch {
  readonly label: string;
  readonly from: (session: Session) => void;
  readonly to: (session: Session) => void;
}

/** One of the session's entry-mode controls: whether the session's model has it, and every switch it offers. */
interface ModeControl {
  readonly appliesTo: (session: Session) => boolean;
  readonly switches: readonly ModeSwitch[];
}

/** Every switch from one of `modes` to another, each set by `set`. */
function switchesOf<Mode extends { readonly id: string }>(
  name: string,
  modes: readonly Mode[],
  set: (session: Session, mode: Mode) => void,
): ModeSwitch[] {
  return modes.flatMap((from) =>
    modes
      .filter((to) => to !== from)
      .map((to) => ({
        label: `${name}: ${from.id} to ${to.id}`,
        from: (session: Session) => set(session, from),
        to: (session: Session) => set(session, to),
      })),
  );
}

/** Whether the session's model has the entry group held in `field`. */
const hasGroup = (field: keyof ValueEntryModes) => (session: Session) =>
  valueEntryGroups.find((group) => group.field === field)!.appliesTo(session.model);

const modeControls: readonly ModeControl[] = [
  {
    appliesTo: hasGroup("temperature"),
    switches: switchesOf("temperature", Object.values(temperatureMode), (session, mode) => session.setTemperatureMode(mode)),
  },
  {
    appliesTo: hasGroup("airSpeed"),
    switches: switchesOf("air speed", Object.values(airSpeedMode), (session, mode) => session.setAirSpeedMode(mode)),
  },
  {
    appliesTo: hasGroup("clothing"),
    switches: switchesOf("clothing", Object.values(clothingMode), (session, mode) => session.setClothingMode(mode)),
  },
  {
    appliesTo: (session) => session.humidityMode !== undefined,
    switches: switchesOf("humidity", Object.values(humidityMode), (session, mode: HumidityMode) => session.setHumidityMode(mode)),
  },
];

/**
 * Every entry of each slot `session` holds committed at an end of its bound,
 * read at the slot as committed so far: slot 1's every entry at its upper
 * end, slot 2's at its lower, slot 3's alternately, in the panel's row order.
 * An entry whose bound is open at that end keeps its value: a model with no
 * upper end on its dry bulb takes one past any table the humidity conversions
 * read. Each commit is judged, so what is left is within every bound.
 */
function pushedToEnds(session: Session): Session {
  const upwards = [() => true, () => false, (index: number) => index % 2 === 0] as const;
  for (const position of slotPositions) {
    panelRows(session.model, heldSlot(session, position)).forEach((row, index) => {
      if ("option" in row) {
        return;
      }
      const bound = enteredBound(session.model, row.quantity, heldSlot(session, position), session.atmosphericPressure);
      const end = upwards[position](index) ? bound?.max : bound?.min;
      if (end !== undefined) {
        session.commitEntry(position, row.quantity, end);
      }
    });
  }
  expect(outOfRangeRowsOf(session)).toEqual([]);
  return session;
}

describe("an entry-mode switch", () => {
  it("cuts a relative air speed its conversion puts past PMV (ASHRAE 55)'s row, and a dynamic clothing insulation", () => {
    const session = new Session(pmvPpdAshrae);
    session.commitEntry(0, q.v, 3);
    session.commitEntry(0, q.clo, 3);

    session.setAirSpeedMode(airSpeedMode.corrected);
    session.setClothingMode(clothingMode.corrected);

    expect(session.slots[0].values.get(q.vr)).toBe(pmvPpdAshrae.info.inputs.vr!.applicability!.max);
    expect(session.slots[0].values.get(q.clo_dynamic)).toBe(dynamicClothingBound.max);
  });

  for (const model of registeredModels) {
    it(`leaves no entry out of range on ${model.info.label}, from every mode to every other, with every entry at its ends`, () => {
      const switches = modeControls.filter((control) => control.appliesTo(new Session(model))).flatMap((control) => control.switches);
      for (const { label, from, to } of switches) {
        const session = sessionComparingThreeSlots(model);
        from(session);
        pushedToEnds(session);

        to(session);

        expect(outOfRangeRowsOf(session), label).toEqual([]);
      }
    });
  }
});

describe("the unit switch", () => {
  for (const model of registeredModels) {
    it(`leaves no entry out of range on ${model.info.label}, both ways, with every entry at its ends`, () => {
      const session = pushedToEnds(sessionComparingThreeSlots(model));

      session.unitSystem = unitSystem.ip;
      expect(outOfRangeRowsOf(session)).toEqual([]);
      session.unitSystem = unitSystem.si;
      expect(outOfRangeRowsOf(session)).toEqual([]);
    });
  }
});
