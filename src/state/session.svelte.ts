import { SvelteMap } from "svelte/reactivity";
import type { ClassifierBins } from "jsthermalcomfort";
import { addEdge, bandListOf, moveEdge, removeEdge, setColor, setLabel, type BandList } from "$lib/core/bands";
import type { ChartType } from "$lib/core/chartType";
import type { AirSpeedMode, ClothingMode, HumidityMode, TemperatureMode } from "$lib/core/entryModes";
import { dynamicChartOf, isPolygonsChart, type ChartAxes, type OptionSpec, type RegisteredModel } from "$lib/core/modelDeclaration";
import { page, type Address, type Page } from "$lib/core/page";
import type { OutOfRangeRow } from "$lib/core/applicability";
import { adjustToBounds, rehearseSwitch } from "$lib/core/modelSwitch";
import { DEFAULT_ATMOSPHERIC_PRESSURE, type Quantity } from "$lib/core/quantities";
import {
  defaultEntryModes,
  entryModesOf,
  startingSlot,
  withAirSpeedMode,
  withClothingMode,
  withEnteredValues,
  withHumidityMode,
  withOption,
  withTemperatureMode,
  type Slot,
  type ValueEntryModes,
} from "$lib/core/slot";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";

/**
 * One set of inputs (ADR §4.5). Canonical SI; the quantity the user entered is
 * the truth. `values` is the cross-model superset bag: it excludes `rh`
 * (held in `humidity`, absent until a declaration's default or the person
 * writes it), stores `operative_tmp` under operative mode and
 * `tdb` / `tr` under separate mode, and `vr` under relative air speed entry
 * and `v` under air speed entry, and `clo_dynamic` under dynamic clothing
 * entry and `clo` under clothing insulation entry. `options` is a superset bag in the same
 * way, keyed by the declaration's own option objects (ADR-0002 decision 36).
 *
 * Every write is a core function from a slot to a slot, whose answer the slot
 * lands; the two maps and the four entries are read-only outside the class. An
 * entry mode is the session's, so the slot has no entry-mode setter: the
 * session converts every slot through {@link InputSlot.replaceWith}
 * (ADR-0002 decision 51).
 */
export class InputSlot implements Slot {
  readonly #values = new SvelteMap<Quantity, number>();
  readonly #options = new SvelteMap<OptionSpec, boolean>();
  // `$state.raw`, not `$state`: a deep proxy would wrap the mode objects and
  // the Quantity they reference, and identity comparisons against
  // `humidityMode.rh` / `io.quantities.rh` would fail. Replace, don't mutate.
  #humidity = $state.raw<Slot["humidity"]>(undefined);
  #temperature = $state.raw<Slot["temperature"]>(defaultEntryModes.temperature);
  #airSpeed = $state.raw<Slot["airSpeed"]>(defaultEntryModes.airSpeed);
  #clothing = $state.raw<Slot["clothing"]>(defaultEntryModes.clothing);

  /** A slot holding what `slot` holds: the slot a model starts on, or a copy of another. */
  constructor(slot: Slot) {
    this.replaceWith(slot);
  }

  get values(): ReadonlyMap<Quantity, number> {
    return this.#values;
  }

  get options(): ReadonlyMap<OptionSpec, boolean> {
    return this.#options;
  }

  get humidity(): Slot["humidity"] {
    return this.#humidity;
  }

  get temperature(): Slot["temperature"] {
    return this.#temperature;
  }

  get airSpeed(): Slot["airSpeed"] {
    return this.#airSpeed;
  }

  get clothing(): Slot["clothing"] {
    return this.#clothing;
  }

  /** Enter `value` for `quantity` where core puts it: a humidity quantity sets the humidity entry. */
  setEntered(quantity: Quantity, value: number): void {
    this.replaceWith(withEnteredValues(this, new Map([[quantity, value]])));
  }

  /** Tick or untick `option`, as the option's checkbox does. */
  setOption(option: OptionSpec, value: boolean): void {
    this.replaceWith(withOption(this, option, value));
  }

