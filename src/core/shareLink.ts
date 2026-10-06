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
 * A text is refused whole where it cannot be read (rule 6 as amended
 * 2026-10-06): no partial answer. Where it can, a key the app does not read is
 * dropped, and a value, option or entry group it lacks starts at its default,
 * as a switch seeds a slot; the answer says whether either happened, so that
 * a model changed after deployment does not void the texts written before it.
 * An entered value outside its bound and a pressure out of range are taken as
 * written; the gate marks them. Until the app is deployed the format may
 * change, and a text an earlier build wrote may be refused (rule 9).
 *
 * A share link is a session narrowed to what its page is computed from
 * (rule 5), written by the same encoder; the decoder does not know which it
 * reads.
 */
import type { ClassifierBins } from "jsthermalcomfort";
import { bandListFrom } from "./bands";
import { dynamicAxisQuantities } from "./charts/dynamicChart";
import { humidityMode, type HumidityMode, type ValueEntryMode } from "./entryModes";
import { dynamicChartOf, hasHumidityGroup, type OptionSpec, type RegisteredModel } from "./modelDeclaration";
import { page, paintsBandsOn, type Page } from "./page";
import { quantities, type Quantity } from "./quantities";
import {
  defaultEntryModes,
  isHumidityQuantity,
  seedDeclaredDefaults,
  underEntryModes,
  valueEntryGroups,
  type Slot,
  type ValueEntryModes,
} from "./slot";
import { unitSystem } from "./unitSystem";
import {
  comparedPositionsOf,
  startingChartSettings,
  type ChartSettings,
  type SlotPosition,
  type WrittenSession,
} from "./writtenSession";

const PREFIX = "v1.";

/** Every field of the entry modes held among the values, so a new entry group is written without a line here. */
const entryModeFields = Object.keys(defaultEntryModes) as (keyof ValueEntryModes)[];

/** `session` written out as a text, its options grouped under the model in `models` that declares each. */
export function toText(session: WrittenSession, models: readonly RegisteredModel[]): string {
  return PREFIX + toBase64Url(JSON.stringify(sessionJson(session, models)));
}

/**
 * `session` narrowed to what `onPage` is computed from, as a share link
 * carries it (ADR-0002 decision 63, rule 5): the compared slots, every other
 * place `null` and not enabled; Compare as held, which is off on Explore,
 * where nothing is compared; of each slot, the values its model enters under
 * the entry modes, the humidity among them where the model enters one, and
 * the model's own options; and the model's chart settings alone, its Band
 * list on Explore alone, where the charts paint it (decision 58).
 */
export function narrowedToPage(session: WrittenSession, onPage: Page): WrittenSession {
  const { model } = session;
  const compared = comparedPositionsOf(session, onPage);
  const narrowed = (position: SlotPosition) => {
    const slot = session.slots[position];
    return slot && compared.includes(position) ? enteredSlot(slot, model) : null;
  };
  const chart = session.charts.get(model);
  if (!chart) {
    throw new Error(`The session holds no chart settings of its own model, ${model.info.label}`);
  }
  return {
    ...session,
    compare: onPage === page.standard && session.compare,
    enabled: [compared.includes(1), compared.includes(2)],
    slots: [enteredSlot(session.slots[0], model), narrowed(1), narrowed(2)],
    charts: new Map([[model, paintsBandsOn(onPage) ? chart : { ...chart, bands: null }]]),
  };
}

/** What of `slot` `model` is computed from: the values it holds under the slot's entry modes, its humidity, its options. */
function enteredSlot(slot: Slot, model: RegisteredModel): Slot {
  const held = heldQuantities(model, slot);
  return {
    ...slot,
    values: new Map([...slot.values].filter(([quantity]) => held.includes(quantity))),
    humidity: hasHumidityGroup(model) ? slot.humidity : undefined,
    options: new Map([...slot.options].filter(([option]) => model.options.includes(option))),
  };
}

/** What a text reads as. */
export interface DecodedSession {
  readonly session: WrittenSession;
  /** Whether the session is what the text wrote: `false` where a key was dropped or something started at its default. */
  readonly exact: boolean;
}

