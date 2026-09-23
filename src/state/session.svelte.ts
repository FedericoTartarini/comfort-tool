import { SvelteMap } from "svelte/reactivity";
import type { ChartType } from "$lib/core/chartType";
import { humidityMode, temperatureMode, type HumidityMode, type TemperatureMode } from "$lib/core/entryModes";
import { resolvedTdb, withTemperatureMode, type SlotInputs } from "$lib/core/libraryInputs";
import { dynamicChartOf, type OptionSpec, type RegisteredModel } from "$lib/core/modelDeclaration";
import { adjustToBounds, rehearseSwitch, type RehearsedSwitch } from "$lib/core/modelSwitch";
import type { Quantity } from "$lib/core/quantities";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";

/**
 * One set of inputs (ADR §4.5). Canonical SI; the quantity the user entered is
 * the truth. `values` is the cross-model superset bag: it excludes `rh`
 * (held in `humidity`), stores `operative_tmp` under operative mode and
 * `tdb` / `tr` under separate mode. `options` is a superset bag in the same
 * way, keyed by the declaration's own option objects (ADR-0002 decision 36).
 */
export class InputSlot {
  readonly values = new SvelteMap<Quantity, number>();
  readonly options = new SvelteMap<OptionSpec, boolean>();
  // `$state.raw`, not `$state`: a deep proxy would wrap the mode objects and
  // the Quantity they reference, and identity comparisons against
  // `humidityMode.rh` / `io.quantities.rh` would fail. Replace, don't mutate.
  humidity = $state.raw<{ readonly mode: HumidityMode; readonly value: number }>({
    mode: humidityMode.rh,
    value: 50,
  });
  temperature = $state.raw<{ readonly mode: TemperatureMode }>({ mode: temperatureMode.separate });

  constructor(model: RegisteredModel) {
    for (const { quantity, value } of model.inputs) {
      if (quantity === this.humidity.mode.quantity) {
        this.setHumidityValue(value);
      } else {
        this.values.set(quantity, value);
      }
    }
    for (const option of model.options) {
      this.options.set(option, option.default);
    }
  }

  setHumidityValue(value: number): void {
    this.humidity = { mode: this.humidity.mode, value };
  }

  /**
   * Re-express the stored humidity in the new representation at the current
   * dry-bulb temperature. Lossy and one-way, like the temperature switch.
   */
  setHumidityMode(mode: HumidityMode): void {
    if (mode === this.humidity.mode) {
      return;
    }
    const tdb = resolvedTdb(this);
    const rh = this.humidity.mode.toRelativeHumidity(this.humidity.value, tdb);
    this.humidity = { mode, value: mode.fromRelativeHumidity(rh, tdb) };
  }

  /**
   * Convert the stored temperatures into the new representation, by the rule
   * `core/libraryInputs.ts` states: lossy and one-way, as in the old tool.
   */
  setTemperatureMode(mode: TemperatureMode): void {
    this.replaceInputs(withTemperatureMode(this, mode));
  }