  /**
   * Hold what `slot` holds: quantities and options it does not carry are
   * dropped, the rest are set, and the humidity, temperature, air-speed and
   * clothing entries are replaced. The two maps are mutated rather than swapped, because the input
   * panel and the derivations hold them and their reactivity is their own.
   * `slot` may be this `InputSlot` itself, when the core function it came from
   * found nothing to change; the loops then do nothing.
   *
   * Public, unlike the fields it writes: the session lands a rehearsed switch
   * through it, and what it lands is a whole slot core returned, so it is the
   * write path rather than a way round it.
   */
  replaceWith(slot: Slot): void {
    replaceEntries(this.#values, slot.values);
    replaceEntries(this.#options, slot.options);
    this.#humidity = slot.humidity;
    this.#temperature = slot.temperature;
    this.#airSpeed = slot.airSpeed;
    this.#clothing = slot.clothing;
  }
}

/** `target` holding exactly what `source` holds, mutated in place. */
function replaceEntries<K, V>(target: SvelteMap<K, V>, source: ReadonlyMap<K, V>): void {
  for (const key of [...target.keys()]) {
    if (!source.has(key)) {
      target.delete(key);
    }
  }
  for (const [key, value] of source) {
    target.set(key, value);
  }
}

/**
 * Which chart is on screen and how it is set up (ADR §4.5). The defaults come
 * from the model's declaration.
 */
export class ChartState {
  // Chart types and quantities are compared by identity, so `$state.raw`.
  type: ChartType;
  axes: ChartAxes;
  /** The classifier the Band list began as, which Add and Reset read; none for a model that scans nothing. */
  readonly #classifier: ClassifierBins | null;
  // Replaced whole, never mutated, so `$state.raw`.
  #bands: BandList | null;
  /** A polygons chart's axes are the ones its model declares, and never move (ADR-0002 decision 37). */
  readonly #axesLocked: boolean;

  constructor(model: RegisteredModel) {
    const dynamic = dynamicChartOf(model);
    if (!dynamic) {
      throw new Error(`${model.info.label} declares no dynamic chart; ADR §4.4 gives every model one`);
    }
    this.type = $state.raw(model.charts[0].type);
    this.axes = $state.raw(dynamic.axes);
    this.#classifier = model.scan?.classifier ?? null;
    this.#bands = $state.raw(this.#classifier && bandListOf(this.#classifier));
    this.#axesLocked = isPolygonsChart(dynamic);
  }

  /**
   * The model's Band list, which Explore paints on its charts and its Bands
   * panel edits (ADR-0002 decision 59): its scan's classifier to begin with
   * (decision 61). A model that scans nothing has none, and every edit below
   * does nothing.
   * Changed only by the Band list module's operations, through the methods
   * below.
   */
  get bands(): BandList | null {
    return this.#bands;
  }

  setAxes(axes: Partial<ChartAxes>): void {
    if (this.#axesLocked) {
      return;
    }
    this.axes = { ...this.axes, ...axes };
  }

  /**
   * Band `index`'s Edge moved to `edge`, in the output's SI unit, unless it
   * falls at or beyond a neighbour: then the list is left as it was. Whether
   * the move was taken, so the panel can mark a refused one.
   */
  moveBandEdge(index: number, edge: number): boolean {
    const list = this.#bands;
    if (!list) {
      return false;
    }
    const moved = moveEdge(list, index, edge);
    if (moved === list) {
      return false;
    }
    this.#bands = moved;
    return true;
  }

  /** Band `index` split at its midpoint, the lower half unlabelled and uncoloured. */
  addBand(index: number): void {
    this.#edit((list, classifier) => addEdge(list, index, classifier));
  }

  /** Band `index` merged into the band above, the last into the one below; the only band stays. */
  removeBand(index: number): void {
    this.#edit((list) => removeEdge(list, index));
  }

  setBandLabel(index: number, label: string): void {
    this.#edit((list) => setLabel(list, index, label));
  }

  /** Band `index` recoloured, or painted nowhere for `undefined`. */
  setBandColor(index: number, color: string | undefined): void {
    this.#edit((list) => setColor(list, index, color));
  }

  /** The classifier's bands and colours again: the panel's Reset. */
  resetBands(): void {
    this.#bands = this.#classifier && bandListOf(this.#classifier);
  }

  /** The list replaced by `operation`'s answer; nothing for a model that scans nothing, which has neither list nor classifier. */
  #edit(operation: (list: BandList, classifier: ClassifierBins) => BandList): void {
    if (this.#bands && this.#classifier) {
      this.#bands = operation(this.#bands, this.#classifier);
    }
  }
}

/** A slot's place in the session, from 0: its name and hue follow it (ADR-0002 decision 50). */
export type SlotPosition = 0 | 1 | 2;

/** One slot that holds values, as a switch would leave it (ADR-0002 decision 52). */
export interface RehearsedSlot {
  readonly position: SlotPosition;
  /** What the slot would hold under the new model: `rehearseSwitch`'s slot. */
  readonly slot: Slot;
  /**
   * What the question lists of it: the entered values the new model does not
   * accept, as `rehearseSwitch` reports them, for a compared slot; none for a
   * slot not compared, which is neither listed nor adjusted.
   */
  readonly listedRows: readonly OutOfRangeRow[];
}

/**
 * A switch the person asked for that the session has a question about: the
 * model they asked for and every slot that holds values, rehearsed, in slot
 * order (ADR-0002 decisions 32 and 52). Nothing has changed while one of
 * these is held — it is the question, not a half-done switch.
 */
export interface PendingSwitch {
  readonly model: RegisteredModel;
  readonly slots: readonly RehearsedSlot[];
}

/** Every position, in slot order. */
export const slotPositions = [0, 1, 2] as const satisfies readonly SlotPosition[];

/** A slot Compare enables and disables: every slot but slot 1, which cannot be disabled. */
export type OptionalSlotPosition = Exclude<SlotPosition, 0>;

/** What the session's three slots hold: slots 2 and 3 are `null` until first enabled. */
type HeldSlots = readonly [InputSlot, InputSlot | null, InputSlot | null];

/** Shared by Standard and Explore (ADR §4.5; ADR-0002 decision 57). */
export class Session {
  // All four hold objects compared by identity elsewhere, so `$state.raw`.
  /** The page the address names. Set with the model, by {@link setAddress}; no page component sets it. */
  page: Page;
  model: RegisteredModel;
  unitSystem = $state.raw<UnitSystem>(unitSystem.si);
  /** The chart settings of the current model. */
  chart: ChartState;
  /**
   * The air every slot describes, in Pa: one value for the session, held by
   * no slot and kept by a model switch (ADR-0002 decision 49).
   */
  atmosphericPressure = $state(DEFAULT_ATMOSPHERIC_PRESSURE);
  /** The switch waiting on an answer, or `null`. Held whole, so `$state.raw`. */
  pendingSwitch = $state.raw<PendingSwitch | null>(null);
  // Replaced whole, never mutated, so `$state.raw` like the other identities here.
  #slots: HeldSlots;
  #compare = $state(false);
  /** Slot 1's `true` is the type's as well: it cannot be disabled. */
  #enabled = $state.raw<readonly [true, boolean, boolean]>([true, false, false]);
  /**
   * Slot 1 always, and slots 2 and 3 while Compare is on and they are enabled,
   * on the Standard page alone: Compare is the Standard page's, and Explore
   * compares slot 1 whatever Compare holds (ADR-0002 decision 57).
   */
  readonly #comparedPositions = $derived.by((): readonly SlotPosition[] =>
    slotPositions.filter(
      (position) =>
        position === 0 || (this.page === page.standard && this.#compare && this.#enabled[position]),
    ),
  );
  // Each model remembers its own chart settings. A plain Map: only `chart` is
  // read reactively, and lazily filling a reactive map during a derivation
  // would be a write inside a read.
  readonly #chartByModel = new Map<RegisteredModel, ChartState>();

