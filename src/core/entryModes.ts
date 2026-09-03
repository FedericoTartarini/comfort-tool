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
  operative: { id: "operative", panel: [quantities.t_o], axis: quantities.t_o },
} as const satisfies Record<string, TemperatureMode>;

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
