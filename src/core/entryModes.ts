import { quantities, type Quantity } from "jsthermalcomfort/io";
import {
  hr_to_rh,
  psy_ta_rh,
  rh_from_dew_point,
  rh_from_vapour_pressure,
  rh_from_wet_bulb,
} from "jsthermalcomfort/psychrometrics";

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
 * derived in `core/libraryInputs.ts` (ADR §4.5). Each mode carries its own
 * two conversions — library calls, `p_atm` left at the library's default
 * until "Set pressure" brings `environment` (rewrite plan, Phase 3.6 item 2)
 * — so no caller switches on mode identity. Object order is the panel's order.
 */
export interface HumidityMode {
  readonly id: string;
  readonly quantity: Quantity;
  /** The entered value as relative humidity, at this dry-bulb temperature. */
  readonly toRelativeHumidity: (value: number, tdb: number) => number;
  /** Relative humidity expressed in this mode, at this dry-bulb temperature. */
  readonly fromRelativeHumidity: (rh: number, tdb: number) => number;
}

export const humidityMode = {
  rh: {
    id: "relative-humidity",
    quantity: quantities.rh,
    // A second parameter (unused) so this stays typed as the two-argument
    // signature `satisfies` narrows to: a one-parameter arrow here would
    // freeze to that arity and reject the two-argument calls every other
    // caller (and mode) makes.
    toRelativeHumidity: (rh, tdb) => rh,
    fromRelativeHumidity: (rh, tdb) => rh,
  },
  humidityRatio: {
    id: "humidity-ratio",
    quantity: quantities.hr,
    toRelativeHumidity: (hr, tdb) => hr_to_rh(hr, tdb),
    fromRelativeHumidity: (rh, tdb) => psy_ta_rh(tdb, rh).hr,
  },
  dewPoint: {
    id: "dew-point",
    quantity: quantities.dew_point_tmp,
    toRelativeHumidity: (dewPoint, tdb) => rh_from_dew_point(dewPoint, tdb),
    fromRelativeHumidity: (rh, tdb) => psy_ta_rh(tdb, rh).dew_point_tmp,
  },
  wetBulb: {
    id: "wet-bulb",
    quantity: quantities.wet_bulb_tmp,
    toRelativeHumidity: (wetBulb, tdb) => rh_from_wet_bulb(wetBulb, tdb),
    fromRelativeHumidity: (rh, tdb) => psy_ta_rh(tdb, rh).wet_bulb_tmp,
  },
  vapourPressure: {
    id: "vapour-pressure",
    quantity: quantities.p_vap,
    toRelativeHumidity: (vapourPressure, tdb) => rh_from_vapour_pressure(vapourPressure, tdb),
    fromRelativeHumidity: (rh, tdb) => psy_ta_rh(tdb, rh).p_vap,
  },
} as const satisfies Record<string, HumidityMode>;
