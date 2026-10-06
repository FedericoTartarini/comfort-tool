/**
 * The share link's codec at the core seam (ADR-0002 decision 63, rules 1, 6
 * and 10): a written session in, a text out, and back. Every expected value
 * is the app's own object: the written session before the round trip is the
 * one expected after it. No expected text is written out but the prefix, so
 * the encoding may change until the format is frozen (rule 9); a refused text
 * is a valid one changed in one place, read and written again through Node's
 * own URL-safe Base64, so its edits name rule 1's members.
 */
import { describe, expect, it } from "vitest";
import { registeredModels } from "$lib/models";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { addEdge, moveEdge, setColor, setLabel } from "./bands";
import { chartType } from "./chartType";
import { airSpeedMode, clothingMode, humidityMode, temperatureMode } from "./entryModes";
import type { RegisteredModel } from "./modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "./quantities";
import { toText, toWrittenSession, type DecodedSession } from "./shareLink";
import {
  startingSlot,
  withAirSpeedMode,
  withClothingMode,
  withEnteredValues,
  withHumidityMode,
  withOption,
  withTemperatureMode,
  type Slot,
} from "./slot";
import { unitSystem } from "./unitSystem";
import { startingChartSettings, startingSession, type ChartSettings, type WrittenSession } from "./writtenSession";

const q = quantities;
const PREFIX = "v1.";
/** A pressure below the bound's 30 000 Pa (ADR-0002 decision 49). */
const PRESSURE_OUT_OF_RANGE = 20000;

/** `session` written out and read back, with the registry the app has. */
function roundTrip(session: WrittenSession): DecodedSession | undefined {
  return toWrittenSession(toText(session, registeredModels), registeredModels);
}

/** `slot` on `model` in every entry group's other mode: operative, relative air speed, dynamic clothing, dew point. */
function inOtherEntryModes(slot: Slot, model: RegisteredModel): Slot {
  const operative = withTemperatureMode(slot, temperatureMode.operative, model);
  const corrected = withClothingMode(withAirSpeedMode(operative, airSpeedMode.corrected), clothingMode.corrected, model);
  return withHumidityMode(corrected, humidityMode.dewPoint, DEFAULT_ATMOSPHERIC_PRESSURE);
}

/** A Band list label outside Latin-1. */
const FAR_LABEL = "很冷 ❄️";

/**
 * A session on PMV (ASHRAE 55) with three slots, slot 3 held and disabled,
 * Compare on, every entry group off its default mode, an option ticked, a
 * value of many decimals, a value and the pressure out of range, IP, and
 * edited chart settings on PMV (ASHRAE 55) and PMV (ISO 7730), the second
 * with a label outside Latin-1 and a band with no colour, beside Adaptive's
 * defaults.
 */
function editedSession(): WrittenSession {
  const model = pmvPpdAshrae;
  const [airSpeedControl] = model.options;
  const first = withEnteredValues(inOtherEntryModes(startingSlot(model), model), new Map([[q.met, 1.2345678901234567]]));
  // Past PMV (ASHRAE 55)'s 30 °C: the gate closes on slot 2.
  const second = withOption(withEnteredValues(first, new Map([[q.operative_tmp, 60]])), airSpeedControl, true);
  const third = withEnteredValues(first, new Map([[q.met, 1.4]]));
  const ashraeBands = startingChartSettings(pmvPpdAshrae).bands;
  const isoBands = startingChartSettings(pmvPpdIso).bands;
  if (!ashraeBands || !isoBands) {
    throw new Error("Both PMV models scan");
  }
  const charts = new Map<RegisteredModel, ChartSettings>([
    [pmvPpdAshrae, { type: chartType.dynamic, axes: { x: q.tdb, y: q.rh }, bands: moveEdge(setColor(ashraeBands, 1, "#00FF7f"), 3, 0.4) }],
    [pmvPpdIso, { type: chartType.dynamic, axes: { x: q.met, y: q.v }, bands: setColor(setLabel(addEdge(isoBands, 2, pmvPpdIso.scan.classifier), 0, FAR_LABEL), 4, undefined) }],
    [adaptiveAshrae, startingChartSettings(adaptiveAshrae)],
  ]);
  return {
    model,
    unitSystem: unitSystem.ip,
    atmosphericPressure: PRESSURE_OUT_OF_RANGE,
    compare: true,
    enabled: [true, false],
    slots: [first, second, third],
    charts,
  };
}

