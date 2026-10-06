/**
 * The share link's codec (ADR-0002 decision 63, rules 1, 6, 9 and 10): a
 * written session as one text, `v1.` followed by the URL-safe Base64 of its
 * JSON in UTF-8, and a text as a written session again, or nothing. The JSON's
 * shape is rule 1's, example included.
 *
 * The one module where the session's strings are read and written: a model's
 * name, the unit system's, entry modes' and chart types' ids, quantity keys
 * and option keys. An id is looked up here, privately, by walking its closed
 * set. The registry is the caller's; the codec reads declarations and the
 * entry-group table, and names no model and no entry group.
 *
 * A text is taken whole or not at all (rule 6): there is no partial answer
 * and no default for a field. An entered value outside its bound and a
 * pressure out of range are not refused; the gate marks them. Until the app is
 * deployed the format may change, and a text an earlier build wrote may be
 * refused (rule 9).
 */
import type { ClassifierBins } from "jsthermalcomfort";
import { bandListFrom } from "./bands";
import { dynamicAxisQuantities } from "./charts/dynamicChart";
import { humidityMode, type HumidityMode, type ValueEntryMode } from "./entryModes";
import { dynamicChartOf, hasHumidityGroup, type OptionSpec, type RegisteredModel } from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";
import {
  defaultEntryModes,
  isHumidityQuantity,
  underEntryModes,
  valueEntryGroups,
  type Slot,
  type ValueEntryModes,
} from "./slot";
import { unitSystem } from "./unitSystem";
import type { ChartSettings, WrittenSession } from "./writtenSession";

const PREFIX = "v1.";

/** Every field of the entry modes held among the values, so a new entry group is written without a line here. */
const entryModeFields = Object.keys(defaultEntryModes) as (keyof ValueEntryModes)[];

/** `session` written out as a text, its options grouped under the model in `models` that declares each. */
export function toText(session: WrittenSession, models: readonly RegisteredModel[]): string {
  const [first] = session.slots;
  const entryModes: Record<string, string> = Object.fromEntries(entryModeFields.map((field) => [field, first[field].mode.id]));
  if (first.humidity) {
    entryModes.humidity = first.humidity.mode.id;
  }
  const json = {
    model: session.model.info.name,
    unitSystem: session.unitSystem.id,
    [quantities.p_atm.key]: session.atmosphericPressure,
    compare: session.compare,
    enabled: session.enabled,
    entryModes,
    slots: session.slots.map((slot) => slot && slotJson(slot, models)),
    charts: Object.fromEntries([...session.charts].map(([model, settings]) => [model.info.name, chartJson(settings)])),
  };
  return PREFIX + toBase64Url(JSON.stringify(json));
}

/**
 * The written session `text` holds, its names looked up in `models`, or
 * `undefined` for a text refused: one that is not rule 1's whole, or that
 * names anything the app does not have.
 */
export function toWrittenSession(text: string, models: readonly RegisteredModel[]): WrittenSession | undefined {
  try {
    return sessionFrom(jsonOf(text), models);
  } catch (error) {
    if (error instanceof Refused) {
      return undefined;
    }
    throw error;
  }
}

function slotJson(slot: Slot, models: readonly RegisteredModel[]) {
  const values: Record<string, number> = Object.fromEntries([...slot.values].map(([quantity, value]) => [quantity.key, value]));
  if (slot.humidity) {
    values[slot.humidity.mode.quantity.key] = slot.humidity.value;
  }
  const options: Record<string, Record<string, boolean>> = {};
  for (const [option, value] of slot.options) {
    const name = ownerOf(option, models).info.name;
    options[name] = { ...options[name], [option.key]: value };
  }
  return { values, options };
}

/** The model in `models` that declares `option`; a slot holds no other. */
function ownerOf(option: OptionSpec, models: readonly RegisteredModel[]): RegisteredModel {
  const owner = models.find((model) => model.options.includes(option));
  if (!owner) {
    throw new Error(`No registered model declares the option ${option.label}`);
  }
  return owner;
}

function chartJson({ type, axes, bands }: ChartSettings) {
  return {
    type: type.id,
    ...(axes && { axes: { x: axes.x.key, y: axes.y.key } }),
    ...(bands && { bands: { edges: bands.edges, labels: bands.labels, colors: bands.colors.map((color) => color ?? null) } }),
  };
}