/**
 * The written session `text` holds, its names looked up in `models`, or
 * `undefined` for a text refused (rule 6 as amended): one that does not
 * parse; lacks a member rule 1 requires, or has one of another type; names a
 * model, unit system, entry mode or chart type the app does not have, or a
 * chart type or axis its model does not declare; holds a value that is not a
 * finite number or a Band list not well formed; writes a humidity mode with a
 * slot that holds no humidity value; or has slot 1, or an enabled slot,
 * `null`.
 */
export function toDecodedSession(text: string, models: readonly RegisteredModel[]): DecodedSession | undefined {
  try {
    const json = jsonOf(text);
    const session = sessionFrom(json, models);
    // Anything dropped or started at a default makes the session written out again differ from the text.
    return { session, exact: canonicalOf(sessionJson(session, models)) === canonicalOf(json) };
  } catch (error) {
    if (error instanceof Refused) {
      return undefined;
    }
    throw error;
  }
}

function sessionJson(session: WrittenSession, models: readonly RegisteredModel[]) {
  const [first] = session.slots;
  const entryModes: Record<string, string> = Object.fromEntries(entryModeFields.map((field) => [field, first[field].mode.id]));
  if (first.humidity) {
    entryModes.humidity = first.humidity.mode.id;
  }
  return {
    model: session.model.info.name,
    unitSystem: session.unitSystem.id,
    [quantities.p_atm.key]: session.atmosphericPressure,
    compare: session.compare,
    enabled: session.enabled,
    entryModes,
    slots: session.slots.map((slot) => slot && slotJson(slot, models)),
    charts: Object.fromEntries([...session.charts].map(([model, settings]) => [model.info.name, chartJson(settings)])),
  };
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

/** `json` as one string whatever the order of each object's members, so that two JSON values compare. */
function canonicalOf(json: unknown): string {
  return JSON.stringify(json, (key, value: unknown) =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)))
      : value,
  );
}

/** Why a text is refused: thrown anywhere below and caught in {@link toDecodedSession} alone. */
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
  const model = modelNamed(written.model, models) ?? refuse();
  const modes = entryModesFrom(written.entryModes);
  const [second, third] = arrayOf(written.enabled, 2).map(booleanOf);
  const slots = arrayOf(written.slots, 3).map((slot) => (slot === null ? null : slotFrom(slot, modes, model, models)));
  const [first] = slots;
  if (!first || (second && !slots[1]) || (third && !slots[2])) {
    refuse();
  }
  return {
    model,
    unitSystem: memberWithId(Object.values(unitSystem), (system) => system.id, written.unitSystem) ?? refuse(),
    atmosphericPressure: finiteNumberOf(written[quantities.p_atm.key]),
    compare: booleanOf(written.compare),
    enabled: [second, third],
    slots: [first, slots[1], slots[2]],
    charts: new Map([
      // A session holds its own model's chart settings, so a text without them has them start at the model's own.
      [model, startingChartSettings(model)],
      ...Object.entries(recordOf(written.charts)).flatMap(([name, settings]) => {
        const charted = modelNamed(name, models);
        return charted ? [[charted, chartSettingsFrom(settings, charted, modes)] as const] : [];
      }),
    ]),
  };
}

/** The entry modes a text writes once, and hands to every slot (ADR-0002 decision 51). */
interface WrittenEntryModes {
  readonly values: ValueEntryModes;
  readonly humidity: HumidityMode | undefined;
}

/** The entry modes `json` writes, an entry group it lacks in its default mode. */
function entryModesFrom(json: unknown): WrittenEntryModes {
  const written = recordOf(json);
  const values = { ...defaultEntryModes };
  for (const field of entryModeFields) {
    const fieldDefault = defaultEntryModes[field].mode;
    const group = valueEntryGroups.find((candidate) => candidate.modes.includes(fieldDefault));
    const mode: ValueEntryMode =
      written[field] === undefined ? fieldDefault : (memberWithId(group?.modes ?? [], (candidate) => candidate.id, written[field]) ?? refuse());
    values[field] = { mode };
  }
  const humidity =
    written.humidity === undefined ? undefined : (memberWithId(Object.values(humidityMode), (mode) => mode.id, written.humidity) ?? refuse());
  return { values, humidity };
}

