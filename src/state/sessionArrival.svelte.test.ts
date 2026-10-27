/**
 * An arrival by address (ADR-0002 decision 84, rule 4, and its note of
 * 2026-10-28): setting the session's address cuts every entry and the
 * pressure to their bounds, a dependent entry against the bound it has at the
 * entries it depends on as cut, lists nothing, holds nothing pending, and
 * answers whether it cut anything. Asserted at the seam the other session
 * tests use: a session in, its state out. The bounds expected are read from
 * the gate, so no bound is written here by hand.
 */
import { describe, expect, it } from "vitest";
import { atmosphericPressureRow, enteredBound, nearestEnd, outOfRangeRows } from "$lib/core/applicability";
import { humidityMode } from "$lib/core/entryModes";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { page, type Address } from "$lib/core/page";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "$lib/core/quantities";
import { valueEntryGroups, withEnteredValues, withHumidityMode, type Slot } from "$lib/core/slot";
import { registeredModels } from "$lib/models";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Session } from "./session.svelte";
import { addressOf, heldSlot, openedOn } from "./sessionTestReaders";

const q = quantities;
/** A pressure below the bound's 30 000 Pa (ADR-0002 decision 49). */
const PRESSURE_OUT_OF_RANGE = 20000;

function standardAddress(model: RegisteredModel): Address {
  return { page: page.standard, model };
}

/** The bound the gate holds `quantity` to in `slot` under `model`, or a throw for an entry it leaves unbounded. */
function boundOf(model: RegisteredModel, quantity: Quantity, slot: Slot) {
  const bound = enteredBound(model, quantity, slot, DEFAULT_ATMOSPHERIC_PRESSURE);
  if (!bound) {
    throw new Error(`${quantity.label} has no bound under ${model.info.label}`);
  }
  return bound;
}

/**
 * `slot` with every entry it holds one unit past its bound under `model`, the
 * humidity entry last and past its bound at the dry bulb already moved; an
 * entry with no bound is left as it is.
 */
function pastEveryBound(slot: Slot, model: RegisteredModel): Slot {
  const entered = [...slot.values.keys()];
  if (slot.humidity) {
    entered.push(slot.humidity.mode.quantity);
  }
  return entered.reduce((moved, quantity) => {
    const bound = enteredBound(model, quantity, moved, DEFAULT_ATMOSPHERIC_PRESSURE);
    const past = bound?.max !== undefined ? bound.max + 1 : bound?.min !== undefined ? bound.min - 1 : undefined;
    return past === undefined ? moved : withEnteredValues(moved, new Map([[quantity, past]]));
  }, slot);
}

/**
 * The slots a session on `model` starts with, in each humidity entry mode it
 * can hold, once in the default mode of every other entry group and once in
 * the other mode of every group the model has.
 */
function slotsInEveryEntryMode(model: RegisteredModel): Slot[] {
  const [starting] = new Session(model).toWrittenSession().slots;
  const corrected = valueEntryGroups.reduce(
    (converted, group) =>
      group.appliesTo(model) ? group.convert(converted, group.modes.find((mode) => mode !== group.modeOf(converted))!, model) : converted,
    starting,
  );
  const humidityModes = starting.humidity ? Object.values(humidityMode) : [undefined];
  return [starting, corrected].flatMap((slot) =>
    humidityModes.map((mode) => (mode ? withHumidityMode(slot, mode, DEFAULT_ATMOSPHERIC_PRESSURE) : slot)),
  );
}

/**
 * A session built from a written session on `model` holding `slot` in all
 * three slots, every entry past its bound, slot 2 enabled with Compare off and
 * slot 3 disabled, and the pressure out of range: the worst a link or a kept
 * tab can carry.
 */
function sessionPastEveryBound(model: RegisteredModel, slot: Slot): Session {
  const past = pastEveryBound(slot, model);
  const written = new Session(model).toWrittenSession();
  return new Session({
    ...written,
    atmosphericPressure: PRESSURE_OUT_OF_RANGE,
    compare: false,
    enabled: [true, false],
    slots: [past, past, past],
  });
}

