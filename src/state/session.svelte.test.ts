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
 * Each fixture here spreads PMV (ISO 7730)'s declaration and overrides the one
 * thing it is about; the options block uses the registered PMV (ASHRAE 55)
 * itself.
 *
 * A request the new model cannot accept every value of is the sibling
 * `sessionModelSwitch.svelte.test.ts`'s; here every request lands.
 */
import { describe, expect, it } from "vitest";
import { chartType } from "$lib/core/chartType";
import { humidityMode, temperatureMode, type HumidityMode } from "$lib/core/entryModes";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "$lib/core/quantities";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session, type InputSlot } from "./session.svelte";
import { resultValueOf, sessionComparingThreeSlots, shapeOf } from "./sessionTestReaders";

const q = quantities;

/**
 * A model that takes a quantity PMV (ISO 7730) does not, so a slot built for
 * that one never holds it. `run` reads the extra input first, which is
 * what makes an unseeded slot throw rather than quietly run without it; the
 * value comes back on the result so a test can read what the slot supplied.
 */
const takesExternalWork = {
  ...pmvPpdIso,
  info: { ...pmvPpdIso.info, name: "fixture_external_work" },
  inputs: [...pmvPpdIso.inputs, { quantity: q.wme, value: 0.4 }],
  run: (values) => {
    const wme = values.wme;
    return { ...pmvPpdIso.run(values), wme };
  },
} satisfies RegisteredModel;

/** A model with no temperature entry group: a dry-bulb temperature and no mean radiant one. */
const withoutTemperatureGroup = {
  ...pmvPpdIso,
  info: { ...pmvPpdIso.info, name: "fixture_without_mean_radiant" },
  inputs: pmvPpdIso.inputs.filter((entry) => entry.quantity !== q.tr),
} satisfies RegisteredModel;

/**
 * The option PMV (ASHRAE 55) reads through `run`'s second reader. With it off,
 * an air speed above what the standard allows the room comes back as a broken
 * row on the result, which is how a test sees the option reach the call.
 */
const [airSpeedControl] = pmvPpdAshrae.options;

/** A model that declares a relative humidity other than the 50 every registered model declares. */
const declaresDrierAir = {
  ...pmvPpdIso,
  info: { ...pmvPpdIso.info, name: "fixture_declares_drier_air" },
  inputs: pmvPpdIso.inputs.map((entry) => (entry.quantity === q.rh ? { ...entry, value: 40 } : entry)),
} satisfies RegisteredModel;

/**
 * A slot holds a humidity only once a declaration's default or the person
 * wrote one (ADR-0002 decision 32): a session opened on a model without
 * humidity holds none, and the next model's declared default is what a
 * switch seeds, by either path.
 */
describe("the humidity entry", () => {
  it("is held by no slot of a session opened on a model without the humidity entry group", () => {
    const session = sessionComparingThreeSlots(adaptiveAshrae);

    expect(session.slots.map((slot) => slot?.humidity)).toEqual([undefined, undefined, undefined]);
    expect(session.slots).not.toContain(null);
  });

  it("starts at the declared relative humidity, with temperatures in separate entry", () => {
    const session = new Session(declaresDrierAir);

    expect(session.slots[0].humidity).toEqual({ mode: humidityMode.rh, value: 40 });
    expect(session.slots[0].temperature.mode).toBe(temperatureMode.separate);
  });

  for (const act of ["setModel", "requestModel"] as const) {
    it(`is seeded from the new model's declared default into a slot that holds none, by ${act}`, () => {
      const session = new Session(adaptiveAshrae);

      session[act](declaresDrierAir);

      expect(session.model).toBe(declaresDrierAir);
      expect(session.slots[0].humidity).toEqual({ mode: humidityMode.rh, value: 40 });
    });
  }
});

