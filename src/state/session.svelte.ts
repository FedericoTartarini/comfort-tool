import { SvelteMap } from "svelte/reactivity";
import type { ChartType } from "$lib/core/chartType";
import { humidityMode, temperatureMode, type HumidityMode, type TemperatureMode } from "$lib/core/entryModes";
import { resolvedTdb, withTemperatureMode, type SlotInputs } from "$lib/core/libraryInputs";
import { dynamicChartOf, type RegisteredModel } from "$lib/core/modelDeclaration";
import { rehearseSwitch } from "$lib/core/modelSwitch";
import type { Quantity } from "$lib/core/quantities";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";

/**
 * One set of inputs (ADR §4.5). Canonical SI; the quantity the user entered is
 * the truth. `values` is the cross-model superset bag: it excludes `rh`
 * (held in `humidity`), stores `operative_tmp` under operative mode and
 * `tdb` / `tr` under separate mode.
 */
export class InputSlot {
  readonly values = new SvelteMap<Quantity, number>();
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
   * Hold what `inputs` holds: quantities it does not carry are dropped, the
   * rest are set, and the humidity and temperature entries are replaced. The
   * `values` map is mutated rather than swapped, because the input panel and
   * the derivations hold it and its reactivity is its own. `inputs` may be
   * this slot itself, when the core function it came from found nothing to
   * change; both loops then do nothing.
   */
  replaceInputs(inputs: SlotInputs): void {
    for (const quantity of [...this.values.keys()]) {
      if (!inputs.values.has(quantity)) {
        this.values.delete(quantity);
      }
    }
    for (const [quantity, value] of inputs.values) {
      this.values.set(quantity, value);
    }
    this.humidity = inputs.humidity;
    this.temperature = inputs.temperature;
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

/** Shared by Standard and Explore (ADR §4.5). Compare arrives in Phase 5. */
export class Session {
  // All three hold objects compared by identity elsewhere, so `$state.raw`.
  model: RegisteredModel;
  unitSystem = $state.raw<UnitSystem>(unitSystem.si);
  /** The chart settings of the current model. */
  chart: ChartState;
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
    this.slots[0].replaceInputs(rehearseSwitch(this.slots[0], model));
    this.model = model;
    this.chart = this.#chartFor(model);
  }

  /**
   * The app's own way of switching: the person asked for `model` from a page
   * they are already on, so the session may have a question about it
   * (ADR-0002 decision 32). Requesting is therefore a different act from
   * setting, even while the two do the same thing — the question, and the
   * pending switch that holds it, arrive with the dialog. Until then every
   * request lands, by the one path a model ever lands on.
   */
  requestModel(model: RegisteredModel): void {
    this.setModel(model);
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