describe("an arrival by address", () => {
  it("lands a dry-bulb temperature and a dew point both out of range with neither, the dew point cut against the cut dry bulb, and answers that it cut", () => {
    const sender = new Session(pmvPpdIso);
    sender.setHumidityMode(humidityMode.dewPoint);
    const dewPoint = humidityMode.dewPoint.quantity;
    // Below PMV (ISO 7730)'s dry-bulb floor, and a dew point past the bound at that dry bulb and at the floor.
    sender.slots[0].setEntered(q.tdb, 5);
    sender.slots[0].setEntered(dewPoint, 12);
    const entered = sender.slots[0].toSlot();
    const session = new Session(sender.toWrittenSession());

    const cut = session.setAddress(addressOf(sender));

    const landed = heldSlot(session, 0).toSlot();
    expect(cut).toBe(true);
    expect(landed.values.get(q.tdb)).toBe(boundOf(pmvPpdIso, q.tdb, entered).min);
    expect(landed.humidity?.value).toBe(boundOf(pmvPpdIso, dewPoint, landed).max);
    expect(landed.humidity?.value).not.toBe(nearestEnd(12, boundOf(pmvPpdIso, dewPoint, entered)));
    expect(outOfRangeRows(landed, pmvPpdIso, session.atmosphericPressure)).toEqual([]);
    expect(session.pendingSwitch).toBeNull();
  });

  it("cuts the pressure to its bound, and answers that it cut", () => {
    const session = new Session(pmvPpdIso);
    session.atmosphericPressure = PRESSURE_OUT_OF_RANGE;

    const cut = session.setAddress(addressOf(session));

    expect(cut).toBe(true);
    expect(session.atmosphericPressure).toBe(atmosphericPressureRow(PRESSURE_OUT_OF_RANGE)?.bound.min);
  });

  it("with nothing to cut changes nothing, and answers that it cut nothing", () => {
    const session = new Session(pmvPpdIso);
    const before = openedOn(session);

    const cut = session.setAddress(addressOf(session));

    expect(cut).toBe(false);
    expect(openedOn(session)).toEqual(before);
  });

  it("to a model under which a held value is out of range cuts it, compared or not, and answers that it cut", () => {
    const session = new Session(pmvPpdAshrae);
    session.setCompare(true);
    // Past PMV (ISO 7730)'s 30 °C dry-bulb temperature, inside PMV (ASHRAE 55)'s.
    heldSlot(session, 1).setEntered(q.tdb, 35);
    session.setCompare(false);

    const cut = session.setAddress(standardAddress(pmvPpdIso));

    expect(cut).toBe(true);
    expect(session.model).toBe(pmvPpdIso);
    expect(heldSlot(session, 1).values.get(q.tdb)).toBe(boundOf(pmvPpdIso, q.tdb, heldSlot(session, 1)).max);
    expect(session.pendingSwitch).toBeNull();
  });

  it("settles every held slot and the pressure, with every entry past its bound, for every registered model and entry mode", () => {
    for (const model of registeredModels) {
      for (const slot of slotsInEveryEntryMode(model)) {
        const session = sessionPastEveryBound(model, slot);
        const label = `${model.info.label}, ${slot.humidity?.mode.id ?? "no humidity"}`;
        expect(outOfRangeRows(heldSlot(session, 0), model, DEFAULT_ATMOSPHERIC_PRESSURE), label).not.toEqual([]);

        const cut = session.setAddress(standardAddress(model));

        expect(cut, label).toBe(true);
        expect(atmosphericPressureRow(session.atmosphericPressure), label).toBeUndefined();
        for (const held of session.slots) {
          expect(held && outOfRangeRows(held, model, session.atmosphericPressure), label).toEqual([]);
        }
      }
    }
  });
});
