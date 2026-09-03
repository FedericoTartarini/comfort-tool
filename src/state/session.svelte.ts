import { quantities, type Quantity } from "jsthermalcomfort/io";
import { t_o } from "jsthermalcomfort/psychrometrics";
import { SvelteMap } from "svelte/reactivity";
import { humidityMode, temperatureMode, type HumidityMode, type TemperatureMode } from "$lib/core/entryModes";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";

const q = quantities;

/**
 * One set of inputs (ADR §4.5). Canonical SI; the quantity the user entered is
 * the truth. `values` is the cross-model superset bag: it excludes `rh`
 * (held in `humidity`), stores `t_o` under operative mode and `tdb` / `tr`
 * under separate mode.
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
   * Convert the stored temperatures into the new representation. Separate →
   * operative uses the library's `t_o(tdb, tr, v)`; operative → separate sets
   * `tdb = tr = t_o`. Lossy and one-way, as in the old tool.
   */
  setTemperatureMode(mode: TemperatureMode): void {
    if (mode === this.temperature.mode) {
      return;
    }
    if (mode === temperatureMode.operative) {
      const operative = t_o(this.require(q.tdb), this.require(q.tr), this.require(q.v));
      this.values.set(q.t_o, operative);
      this.values.delete(q.tdb);
      this.values.delete(q.tr);
    } else {
      const operative = this.require(q.t_o);
      this.values.set(q.tdb, operative);
      this.values.set(q.tr, operative);
      this.values.delete(q.t_o);
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

/** Shared by Standard and Explore (ADR §4.5). Compare and chart state arrive in Phase 3 / 5. */
export class Session {
  // Both hold objects compared by identity elsewhere, so `$state.raw`.
  model: RegisteredModel;
  unitSystem = $state.raw<UnitSystem>(unitSystem.si);
  readonly slots: readonly [InputSlot, InputSlot, InputSlot];

  constructor(model: RegisteredModel) {
    this.model = $state.raw(model);
    this.slots = [new InputSlot(model), new InputSlot(model), new InputSlot(model)];
  }
}
