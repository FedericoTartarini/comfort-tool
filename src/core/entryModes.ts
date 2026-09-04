import { quantities, type Quantity } from "jsthermalcomfort/io";

/**
 * How the user enters temperature. The mode decides which quantities the
 * input panel shows and which one is the temperature axis of the
 * psychrometric chart; labels come from `Quantity.label` either way (ADR §4.2).
 */
export interface TemperatureMode {
  readonly id: string;
  /** Quantities shown in place of the model's temperature inputs. */
  readonly panel: readonly Quantity[];
  /** The temperature axis of the psychrometric chart. */
  readonly axis: Quantity;
}

export const temperatureMode = {
  separate: { id: "separate", panel: [quantities.tdb, quantities.tr], axis: quantities.tdb },
  operative: { id: "operative", panel: [quantities.operative_tmp], axis: quantities.operative_tmp },
} as const satisfies Record<string, TemperatureMode>;

/**
 * The quantity that stands in for `quantity` under `mode`.
 *
 * Temperatures are named per mode, so anything remembered across a mode switch
 * has to be re-pointed: a remembered `tdb` or `tr` becomes `operative_tmp`
 * under operative entry, and `operative_tmp` becomes `tdb` again under
 * separate entry. Every other quantity is returned untouched.
 */
export function underTemperatureMode(quantity: Quantity, mode: TemperatureMode): Quantity {
  if (mode.panel.includes(quantity)) {
    return quantity;
  }
  const belongsToAnotherMode = Object.values(temperatureMode).some((entry) =>
    (entry.panel as readonly Quantity[]).includes(quantity),
  );
  return belongsToAnotherMode ? mode.axis : quantity;
}

/**
 * How the user enters humidity. The entered quantity is the truth; `rh` is
 * derived in `core/libraryInputs.ts` (ADR §4.5). Only relative humidity is
 * declared until the library ships the inverse conversions (rewrite plan,
 * Phase 2b).
 */
export interface HumidityMode {
  readonly id: string;
  readonly quantity: Quantity;
}

export const humidityMode = {
  rh: { id: "relative-humidity", quantity: quantities.rh },
} as const satisfies Record<string, HumidityMode>;