/** UTF-8, then Base64 by the classic functions, which every browser of the app's floor has, made URL-safe and unpadded. */
function toBase64Url(text: string): string {
  const binary = Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Why a text is refused: thrown anywhere below and caught in {@link toWrittenSession} alone. */
class Refused extends Error {}

function refuse(): never {
  throw new Refused();
}

/** The JSON value `text` writes, after its prefix and URL-safe Base64 of UTF-8. */
function jsonOf(text: string): unknown {
  if (!text.startsWith(PREFIX)) {
    refuse();
  }
  const body = text.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]*$/.test(body)) {
    refuse();
  }
  try {
    const binary = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
    return JSON.parse(json);
  } catch {
    // Base64 that does not parse, bytes that are not UTF-8 or JSON that does not parse.
    return refuse();
  }
}

function sessionFrom(json: unknown, models: readonly RegisteredModel[]): WrittenSession {
  const written = membersOf(json, ["model", "unitSystem", quantities.p_atm.key, "compare", "enabled", "entryModes", "slots", "charts"]);
  const model = modelNamed(written.model, models);
  const modes = entryModesFrom(written.entryModes);
  const [second, third] = arrayOf(written.enabled, 2).map(booleanOf);
  const slots = arrayOf(written.slots, 3).map((slot) => (slot === null ? null : slotFrom(slot, modes, model, models)));
  const [first] = slots;
  if (!first || (second && !slots[1]) || (third && !slots[2])) {
    refuse();
  }
  return {
    model,
    unitSystem: memberWithId(Object.values(unitSystem), (system) => system.id, written.unitSystem),
    atmosphericPressure: finiteNumberOf(written[quantities.p_atm.key]),
    compare: booleanOf(written.compare),
    enabled: [second, third],
    slots: [first, slots[1], slots[2]],
    charts: new Map(Object.entries(recordOf(written.charts)).map(([name, settings]) => {
      const charted = modelNamed(name, models);
      return [charted, chartSettingsFrom(settings, charted, modes)];
    })),
  };
}

/** The entry modes a text writes once, and hands to every slot (ADR-0002 decision 51). */
interface WrittenEntryModes {
  readonly values: ValueEntryModes;
  readonly humidity: HumidityMode | undefined;
}

function entryModesFrom(json: unknown): WrittenEntryModes {
  const written = membersOf(json, entryModeFields, ["humidity"]);
  const values = { ...defaultEntryModes };
  for (const field of entryModeFields) {
    const group = valueEntryGroups.find((candidate) => candidate.modes.includes(defaultEntryModes[field].mode));
    const mode: ValueEntryMode = memberWithId(group?.modes ?? [], (candidate) => candidate.id, written[field]);
    values[field] = { mode };
  }
  const humidity = written.humidity === undefined ? undefined : memberWithId(Object.values(humidityMode), (mode) => mode.id, written.humidity);
  return { values, humidity };
}

/**
 * A slot in `modes`, its values those some model in `models` enters under
 * them, and every quantity and option `model` takes among them; its humidity
 * entry exactly where the text writes a humidity mode.
 */
function slotFrom(json: unknown, modes: WrittenEntryModes, model: RegisteredModel, models: readonly RegisteredModel[]): Slot {
  const written = membersOf(json, ["values", "options"]);
  const enterable = models.flatMap((candidate) => heldQuantities(candidate, modes.values));
  const values = new Map<Quantity, number>();
  let humidity: Slot["humidity"];
  for (const [key, value] of Object.entries(recordOf(written.values))) {
    if (key === modes.humidity?.quantity.key) {
      humidity = { mode: modes.humidity, value: finiteNumberOf(value) };
    } else {
      values.set(memberWithId(enterable, (quantity) => quantity.key, key), finiteNumberOf(value));
    }
  }
  const options = new Map<OptionSpec, boolean>();
  for (const [name, declared] of Object.entries(recordOf(written.options))) {
    const owner = modelNamed(name, models);
    for (const [key, value] of Object.entries(recordOf(declared))) {
      options.set(memberWithId(owner.options, (option) => option.key, key), booleanOf(value));
    }
  }
  const lacksHumidity = modes.humidity ? humidity === undefined : hasHumidityGroup(model);
  if (
    lacksHumidity ||
    heldQuantities(model, modes.values).some((quantity) => !values.has(quantity)) ||
    model.options.some((option) => !options.has(option))
  ) {
    refuse();
  }
  return { values, humidity, ...modes.values, options };
}