  /**
   * Hold what `inputs` holds: quantities and options it does not carry are
   * dropped, the rest are set, and the humidity and temperature entries are
   * replaced. The two maps are mutated rather than swapped, because the input
   * panel and the derivations hold them and their reactivity is their own.
   * `inputs` may be this slot itself, when the core function it came from
   * found nothing to change; the loops then do nothing.
   */
  replaceInputs(inputs: SlotInputs): void {
    replaceEntries(this.values, inputs.values);
    replaceEntries(this.options, inputs.options);
    this.humidity = inputs.humidity;
    this.temperature = inputs.temperature;
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
 * from the model's declaration; Explore's editable bands arrive in Phase 5.
 */
export class ChartState {
  // Chart types and quantities are compared by identity, so `$state.raw`.
  type: ChartType;
  axes: { readonly x: Quantity; readonly y: Quantity };

  constructor(model: RegisteredModel) {
    const dynamic = dynamicChartOf(model);
    if (!dynamic) {
      throw new Error(`${model.info.label} declares no dynamic chart; ADR §4.4 gives every model one`);
    }
    this.type = $state.raw(model.charts[0].type);
    this.axes = $state.raw(dynamic.axes);
  }

  setType(type: ChartType): void {
    this.type = type;
  }

  setAxes(axes: Partial<{ readonly x: Quantity; readonly y: Quantity }>): void {
    this.axes = { ...this.axes, ...axes };
  }
}

/**
 * A switch the person asked for that the session has a question about: the
 * model they asked for, the slot the switch rehearsed, and the entered values
 * the new model does not accept (ADR-0002 decision 32). Nothing has changed
 * while one of these is held — it is the question, not a half-done switch.
 */
export interface PendingSwitch extends RehearsedSwitch {
  readonly model: RegisteredModel;
}

/** Shared by Standard and Explore (ADR §4.5). Compare arrives in Phase 5. */
export class Session {
  // All three hold objects compared by identity elsewhere, so `$state.raw`.
  model: RegisteredModel;
  unitSystem = $state.raw<UnitSystem>(unitSystem.si);
  /** The chart settings of the current model. */
  chart: ChartState;
  /** The switch waiting on an answer, or `null`. Held whole, so `$state.raw`. */
  pendingSwitch = $state.raw<PendingSwitch | null>(null);
  readonly slots: readonly [InputSlot, InputSlot, InputSlot];
  // Each model remembers its own chart settings. A plain Map: only `chart` is
  // read reactively, and lazily filling a reactive map during a derivation
  // would be a write inside a read.
  readonly #chartByModel = new Map<RegisteredModel, ChartState>();

  constructor(model: RegisteredModel) {
    this.model = $state.raw(model);
    this.chart = $state.raw(this.#chartFor(model));
    this.slots = [new InputSlot(model), new InputSlot(model), new InputSlot(model)];
  }

  /**
   * The address's path — a typed URL, the back button, a share link — which
   * has no previous page to stay on and so never asks and never adjusts a
   * value (ADR-0002 decision 32). The rehearsed slot and the model land in one
   * step, so no derivation sees the two disagree.
   */
  setModel(model: RegisteredModel): void {
    if (model === this.model) {
      return;
    }
    this.#land(model, rehearseSwitch(this.slots[0], model).inputs);
  }

  /**
   * The app's own way of switching: the person asked for `model` from a page
   * they are already on, so the session may have a question about it
   * (ADR-0002 decision 32). Requesting is therefore a different act from
   * setting — with every entered value acceptable to `model` the switch simply
   * lands, and otherwise nothing changes and the question is held until
   * {@link acceptSwitch} or {@link declineSwitch} answers it.
   */
  requestModel(model: RegisteredModel): void {
    // Every request supersedes the last one, so no question outlives the act
    // that asked it — asking for the model already current answers the
    // previous question with a "No" rather than leaving it standing.
    this.pendingSwitch = null;
    if (model === this.model) {
      return;
    }
    const rehearsed = rehearseSwitch(this.slots[0], model);
    if (rehearsed.outOfRangeRows.length === 0) {
      this.#land(model, rehearsed.inputs);
      return;
    }
    this.pendingSwitch = { model, ...rehearsed };
  }

  /** "Yes, switch and adjust": the listed values move to their nearest bound and land with the model. */
  acceptSwitch(): void {
    const pending = this.pendingSwitch;
    if (!pending) {
      return;
    }
    this.#land(pending.model, adjustToBounds(pending.inputs, pending.outOfRangeRows));
  }

  /** "No, stay here", and every other way of closing the dialog: the question goes and nothing else moves. */
  declineSwitch(): void {
    this.pendingSwitch = null;
  }

  /**
   * The model and the slot it runs on, in one step, so the outputs derivation
   * never sees the two disagree. Any landing answers whatever was pending: a
   * question rehearsed against a slot that has since moved is stale, and an
   * unanswered question is a "No".
   */
  #land(model: RegisteredModel, inputs: SlotInputs): void {
    this.slots[0].replaceInputs(inputs);
    this.model = model;
    this.chart = this.#chartFor(model);
    this.pendingSwitch = null;
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