describe("toText and toWrittenSession", () => {
  it("are the identity on every registered model's defaults", () => {
    for (const model of registeredModels) {
      expect(roundTrip(startingSession(model)), model.info.label).toEqual({ session: startingSession(model), exact: true });
    }
  });

  it("are the identity on an edited session: three slots, every entry group's other mode, an option, values and the pressure out of range, two models' edited Band lists", () => {
    const session = editedSession();
    const back = roundTrip(session)?.session;
    expect(roundTrip(session)).toEqual({ session, exact: true });
    expect(back?.slots[0].values.get(q.met)).toBe(1.2345678901234567);
    expect(back?.charts.get(pmvPpdIso)?.bands?.labels[0]).toBe(FAR_LABEL);
    expect(back?.charts.get(pmvPpdIso)?.bands?.colors[4]).toBeUndefined();
  });

  it("are the identity on a session in every entry group's other mode that has been on every registered model, each on its starting chart", () => {
    const session = editedSession();
    const charts = new Map(session.charts);
    for (const model of registeredModels) {
      if (!charts.has(model)) {
        charts.set(model, startingChartSettings(model));
      }
    }
    expect(roundTrip({ ...session, charts })).toEqual({ session: { ...session, charts }, exact: true });
  });

  it("are the identity on a session that has left a model for one without its entry groups", () => {
    const session = editedSession();
    const seeded = (slot: Slot) => withEnteredValues(slot, new Map([[q.t_running_mean, 20]]));
    const [first, second, third] = session.slots;
    const onAdaptive: WrittenSession = {
      ...session,
      model: adaptiveAshrae,
      slots: [seeded(first), second && seeded(second), third && seeded(third)],
    };
    expect(roundTrip(onAdaptive)).toEqual({ session: onAdaptive, exact: true });
  });

  it("write a text that starts with the prefix and holds only URL-safe characters", () => {
    for (const session of [editedSession(), ...registeredModels.map(startingSession)]) {
      const text = toText(session, registeredModels);
      expect(text.startsWith(PREFIX)).toBe(true);
      expect(text.slice(PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

/** The JSON a text writes, read by Node's own URL-safe Base64 rather than the codec's. */
function jsonOf(text: string): unknown {
  return JSON.parse(Buffer.from(text.slice(PREFIX.length), "base64url").toString("utf8"));
}

/** `json` written as a text by Node's own URL-safe Base64. */
function textOf(json: string): string {
  return PREFIX + Buffer.from(json).toString("base64url");
}

type Path = readonly (string | number)[];

/** `text` with the member at `path` set to `value`, or removed for `undefined`. */
function changed(text: string, path: Path, value: unknown): string {
  const json = jsonOf(text);
  const parent = path.slice(0, -1).reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], json);
  const member = path[path.length - 1];
  if (value === undefined) {
    delete (parent as Record<string | number, unknown>)[member];
  } else {
    (parent as Record<string | number, unknown>)[member] = value;
  }
  return textOf(JSON.stringify(json));
}

describe("toWrittenSession", () => {
  const valid = toText(editedSession(), registeredModels);
  const ashrae = pmvPpdAshrae.info.name;
  const [airSpeedControl] = pmvPpdAshrae.options;
  const read = (text: string) => toWrittenSession(text, registeredModels);
  const values = ["slots", 0, "values"];
  /** PMV (ASHRAE 55)'s declared default of `quantity`. */
  const declared = (quantity: Quantity) => pmvPpdAshrae.inputs.find((input) => input.quantity === quantity)?.value;

  it("reads a valid text through another Base64 encoder as it reads the codec's own", () => {
    expect(read(textOf(JSON.stringify(jsonOf(valid))))).toEqual({ session: editedSession(), exact: true });
  });

  it("reads a text whose members are in another order as exact", () => {
    const reversed = JSON.stringify(jsonOf(valid), (key, value: unknown) =>
      typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value,
    );
    expect(reversed).not.toBe(JSON.stringify(jsonOf(valid)));
    expect(read(textOf(reversed))).toEqual({ session: editedSession(), exact: true });
  });

  it("refuses another prefix", () => {
    const body = valid.slice(PREFIX.length);
    for (const text of [`v2.${body}`, `v1z.${body}`, body]) {
      expect(read(text), text.slice(0, 4)).toBeUndefined();
    }
  });

  it("refuses Base64 that does not parse, bytes that are not UTF-8, and JSON that does not parse", () => {
    expect(read(`${valid}*`)).toBeUndefined();
    expect(read(`${valid}=`)).toBeUndefined();
    // Classic Base64's characters and whitespace, which `atob` alone would take.
    expect(read(`${valid.slice(0, 10)} ${valid.slice(10)}`)).toBeUndefined();
    const classic = valid.replace(/-/g, "+").replace(/_/g, "/");
    expect(classic).not.toBe(valid);
    expect(read(classic)).toBeUndefined();
    expect(read(`${PREFIX}A`)).toBeUndefined();
    expect(read(`${PREFIX}${Buffer.from([0xff, 0xfe]).toString("base64url")}`)).toBeUndefined();
    expect(read(textOf(JSON.stringify(jsonOf(valid)).slice(0, -1)))).toBeUndefined();
    expect(read(PREFIX)).toBeUndefined();
  });

  it("refuses a member rule 1 requires, missing or mistyped", () => {
    expect(read(changed(valid, ["compare"], undefined))).toBeUndefined();
    expect(read(changed(valid, ["compare"], "true"))).toBeUndefined();
    expect(read(changed(valid, ["enabled"], [true]))).toBeUndefined();
    expect(read(changed(valid, ["slots"], [jsonOf(valid)]))).toBeUndefined();
    expect(read(changed(valid, ["slots", 0, "options"], undefined))).toBeUndefined();
    expect(read(changed(valid, ["charts", ashrae, "axes"], undefined))).toBeUndefined();
    expect(read(changed(valid, ["charts", ashrae, "bands", "colors", 0], 5))).toBeUndefined();
  });

  it("refuses a model name, unit system, entry mode or chart type the app does not have", () => {
    expect(read(changed(valid, ["model"], "pmv_ppd"))).toBeUndefined();
    expect(read(changed(valid, ["unitSystem"], "metric"))).toBeUndefined();
    expect(read(changed(valid, ["entryModes", "temperature"], "mixed"))).toBeUndefined();
    expect(read(changed(valid, ["entryModes", "humidity"], "absolute-humidity"))).toBeUndefined();
    expect(read(changed(valid, ["charts", ashrae, "type"], "contour"))).toBeUndefined();
  });

  it("refuses a chart type the model does not declare, and an axis it does not offer", () => {
    expect(read(changed(valid, ["charts", ashrae, "type"], chartType.adaptive.id))).toBeUndefined();
    expect(read(changed(valid, ["charts", ashrae, "axes", "x"], q.t_running_mean.key))).toBeUndefined();
    expect(read(changed(valid, ["charts", ashrae, "axes", "y"], q.pmv.key))).toBeUndefined();
  });

  it("refuses a value that is not a finite number", () => {
    const json = JSON.stringify(jsonOf(valid));
    const met = `"${q.met.key}":${editedSession().slots[0].values.get(q.met)}`;
    expect(json).toContain(met);
    expect(read(textOf(json.replace(met, `"${q.met.key}":1e999`)))).toBeUndefined();
    expect(read(changed(valid, [...values, q.met.key], null))).toBeUndefined();
    expect(read(changed(valid, [...values, q.met.key], "1.2"))).toBeUndefined();
    expect(read(changed(valid, [q.p_atm.key], null))).toBeUndefined();
    expect(read(changed(valid, ["charts", ashrae, "bands", "edges", 0], null))).toBeUndefined();
  });

  it("refuses a humidity mode written with a slot that holds no humidity value", () => {
    expect(read(changed(valid, ["slots", 2, "values", q.dew_point_tmp.key], undefined))).toBeUndefined();
  });

  it("refuses slot 1 nothing, and an enabled slot nothing", () => {
    expect(read(changed(valid, ["slots", 0], null))).toBeUndefined();
    expect(read(changed(valid, ["slots", 1], null))).toBeUndefined();
    expect(read(changed(changed(valid, ["slots", 2], null), ["enabled", 1], true))).toBeUndefined();
  });

  it("takes a disabled slot nothing, an entered value outside its bound and a pressure out of range, as written", () => {
    expect(read(changed(valid, ["slots", 2], null))?.session.slots[2]).toBeNull();
    expect(read(changed(valid, [...values, q.met.key], 100))?.session.slots[0].values.get(q.met)).toBe(100);
    expect(read(changed(valid, [q.p_atm.key], 1))?.session.atmosphericPressure).toBe(1);
    for (const text of [changed(valid, ["slots", 2], null), changed(valid, [...values, q.met.key], 100), changed(valid, [q.p_atm.key], 1)]) {
      expect(read(text)?.exact).toBe(true);
    }
  });

  it("drops a key the app does not read, and says the session is not exact", () => {
    const dropped = [
      changed(valid, ["page"], "explore"),
      changed(valid, ["charts", adaptiveAshrae.info.name, "axes"], { x: q.tdb.key, y: q.rh.key }),
      changed(valid, ["charts", "pmv_ppd"], { type: chartType.dynamic.id }),
      changed(valid, ["slots", 1, "options", "pmv_ppd"], { airspeed_control: true }),
      changed(valid, ["slots", 1, "options", ashrae, "airspeed"], true),
      changed(valid, [...values, "tmp"], 25),
      // No registered model enters these, or none under the text's entry modes.
      ...[q.wme, q.pmv, q.tdb, q.tr, q.v, q.clo, q.rh, q.hr].map((quantity) => changed(valid, [...values, quantity.key], 1)),
    ];
    for (const text of dropped) {
      expect(read(text)).toEqual({ session: editedSession(), exact: false });
    }
  });

  it("starts a value or option a slot lacks at the model's default, and says the session is not exact", () => {
    const met = read(changed(valid, ["slots", 1, "values", q.met.key], undefined));
    expect(met?.session.slots[1]?.values.get(q.met)).toBe(declared(q.met));
    expect(met?.exact).toBe(false);
    // Under relative air speed entry the slot holds the air speed's default as `vr`, as a switch seeds it.
    expect(read(changed(valid, ["slots", 2, "values", q.vr.key], undefined))?.session.slots[2]?.values.get(q.vr)).toBe(declared(q.v));
    const options = read(changed(valid, ["slots", 1, "options"], {}));
    expect(options?.session.slots[1]?.options.get(airSpeedControl)).toBe(airSpeedControl.default);
    expect(options?.exact).toBe(false);
  });

  it("puts an entry group the text lacks in its default mode, and a humidity the text lacks at the model's default", () => {
    const temperature = read(changed(valid, ["entryModes", "temperature"], undefined));
    const [first] = temperature?.session.slots ?? [];
    expect(first?.temperature.mode).toBe(temperatureMode.separate);
    // The operative entry is of the other mode, so it is dropped, and the separate temperatures start at their defaults.
    expect(first?.values.has(q.operative_tmp)).toBe(false);
    expect(first?.values.get(q.tdb)).toBe(declared(q.tdb));
    expect(temperature?.exact).toBe(false);
    const humidity = read(changed(valid, ["entryModes", "humidity"], undefined));
    for (const slot of humidity?.session.slots ?? []) {
      expect(slot?.humidity).toEqual({ mode: humidityMode.rh, value: declared(q.rh) });
    }
    expect(humidity?.exact).toBe(false);
  });
});