describe("Session.setModel", () => {
  it("seeds a quantity the slot lacks from the new model's default, and the run then completes", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);

    session.setModel(takesExternalWork);

    expect(session.slots[0].values.get(q.wme)).toBe(0.4);
    expect(resultValueOf(outputs.slots[0].result, q.wme)).toBe(0.4);
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBeTypeOf("number");
  });

  it("keeps the values already in the slot, whichever model put them there", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setEntered(q.tdb, 22);
    session.slots[0].setEntered(q.rh, 35);

    session.setModel(takesExternalWork);

    expect(session.slots[0].values.get(q.tdb)).toBe(22);
    expect(session.slots[0].values.get(q.tr)).toBe(25);
    expect(session.slots[0].humidity?.value).toBe(35);
  });

  it("removes nothing, so setting the first model again finds its values", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setEntered(q.tdb, 22);

    session.setModel(takesExternalWork);
    session.setModel(pmvPpdIso);

    expect(session.model).toBe(pmvPpdIso);
    expect(session.slots[0].values.get(q.tdb)).toBe(22);
    expect(session.slots[0].values.get(q.wme)).toBe(0.4);
  });

  it("converts a slot in operative entry for a model without the temperature entry group", () => {
    const session = new Session(pmvPpdIso);
    session.setTemperatureMode(temperatureMode.operative);
    const operative = session.slots[0].values.get(q.operative_tmp);
    expect(operative).toBeTypeOf("number");

    session.setModel(withoutTemperatureGroup);

    expect(session.slots[0].temperature.mode).toBe(temperatureMode.separate);
    expect(session.slots[0].values.get(q.tdb)).toBe(operative);
    expect(session.slots[0].values.get(q.tr)).toBe(operative);
  });

  it("leaves a slot in operative entry alone for a model that has the temperature entry group", () => {
    const session = new Session(pmvPpdIso);
    session.setTemperatureMode(temperatureMode.operative);

    session.setModel(takesExternalWork);

    expect(session.slots[0].temperature.mode).toBe(temperatureMode.operative);
    expect(session.slots[0].values.has(q.tdb)).toBe(false);
    expect(session.slots[0].values.has(q.tr)).toBe(false);
  });

  it("adjusts nothing: an out-of-range value stays as entered and is what the gate names", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    // 35 °C is past ISO 7730's 30 °C, which both fixtures inherit.
    session.slots[0].setEntered(q.tdb, 35);

    session.setModel(takesExternalWork);

    expect(session.slots[0].values.get(q.tdb)).toBe(35);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.tdb]);
  });

  it("keeps a held humidity in the mode it was entered in, across a model without humidity and back", () => {
    const session = new Session(pmvPpdIso);
    session.setHumidityMode(humidityMode.dewPoint);
    const entered = session.slots[0].humidity;

    session.setModel(adaptiveAshrae);
    expect(session.slots[0].humidity).toEqual(entered);
    session.setModel(takesExternalWork);

    expect(session.slots[0].humidity).toEqual(entered);
    expect(session.slots[0].values.has(q.rh)).toBe(false);
  });
});

/**
 * What requesting a model does (ADR-0002 decision 32, "The session owns the
 * question"). A request is the act the app's own controls perform; the address
 * sets. No question is asked yet, so here a request always lands, and what is
 * asserted is that it lands whole: the model and a slot it can run on at once.
 */