  constructor(model: RegisteredModel) {
    this.page = $state.raw(page.standard);
    this.model = $state.raw(model);
    this.chart = $state.raw(this.#chartFor(model));
    this.#slots = $state.raw([new InputSlot(startingSlot(model)), null, null]);
  }

  /**
   * What each slot holds, in slot order. Slot 1 always holds a slot; slots 2
   * and 3 hold nothing (`null`) until first enabled, and keep their own
   * values after that, enabled or not (ADR-0002 decision 50).
   */
  get slots(): HeldSlots {
    return this.#slots;
  }

  /** Whether Compare is on (ADR-0002 decision 50). */
  get compare(): boolean {
    return this.#compare;
  }

  /** The slots the outputs are asked about, in slot order: slot 1 always. */
  get comparedPositions(): readonly SlotPosition[] {
    return this.#comparedPositions;
  }

  /** Whether the slot at `position` is enabled; slot 1 always is. Compare decides whether it is compared. */
  isSlotEnabled(position: SlotPosition): boolean {
    return this.#enabled[position];
  }

  /**
   * Switch Compare on or off. The first switch-on — while no slot but slot 1
   * has ever held values — enables slot 2 as well; after that it changes none
   * of what the person chose, and switching off changes no slot.
   */
  setCompare(on: boolean): void {
    if (on && this.#slots[1] === null && this.#slots[2] === null) {
      this.setSlotEnabled(1, true);
    }
    this.#compare = on;
  }

  /**
   * Enable or disable the slot at `position`. A slot enabled for the first
   * time takes a copy of what slot 1 holds now, entry modes and options
   * included; a slot enabled again holds what it held.
   */
  setSlotEnabled(position: OptionalSlotPosition, enabled: boolean): void {
    if (enabled && this.#slots[position] === null) {
      const copy = new InputSlot(this.#slots[0]);
      const [first, second, third] = this.#slots;
      this.#slots = position === 1 ? [first, copy, third] : [first, second, copy];
    }
    const [first, second, third] = this.#enabled;
    this.#enabled = position === 1 ? [first, enabled, third] : [first, second, enabled];
  }

  /**
   * The session's entry mode of every entry group held among the values
   * (ADR-0002 decision 51): slot 1's, read apart from the slot.
   *
   * The session holds no entry mode of its own, so this and the four readers
   * below rest on an invariant: after every operation of the session, every
   * slot that holds values is in slot 1's entry modes, humidity's included.
   * It holds because the session changes a mode in every held slot at once
   * ({@link setTemperatureMode}, {@link setAirSpeedMode},
   * {@link setClothingMode}, {@link setHumidityMode}); a slot first
   * enabled copies slot 1 ({@link setSlotEnabled}); a switch puts every held
   * slot through one rehearsal, which reads the slot's modes, the model and
   * the model left ({@link #rehearse}); and the input panel enters a value
   * only in a row of the modes the slot is in, where
   * {@link InputSlot.setEntered} of another humidity mode's quantity would
   * move that one slot's mode.
   *
   * It does not hold through a question left standing: a mode changed or a
   * slot first enabled while {@link pendingSwitch} is held is not in what
   * {@link acceptSwitch} lands. The dialog is modal, so no person does that.
   */
  get entryModes(): ValueEntryModes {
    return entryModesOf(this.#slots[0]);
  }

  /**
   * The session's temperature entry mode: slot 1's, which by the invariant
   * {@link entryModes} states is that of every slot that holds values.
   */
  get temperatureMode(): TemperatureMode {
    return this.#slots[0].temperature.mode;
  }

  /**
   * The session's air-speed entry mode: slot 1's, which by the invariant
   * {@link entryModes} states is that of every slot that holds values.
   */
  get airSpeedMode(): AirSpeedMode {
    return this.#slots[0].airSpeed.mode;
  }

  /**
   * The session's clothing entry mode: slot 1's, which by the invariant
   * {@link entryModes} states is that of every slot that holds values.
   */
  get clothingMode(): ClothingMode {
    return this.#slots[0].clothing.mode;
  }

  /**
   * The session's humidity entry mode: slot 1's, which by the invariant
   * {@link entryModes} states is that of every slot that holds values, or
   * none while slot 1, and so every slot, holds no humidity.
   */
  get humidityMode(): HumidityMode | undefined {
    return this.#slots[0].humidity?.mode;
  }

  /**
   * Change the temperature entry mode: every slot that holds values,
   * compared or not, is converted by `withTemperatureMode` at its own values,
   * weighed by the session's model. A slot never enabled holds nothing and
   * takes the mode when it copies slot 1.
   */
  setTemperatureMode(mode: TemperatureMode): void {
    for (const slot of this.#heldSlots()) {
      slot.replaceWith(withTemperatureMode(slot, mode, this.model));
    }
  }

  /**
   * Change the air-speed entry mode: every slot that holds values is
   * converted by `withAirSpeedMode` at its own air speed and metabolic rate,
   * as {@link setTemperatureMode} converts.
   */
  setAirSpeedMode(mode: AirSpeedMode): void {
    for (const slot of this.#heldSlots()) {
      slot.replaceWith(withAirSpeedMode(slot, mode));
    }
  }

  /**
   * Change the clothing entry mode: every slot that holds values is converted
   * by `withClothingMode` at its own values, by the rule of the session's
   * model's standard, as {@link setTemperatureMode} converts.
   */
  setClothingMode(mode: ClothingMode): void {
    for (const slot of this.#heldSlots()) {
      slot.replaceWith(withClothingMode(slot, mode, this.model));
    }
  }

  /**
   * Change the humidity entry mode: every slot that holds values is converted
   * by `withHumidityMode` at its own dry-bulb temperature and the session's
   * atmospheric pressure, as {@link setTemperatureMode} converts.
   */
  setHumidityMode(mode: HumidityMode): void {
    for (const slot of this.#heldSlots()) {
      slot.replaceWith(withHumidityMode(slot, mode, this.atmosphericPressure));
    }
  }

  /**
   * The address's path — a typed URL, the back button, a share link — which
   * has no previous page to stay on and so never asks and never adjusts a
   * value (ADR-0002 decision 32). Every slot that holds values is converted
   * and seeded, and lands with the model in one step, so no derivation sees a
   * slot and the model disagree.
   */
  setModel(model: RegisteredModel): void {
    if (model === this.model) {
      return;
    }
    this.#land(model, this.#rehearse(model));
  }

  /**
   * Where the address points now: its page and its model, the model set as
   * {@link setModel} sets it, so a change of page never asks either. Every
   * slot, Compare and the chart settings are kept: they are the session's,
   * not a page's (ADR-0002 decision 57). An arrival answers whatever was
   * pending with a "No", as a landing does, even on the model already
   * current: the question was asked on a page the address has left.
   */
  setAddress(address: Address): void {
    this.pendingSwitch = null;
    this.page = address.page;
    this.setModel(address.model);
  }

  /**
   * The app's own way of switching: the person asked for `model` from a page
   * they are already on, so the session may have a question about it
   * (ADR-0002 decisions 32 and 52). Requesting is therefore a different act
   * from setting — with every value of the compared slots acceptable to
   * `model` the switch simply lands, and otherwise nothing changes and one
   * question about all of them is held until {@link acceptSwitch} or
   * {@link declineSwitch} answers it.
   */
  requestModel(model: RegisteredModel): void {
    // Every request supersedes the last one, so no question outlives the act
    // that asked it — asking for the model already current answers the
    // previous question with a "No" rather than leaving it standing.
    this.pendingSwitch = null;
    if (model === this.model) {
      return;
    }
    const slots = this.#rehearse(model);
    if (slots.every(({ listedRows }) => listedRows.length === 0)) {
      this.#land(model, slots);
      return;
    }
    this.pendingSwitch = { model, slots };
  }

  /** "Yes, switch and adjust": every listed value moves to its nearest bound, and every slot lands with the model. */
  acceptSwitch(): void {
    const pending = this.pendingSwitch;
    if (!pending) {
      return;
    }
    this.#land(
      pending.model,
      pending.slots.map(({ position, slot, listedRows }) => ({ position, slot: adjustToBounds(slot, listedRows) })),
    );
  }

  /** "No, stay here", and every other way of closing the dialog: the question goes and nothing else moves. */
  declineSwitch(): void {
    this.pendingSwitch = null;
  }

  /**
   * Every slot that holds values, as a switch to `model` would leave it, in
   * slot order. The rehearsal is a function of one slot, asked of each; only a
   * compared slot's rows are listed.
   */
  #rehearse(model: RegisteredModel): RehearsedSlot[] {
    return slotPositions.flatMap((position) => {
      const held = this.#slots[position];
      if (!held) {
        return [];
      }
      const { slot, outOfRangeRows } = rehearseSwitch(held, this.model, model, this.atmosphericPressure);
      return [{ position, slot, listedRows: this.#comparedPositions.includes(position) ? outOfRangeRows : [] }];
    });
  }

  /**
   * The model and the slots it runs on, in one step, so the outputs
   * derivation never sees a slot and the model disagree. `slots` names every
   * slot that holds values; no slot returns to holding nothing, so each still
   * does. Any landing answers whatever was pending: a question rehearsed
   * against a slot that has since moved is stale, and an unanswered question
   * is a "No".
   */
  #land(model: RegisteredModel, slots: readonly Pick<RehearsedSlot, "position" | "slot">[]): void {
    for (const { position, slot } of slots) {
      this.#slots[position]?.replaceWith(slot);
    }
    this.model = model;
    this.chart = this.#chartFor(model);
    this.pendingSwitch = null;
  }

  /** Every slot that holds values, in slot order. */
  #heldSlots(): InputSlot[] {
    return this.#slots.filter((slot): slot is InputSlot => slot !== null);
  }

  #chartFor(model: RegisteredModel): ChartState {
    let state = this.#chartByModel.get(model);
    if (!state) {
      state = new ChartState(model);
      this.#chartByModel.set(model, state);
    }
    return state;
  }
}