/**
 * The quantities a slot in `modes` holds `model`'s inputs under among its
 * values, each sought as a switch seeds it (`seedDeclaredDefaults`): humidity
 * is held apart from them.
 */
function heldQuantities(model: RegisteredModel, modes: ValueEntryModes): Quantity[] {
  return model.inputs.map(({ quantity }) => underEntryModes(quantity, modes)).filter((quantity) => !isHumidityQuantity(quantity));
}

/**
 * `model`'s chart settings: a chart type it declares, axes it offers under
 * `modes` where it declares a dynamic chart, and a well-formed Band list on
 * its scan's classifier where it scans.
 */
function chartSettingsFrom(json: unknown, model: RegisteredModel, modes: WrittenEntryModes): ChartSettings {
  const dynamic = dynamicChartOf(model);
  const written = membersOf(json, ["type", ...(dynamic ? ["axes"] : []), ...(model.scan ? ["bands"] : [])]);
  const type = memberWithId(
    model.charts.map((chart) => chart.type),
    (candidate) => candidate.id,
    written.type,
  );
  return {
    type,
    axes: dynamic ? axesFrom(written.axes, model, modes.values) : null,
    bands: model.scan ? bandsFrom(written.bands, model.scan.classifier) : null,
  };
}

function axesFrom(json: unknown, model: RegisteredModel, modes: ValueEntryModes): ChartSettings["axes"] {
  const written = membersOf(json, ["x", "y"]);
  const offered = dynamicAxisQuantities(model, modes);
  // A picked axis is kept as picked across an entry-mode change, and drawn
  // under the modes (`resolvedAxes`). A model offers a quantity of a group it
  // lacks as it is, whatever the modes: Heat Index's `tdb` under operative entry.
  const axis = (key: unknown) => {
    const quantity = memberWithId(Object.values(quantities), (candidate) => candidate.key, key);
    return offered.includes(quantity) || offered.includes(underEntryModes(quantity, modes)) ? quantity : refuse();
  };
  return { x: axis(written.x), y: axis(written.y) };
}

function bandsFrom(json: unknown, classifier: ClassifierBins): ChartSettings["bands"] {
  const written = membersOf(json, ["edges", "labels", "colors"]);
  const list = bandListFrom(classifier, {
    edges: arrayOf(written.edges).map(finiteNumberOf),
    labels: arrayOf(written.labels).map(stringOf),
    colors: arrayOf(written.colors).map((color) => (color === null ? undefined : stringOf(color))),
  });
  return list ?? refuse();
}

function modelNamed(name: unknown, models: readonly RegisteredModel[]): RegisteredModel {
  return memberWithId(models, (model) => model.info.name, name);
}

/** The member of `items` whose id is `id`. */
function memberWithId<T>(items: Iterable<T>, idOf: (item: T) => string, id: unknown): T {
  for (const item of items) {
    if (idOf(item) === id) {
      return item;
    }
  }
  return refuse();
}

/** A JSON object's members by name: no other, every `required` one, any `optional` one. */
function membersOf<K extends string>(json: unknown, required: readonly K[], optional: readonly K[] = []): Record<K, unknown> {
  const record = recordOf(json);
  const names: readonly string[] = [...required, ...optional];
  if (Object.keys(record).some((name) => !names.includes(name)) || required.some((name) => !(name in record))) {
    refuse();
  }
  return record as Record<K, unknown>;
}

function recordOf(json: unknown): Record<string, unknown> {
  return typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : refuse();
}

function arrayOf(json: unknown, length?: number): unknown[] {
  return Array.isArray(json) && (length === undefined || json.length === length) ? json : refuse();
}

function finiteNumberOf(json: unknown): number {
  return typeof json === "number" && Number.isFinite(json) ? json : refuse();
}

function booleanOf(json: unknown): boolean {
  return typeof json === "boolean" ? json : refuse();
}

function stringOf(json: unknown): string {
  return typeof json === "string" ? json : refuse();
}
