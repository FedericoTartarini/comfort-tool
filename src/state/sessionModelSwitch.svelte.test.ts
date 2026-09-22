/**
 * The model-switch question, split out of `session.svelte.test.ts` when that
 * file passed ADR §6's line band: the bound fixtures, and every case that turns
 * on a value the new model does not accept. What a landing does to the slot
 * stays in the sibling file.
 *
 * The seam is that file's, and nothing flushes for the reason
 * `compute.svelte.test.ts` gives: the outputs are a derivation, so reading one
 * after a change is what recomputes it. The models here are fixtures, not
 * registry entries: each spreads the registered declaration and overrides the
 * one thing it is about.
 */
import { describe, expect, it } from "vitest";
import { outOfRangeRows, type Bound } from "$lib/core/applicability";
import { humidityMode, temperatureMode } from "$lib/core/entryModes";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session } from "./session.svelte";
import { resultValueOf, shapeOf } from "./sessionTestReaders";

const q = quantities;

/**
 * `pmvPpdIso` with some of its applicability bounds replaced, keyed as
 * `info.inputs` keys them. Everything else about the model is the registered
 * one's, because the bounds are the only thing these tests are about.
 */
function withBounds(bounds: Readonly<Record<string, Bound>>): RegisteredModel {
  return {
    ...pmvPpdIso,
    name: `fixture_bounds_${Object.keys(bounds).join("_")}`,
    info: {
      ...pmvPpdIso.info,
      inputs: Object.fromEntries(
        Object.entries(pmvPpdIso.info.inputs).map(([key, variable]) => [
          key,
          key in bounds ? { ...variable, applicability: bounds[key] } : variable,
        ]),
      ),
    },
  };
}

// The slot starts at tdb 25, which each of these puts outside the new model's
// applicability — from above, from below, and by a bound with one end only.
const belowTheSlot = withBounds({ tdb: { min: 10, max: 20 } });
const aboveTheSlot = withBounds({ tdb: { min: 28, max: 40 } });
// clo starts at 0.5, so a minimum of 1 is the one-sided bound; met's maximum
// is removed, so a met of 6 breaks nothing under it.
const oneSidedBounds = withBounds({ clo: { min: 1 }, met: { min: 0.8 } });
// The slot as it stands satisfies this one, so the switch has nothing to ask.
const acceptsTheSlot = withBounds({ tdb: { min: 10, max: 40 } });

/**
 * What requesting a model does when a value the person entered is outside its
 * Applicability (ADR-0002 decision 32, "The session owns the question"): the
 * request changes nothing and leaves the question pending, and the person's
 * answer lands it or drops it. Asserted at the same seam as the rest — a
 * session in, its state and its outputs out — because the dialog renders the
 * pending switch and decides nothing.
 */
