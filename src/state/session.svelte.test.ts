/**
 * What setting a model does to the first slot (ADR-0002 decision 32): the
 * model and a slot it can run on land together. The rehearsal that works the
 * slot out is a pure function in `core/`, but every rule in it is observable
 * from the session, so this is the only seam it is asserted at — a session in,
 * its state and its outputs out, with no component and no router.
 *
 * Nothing flushes, for the reason `compute.svelte.test.ts` gives: the outputs
 * are a derivation, so reading one after a change is what recomputes it.
 *
 * The models here are fixtures, not registry entries. Only one model is
 * registered, and Phase 4 stays a two-file change, so each fixture spreads the
 * registered declaration and overrides the one thing it is about — the prior
 * art is the standard-less fixture in the routes tests and the group-less
 * fixtures in the library-inputs tests.
 */
import { describe, expect, it } from "vitest";
import { humidityMode, temperatureMode } from "$lib/core/entryModes";
import { resultValue } from "$lib/core/libraryInputs";
import type { ModelResult, RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities, type Quantity } from "$lib/core/quantities";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session, type InputSlot } from "./session.svelte";

const q = quantities;

/**
 * A model that takes a quantity the registered one does not, so a slot built
 * for that one never holds it. `run` asks for the extra input first, as a
 * declaration does, which is what makes an unseeded slot throw rather than
 * quietly run without it; the value comes back on the result so a test can
 * read what the slot supplied.
 */
const takesExternalWork = {
  ...pmvPpdIso,
  name: "fixture_external_work",
  inputs: [...pmvPpdIso.inputs, { quantity: q.wme, value: 0.4 }],
  run: (values) => {
    const [wme] = values(q.wme);
    return { ...pmvPpdIso.run(values), wme };
  },
} satisfies RegisteredModel;

/** A model with no temperature entry group: a dry-bulb temperature and no mean radiant one. */
const withoutTemperatureGroup = {
  ...pmvPpdIso,
  name: "fixture_without_mean_radiant",
  inputs: pmvPpdIso.inputs.filter((entry) => entry.quantity !== q.tr),
} satisfies RegisteredModel;

/** Everything a slot holds, as plain data a comparison can be made against. */
function shapeOf(slot: InputSlot) {
  return { values: new Map(slot.values), humidity: slot.humidity, temperature: slot.temperature };
}

/** A value the result table would show, read through the app's own accessor. */
function resultValueOf(result: ModelResult | null, quantity: Quantity) {
  return result === null ? undefined : resultValue(result, quantity);
}

describe("Session.setModel", () => {
  it("seeds a quantity the slot lacks from the new model's default, and the run then completes", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);

    session.setModel(takesExternalWork);

    expect(session.slots[0].values.get(q.wme)).toBe(0.4);
    expect(resultValueOf(outputs.perSlot[0], q.wme)).toBe(0.4);
    expect(resultValueOf(outputs.perSlot[0], q.pmv)).toBeTypeOf("number");
  });

  it("keeps the values already in the slot, whichever model put them there", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].values.set(q.tdb, 22);
    session.slots[0].setHumidityValue(35);

    session.setModel(takesExternalWork);

    expect(session.slots[0].values.get(q.tdb)).toBe(22);
    expect(session.slots[0].values.get(q.tr)).toBe(25);
    expect(session.slots[0].humidity.value).toBe(35);
  });

  it("removes nothing, so setting the first model again finds its values", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].values.set(q.tdb, 22);

    session.setModel(takesExternalWork);
    session.setModel(pmvPpdIso);

    expect(session.model).toBe(pmvPpdIso);
    expect(session.slots[0].values.get(q.tdb)).toBe(22);
    expect(session.slots[0].values.get(q.wme)).toBe(0.4);
  });

  it("converts a slot in operative entry for a model without the temperature entry group", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setTemperatureMode(temperatureMode.operative);
    const operative = session.slots[0].values.get(q.operative_tmp);
    expect(operative).toBeTypeOf("number");

    session.setModel(withoutTemperatureGroup);

    expect(session.slots[0].temperature.mode).toBe(temperatureMode.separate);
    expect(session.slots[0].values.get(q.tdb)).toBe(operative);
    expect(session.slots[0].values.get(q.tr)).toBe(operative);
  });

  it("leaves a slot in operative entry alone for a model that has the temperature entry group", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setTemperatureMode(temperatureMode.operative);

    session.setModel(takesExternalWork);

    expect(session.slots[0].temperature.mode).toBe(temperatureMode.operative);
    expect(session.slots[0].values.has(q.tdb)).toBe(false);
    expect(session.slots[0].values.has(q.tr)).toBe(false);
  });

  it("adjusts nothing: an out-of-range value stays as entered and is what the gate names", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    // 35 °C is past ISO 7730's 30 °C, which both fixtures inherit.
    session.slots[0].values.set(q.tdb, 35);

    session.setModel(takesExternalWork);

    expect(session.slots[0].values.get(q.tdb)).toBe(35);
    expect(outputs.outOfRange).toEqual([q.tdb]);
  });

  it("seeds no humidity default, whatever representation the slot keeps it in", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setHumidityMode(humidityMode.dewPoint);
    const entered = session.slots[0].humidity;

    session.setModel(takesExternalWork);

    expect(session.slots[0].humidity).toEqual(entered);
    expect(session.slots[0].values.has(q.rh)).toBe(false);
  });

  it("rehearses the first slot only", () => {
    const session = new Session(pmvPpdIso);
    const others = session.slots.slice(1).map(shapeOf);

    session.setModel(takesExternalWork);

    expect(session.slots.slice(1).map(shapeOf)).toEqual(others);
    expect(session.slots[1].values.has(q.wme)).toBe(false);
  });
});