/**
 * A slot in `modes`: the values some model in `models` enters under them and
 * the options a model in `models` declares, each other key dropped, and what
 * `model` takes that the slot lacks at its default, seeded as a switch seeds
 * it. A slot without a value in the humidity mode the text writes is
 * refused, since a default there would be in another mode than slot 1's.
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
      const quantity = memberWithId(enterable, (candidate) => candidate.key, key);
      if (quantity) {
        values.set(quantity, finiteNumberOf(value));
      }
    }
  }
  const options = new Map<OptionSpec, boolean>();
  for (const [name, declared] of Object.entries(recordOf(written.options))) {
    const owner = modelNamed(name, models);
    if (!owner) {
      continue;
    }
    for (const [key, value] of Object.entries(recordOf(declared))) {
      const option = memberWithId(owner.options, (candidate) => candidate.key, key);
      if (option) {
        options.set(option, booleanOf(value));
      }
    }
  }
  if (modes.humidity && humidity === undefined) {
    refuse();
  }
  return seedDeclaredDefaults({ values, humidity, ...modes.values, options }, model);
}

/**
 * The quantities a slot in `modes` holds `model`'s inputs under among its
 * values, each sought as a switch seeds it: humidity is held apart from them.
 */
function heldQuantities(model: RegisteredModel, modes: ValueEntryModes): Quantity[] {
  return model.inputs.map(({ quantity }) => underEntryModes(quantity, modes)).filter((quantity) => !isHumidityQuantity(quantity));
}

/**
 * `model`'s chart settings: a chart type it declares, axes it offers under
 * `modes` where it declares a dynamic chart, and a well-formed Band list on
 * its scan's classifier where it scans and the text writes one. A link copied
 * on the Standard page writes none (rule 5), and the session then starts on
 * the classifier's.
 */
function chartSettingsFrom(json: unknown, model: RegisteredModel, modes: WrittenEntryModes): ChartSettings {
  const dynamic = dynamicChartOf(model);
  const written = membersOf(json, ["type", ...(dynamic ? ["axes"] : [])]);
  const { bands } = recordOf(json);
  const type =
    memberWithId(
      model.charts.map((chart) => chart.type),
      (candidate) => candidate.id,
      written.type,
    ) ?? refuse();
  return {
    type,
    axes: dynamic ? axesFrom(written.axes, model, modes.values) : null,
    bands: model.scan && bands !== undefined ? bandsFrom(bands, model.scan.classifier) : null,
  };
}

function axesFrom(json: unknown, model: RegisteredModel, modes: ValueEntryModes): ChartSettings["axes"] {
  const written = membersOf(json, ["x", "y"]);
  const offered = dynamicAxisQuantities(model, modes);
  // A picked axis is kept as picked across an entry-mode change, and drawn
  // under the modes (`resolvedAxes`). A model offers a quantity of a group it
  // lacks as it is, whatever the modes: Heat Index's `tdb` under operative entry.
  const axis = (key: unknown) => {
    const quantity = memberWithId(Object.values(quantities), (candidate) => candidate.key, key) ?? refuse();
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

function modelNamed(name: unknown, models: readonly RegisteredModel[]): RegisteredModel | undefined {
  return memberWithId(models, (model) => model.info.name, name);
}

/** The member of `items` whose id is `id`, if any. */
function memberWithId<T>(items: Iterable<T>, idOf: (item: T) => string, id: unknown): T | undefined {
  for (const item of items) {
    if (idOf(item) === id) {
      return item;
    }
  }
  return undefined;
}

/** A JSON object's members by name, every one of `required` among them; any other is not read. */
function membersOf<K extends string>(json: unknown, required: readonly K[]): Record<K, unknown> {
  const record = recordOf(json);
  if (required.some((name) => !(name in record))) {
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