describe("Session.requestModel", () => {
  it("lands the model and the rehearsed slot together", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setEntered(q.tdb, 22);

    session.requestModel(takesExternalWork);

    expect(session.model).toBe(takesExternalWork);
    expect(session.slots[0].values.get(q.wme)).toBe(0.4);
    expect(session.slots[0].values.get(q.tdb)).toBe(22);
  });

  it("converts the entry mode the model asks for", () => {
    const session = new Session(pmvPpdIso);
    session.setTemperatureMode(temperatureMode.operative);
    const operative = session.slots[0].values.get(q.operative_tmp);

    session.requestModel(withoutTemperatureGroup);

    expect(session.slots[0].temperature.mode).toBe(temperatureMode.separate);
    expect(session.slots[0].values.get(q.tdb)).toBe(operative);
    expect(session.slots[0].values.get(q.tr)).toBe(operative);
  });

  it("keeps a held humidity in the mode it was entered in, across a model without humidity and back", () => {
    const session = new Session(pmvPpdIso);
    session.setHumidityMode(humidityMode.dewPoint);
    const entered = session.slots[0].humidity;

    session.requestModel(adaptiveAshrae);
    expect(session.model).toBe(adaptiveAshrae);
    expect(session.slots[0].humidity).toEqual(entered);
    session.requestModel(takesExternalWork);

    expect(session.model).toBe(takesExternalWork);
    expect(session.slots[0].humidity).toEqual(entered);
    expect(session.slots[0].values.has(q.rh)).toBe(false);
  });

  /**
   * The landing is atomic, asserted as the spec words it: what the outputs
   * hold belongs to the model they name. Only the requested model returns
   * `wme`, and only the rehearsed slot has one to return — so the previous
   * model never ran on the next one's slot, and the next model never ran on a
   * slot that was not ready for it.
   */
  it("holds a result the model it names could have produced", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    expect(resultValueOf(outputs.slots[0].result, q.wme)).toBeUndefined();

    session.requestModel(takesExternalWork);

    expect(resultValueOf(outputs.slots[0].result, q.wme)).toBe(0.4);
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBeTypeOf("number");
  });

  it("does nothing when the model is already the current one", () => {
    const session = new Session(pmvPpdIso);
    const before = shapeOf(session.slots[0]);
    const chart = session.chart;

    session.requestModel(pmvPpdIso);

    expect(session.model).toBe(pmvPpdIso);
    expect(session.chart).toBe(chart);
    expect(shapeOf(session.slots[0])).toEqual(before);
  });
});

/**
 * What a slot does with a model's options (ADR-0002 decision 36). They are a
 * superset bag like the values: a switch seeds what the new model declares
 * and the slot lacks, and removes nothing. An option has no range, so no
 * switch ever asks about one.
 */
describe("options", () => {
  it("start at their defaults in a slot built for the model", () => {
    const session = new Session(pmvPpdAshrae);

    expect(session.slots[0].options.get(airSpeedControl)).toBe(airSpeedControl.default);
  });

  it("are set on the slot like a value, and the outputs follow", () => {
    const session = new Session(pmvPpdAshrae);
    const outputs = new Outputs(session);
    // 0.8 m/s at 25 °C is past what ASHRAE 55 allows occupants without control.
    session.slots[0].setEntered(q.v, 0.8);
    expect(outputs.slots[0].violations.map((violation) => violation.quantity)).toContain(q.v);

    session.slots[0].setOption(airSpeedControl, true);

    expect(outputs.slots[0].violations).toEqual([]);
  });

  it("seed an option the slot lacks at its default on a switch", () => {
    const session = new Session(pmvPpdIso);
    expect(session.slots[0].options.size).toBe(0);

    session.setModel(pmvPpdAshrae);

    expect(session.slots[0].options.get(airSpeedControl)).toBe(airSpeedControl.default);
  });

  it("are kept across a switch away and back, as they were left", () => {
    const session = new Session(pmvPpdAshrae);
    session.slots[0].setOption(airSpeedControl, true);

    session.setModel(pmvPpdIso);
    expect(session.slots[0].options.get(airSpeedControl)).toBe(true);
    session.setModel(pmvPpdAshrae);

    expect(session.slots[0].options.get(airSpeedControl)).toBe(true);
  });

  it("are never asked about: a request that changes only an option lands", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setOption(airSpeedControl, true);

    session.requestModel(pmvPpdAshrae);

    expect(session.pendingSwitch).toBeNull();
    expect(session.model).toBe(pmvPpdAshrae);
    expect(session.slots[0].options.get(airSpeedControl)).toBe(true);
  });
});

/** A model whose one chart is drawn from polygons, on operative temperature against air speed. */
const drawsPolygons = {
  ...pmvPpdIso,
  info: { ...pmvPpdIso.info, name: "fixture_polygons_chart" },
  charts: [
    {
      type: chartType.dynamic,
      axes: { x: q.operative_tmp, y: q.v },
      comfortZones: () => [{ label: "Acceptable", x: [20, 30, 30], y: [0, 0, 1] }],
    },
  ],
} satisfies RegisteredModel;

/**
 * A polygons chart's axes are locked (ADR-0002 decision 37): the picker is not
 * offered, and a request to move an axis changes nothing the chart draws.
 */