describe("Session.requestModel, when the new model does not accept a value", () => {
  it("leaves the model and the slot as they were and holds the question", () => {
    const session = new Session(pmvPpdIso);
    const before = shapeOf(session.slots[0]);

    session.requestModel(belowTheSlot);

    expect(session.model).toBe(pmvPpdIso);
    expect(shapeOf(session.slots[0])).toEqual(before);
    expect(session.pendingSwitch?.model).toBe(belowTheSlot);
  });

  it("lists exactly what the gate reports for the rehearsed slot, with the entered value and the bound", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].values.set(q.clo, 0.5);

    session.requestModel(belowTheSlot);

    expect(session.pendingSwitch?.outOfRangeRows).toEqual([{ quantity: q.tdb, value: 25, bound: { min: 10, max: 20 } }]);
    expect(session.pendingSwitch?.outOfRangeRows).toEqual(outOfRangeRows(session.slots[0], belowTheSlot));
  });

  it("lists the operative temperature against the range both temperatures allow at once", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setTemperatureMode(temperatureMode.operative);
    const operative = session.slots[0].values.get(q.operative_tmp);

    // tdb is 10–20 here and tr is the registered 10–40, so the row is 10–20.
    session.requestModel(belowTheSlot);

    expect(session.pendingSwitch?.outOfRangeRows).toEqual([
      { quantity: q.operative_tmp, value: operative, bound: { min: 10, max: 20 } },
    ]);
  });

  it("gives a one-ended row for a bound with one end, and adjusts only towards it", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].values.set(q.met, 6);

    session.requestModel(oneSidedBounds);

    expect(session.pendingSwitch?.outOfRangeRows).toEqual([{ quantity: q.clo, value: 0.5, bound: { min: 1 } }]);

    session.acceptSwitch();

    expect(session.slots[0].values.get(q.clo)).toBe(1);
    expect(session.slots[0].values.get(q.met)).toBe(6);
  });

  it("moves each listed value to the end of its bound it was beyond, and nothing else", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.slots[0].values.set(q.v, 0.2);
    session.slots[0].setHumidityValue(35);

    session.requestModel(aboveTheSlot);
    session.acceptSwitch();

    expect(session.model).toBe(aboveTheSlot);
    expect(session.pendingSwitch).toBeNull();
    expect(session.slots[0].values.get(q.tdb)).toBe(28);
    expect(session.slots[0].values.get(q.tr)).toBe(25);
    expect(session.slots[0].values.get(q.v)).toBe(0.2);
    expect(session.slots[0].humidity.value).toBe(35);
    expect(outputs.outOfRange).toEqual([]);
    expect(resultValueOf(outputs.perSlot[0], q.pmv)).toBeTypeOf("number");
  });

  it("leaves everything as it was on a decline", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setHumidityMode(humidityMode.dewPoint);
    session.slots[0].setTemperatureMode(temperatureMode.operative);
    const before = shapeOf(session.slots[0]);

    session.requestModel(belowTheSlot);
    session.declineSwitch();

    expect(session.model).toBe(pmvPpdIso);
    expect(session.pendingSwitch).toBeNull();
    expect(shapeOf(session.slots[0])).toEqual(before);
  });

  it("leaves the outputs the current model's while the question is pending", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const before = outputs.perSlot[0];

    session.requestModel(belowTheSlot);

    expect(outputs.perSlot[0]).toBe(before);
    expect(outputs.outOfRange).toEqual([]);
  });

  it("replaces a pending question with the next one asked", () => {
    const session = new Session(pmvPpdIso);

    session.requestModel(belowTheSlot);
    session.requestModel(aboveTheSlot);

    expect(session.pendingSwitch?.model).toBe(aboveTheSlot);
    expect(session.pendingSwitch?.outOfRangeRows).toEqual([{ quantity: q.tdb, value: 25, bound: { min: 28, max: 40 } }]);
  });

  it("drops a pending question when the model asked for is the current one", () => {
    const session = new Session(pmvPpdIso);
    const before = shapeOf(session.slots[0]);

    session.requestModel(belowTheSlot);
    session.requestModel(pmvPpdIso);

    expect(session.pendingSwitch).toBeNull();
    expect(session.model).toBe(pmvPpdIso);
    expect(shapeOf(session.slots[0])).toEqual(before);
  });

  it("asks nothing, and lands, when every entered value is acceptable", () => {
    const session = new Session(pmvPpdIso);

    session.requestModel(acceptsTheSlot);

    expect(session.pendingSwitch).toBeNull();
    expect(session.model).toBe(acceptsTheSlot);
  });

  it("never asks on the address's path: setting adjusts nothing and holds no question", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);

    session.setModel(belowTheSlot);

    expect(session.model).toBe(belowTheSlot);
    expect(session.pendingSwitch).toBeNull();
    expect(session.slots[0].values.get(q.tdb)).toBe(25);
    expect(outputs.outOfRange).toEqual([q.tdb]);
  });

  it("changes the first slot only when the answer is yes", () => {
    const session = new Session(pmvPpdIso);
    const others = session.slots.slice(1).map(shapeOf);

    session.requestModel(belowTheSlot);
    session.acceptSwitch();

    expect(session.slots.slice(1).map(shapeOf)).toEqual(others);
  });
});
