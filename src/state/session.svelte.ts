import { quantities, type Quantity } from "jsthermalcomfort/io";
import { operative_tmp } from "jsthermalcomfort/psychrometrics";
import { SvelteMap } from "svelte/reactivity";
import type { ChartType } from "$lib/core/chartType";
import { humidityMode, temperatureMode, type HumidityMode, type TemperatureMode } from "$lib/core/entryModes";
import { dynamicChartOf, type RegisteredModel } from "$lib/core/modelDeclaration";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";

const q = quantities;

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
    for (const [quantity, value] of model.inputs) {
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
    const tdb = this.values.get(q.tdb) ?? this.require(q.operative_tmp);
    const rh = this.humidity.mode.toRelativeHumidity(this.humidity.value, tdb);
    this.humidity = { mode, value: mode.fromRelativeHumidity(rh, tdb) };
  }

  /**
   * Convert the stored temperatures into the new representation. Separate →
   * operative uses the library's `operative_tmp(tdb, tr, v)`; operative →
   * separate sets `tdb = tr = operative_tmp`. Lossy and one-way, as in the old
   * tool.
   */
  setTemperatureMode(mode: TemperatureMode): void {
    if (mode === this.temperature.mode) {
      return;
    }
    if (mode === temperatureMode.operative) {
      const operative = operative_tmp(this.require(q.tdb), this.require(q.tr), this.require(q.v));
      this.values.set(q.operative_tmp, operative);
      this.values.delete(q.tdb);
      this.values.delete(q.tr);
    } else {
      const operative = this.require(q.operative_tmp);
      this.values.set(q.tdb, operative);
      this.values.set(q.tr, operative);
      this.values.delete(q.operative_tmp);
    }
    this.temperature = { mode };
  }

  private require(quantity: Quantity): number {
    const value = this.values.get(quantity);
    if (value === undefined) {
      throw new Error(`Slot has no value for ${quantity.label}`);
    }
    return value;
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
      throw new Error(`${model.model.label} declares no dynamic chart; ADR §4.4 gives every model one`);
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

  setModel(model: RegisteredModel): void {
    if (model === this.model) {
      return;
    }
    this.model = model;
    this.chart = this.#chartFor(model);
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