describe("the axes of a polygons chart", () => {
  it("do not move when an axis is set", () => {
    const session = new Session(drawsPolygons);
    const outputs = new Outputs(session);

    session.chart.setAxes({ x: q.clo, y: q.met });

    expect(session.chart.axes).toEqual({ x: q.operative_tmp, y: q.v });
    expect(outputs.chart?.layout.x.title).toContain(q.operative_tmp.label);
    expect(outputs.chart?.layout.y.title).toContain(q.v.label);
  });

  it("stay operative under separate entry", () => {
    const session = new Session(drawsPolygons);
    const outputs = new Outputs(session);

    expect(session.slots[0].temperature.mode).toBe(temperatureMode.separate);
    expect(outputs.chart?.layout.x.title).toContain(q.operative_tmp.label);
  });
});

/**
 * Every write to a slot is a core function whose answer the slot lands: a
 * value the panel commits goes where core puts it, humidity included.
 */
describe("InputSlot.setEntered", () => {
  it("enters the humidity entry's quantity as the entry, in its own mode, and the outputs follow", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.setHumidityMode(humidityMode.dewPoint);
    const before = resultValueOf(outputs.slots[0].result, q.pmv);

    session.slots[0].setEntered(q.dew_point_tmp, 12);

    expect(session.slots[0].humidity).toEqual({ mode: humidityMode.dewPoint, value: 12 });
    expect(session.slots[0].values.has(q.dew_point_tmp)).toBe(false);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).not.toBe(before);
  });
});

/**
 * Type-level proof that nothing outside the slot writes into its maps or its
 * two entries, compiled by `npm run check` and never called: each
 * `@ts-expect-error` fails the build the day the compiler stops refusing that
 * write. Exported only because `noUnusedLocals` would otherwise flag it.
 */
export function slotWritesTypeProof(slot: InputSlot): void {
  // @ts-expect-error an entered value written past `setEntered`
  slot.values.set(q.tdb, 22);
  // @ts-expect-error an option written past `setOption`
  slot.options.set(airSpeedControl, true);
  // @ts-expect-error a humidity entry written past `setEntered` and the session's `setHumidityMode`
  slot.humidity = { mode: humidityMode.rh, value: 50 };
  // @ts-expect-error a temperature entry written past the session's `setTemperatureMode`
  slot.temperature = { mode: temperatureMode.operative };
}

/**
 * A humidity-mode change re-expresses the entered humidity at the slot's
 * dry-bulb temperature: the old mode's value as `rh`, then `rh` in the new
 * mode. Walked through every mode from a humidity that is not the default, so
 * each conversion runs on a value the one before it produced.
 */
describe("Session.setHumidityMode", () => {
  const walk = [...Object.values(humidityMode).filter((mode) => mode !== humidityMode.rh), humidityMode.rh];

  /** The values the walk should enter, each mode's own conversions composed at `tdb`. */
  function expectedWalk(rh: number, tdb: number): number[] {
    let mode: HumidityMode = humidityMode.rh;
    let value = rh;
    return walk.map((next) => {
      value = next.fromRelativeHumidity(mode.toRelativeHumidity(value, tdb, DEFAULT_ATMOSPHERIC_PRESSURE), tdb, DEFAULT_ATMOSPHERIC_PRESSURE);
      mode = next;
      return value;
    });
  }

  /** The value slot 1 holds after each change of the walk. */
  function walkedValues(session: Session): (number | undefined)[] {
    return walk.map((mode) => {
      session.setHumidityMode(mode);
      return session.slots[0].humidity?.value;
    });
  }

  it("converts at the entered dry-bulb temperature under separate entry", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setEntered(q.tdb, 27);
    session.slots[0].setEntered(q.rh, 35);

    expect(walkedValues(session)).toEqual(expectedWalk(35, 27));
    expect(session.slots[0].humidity?.mode).toBe(humidityMode.rh);
  });

  it("converts at the operative temperature under operative entry", () => {
    const session = new Session(pmvPpdIso);
    session.setTemperatureMode(temperatureMode.operative);
    session.slots[0].setEntered(q.operative_tmp, 22);
    session.slots[0].setEntered(q.rh, 35);

    expect(walkedValues(session)).toEqual(expectedWalk(35, 22));
  });
});
