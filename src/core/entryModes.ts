import {
  hr_to_rh,
  psy_ta_rh,
  rh_from_dew_point,
  rh_from_vapour_pressure,
  rh_from_wet_bulb,
} from "jsthermalcomfort";
import { quantities, type Quantity } from "./quantities";

/**
 * One way of entering an entry group whose entries are held among a slot's
 * values (`core/slot.ts`'s `valueEntryGroups`). The mode decides which
 * quantities the input panel shows in place of the ones a declaration names,
 * and which of them carries the group's axis; labels come from
 * `Quantity.label` either way (ADR §4.2).
 */
export interface ValueEntryMode {
  readonly id: string;
  /** Quantities shown in place of the group's inputs as a declaration names them. */
  readonly panel: readonly Quantity[];
  /**
   * The quantity that carries the group's axis: what stands in, under this
   * mode, for a quantity only another mode of the group enters.
   */
  readonly axis: Quantity;
}

/**
 * How the user enters temperature. Its `axis` is also the temperature axis of
 * the psychrometric chart.
 */
export type TemperatureMode = ValueEntryMode;

export const temperatureMode = {
  separate: { id: "separate", panel: [quantities.tdb, quantities.tr], axis: quantities.tdb },
  operative: { id: "operative", panel: [quantities.operative_tmp], axis: quantities.operative_tmp },
} as const satisfies Record<string, TemperatureMode>;

/**
 * How the user enters humidity. The entered quantity is the truth; `rh` is
 * derived in `core/slot.ts` (ADR §4.5). Each mode carries its own
 * two conversions, library calls, so no caller switches on mode identity to
 * convert. Both take a humidity (the entered value, or relative humidity),
 * the dry-bulb temperature and the session's atmospheric pressure, the order
 * of the library's conversions to relative humidity. Only humidity ratio's
 * pass the pressure on as `p_atm`: it is the one humidity the pressure moves.
 * `psy_ta_rh` takes a `p_atm` too, but its dew point, wet-bulb temperature and
 * vapour pressure do not depend on it (ADR-0002 decision 49). The two
 * checks for a particular mode are the gate's: `core/applicability.ts` leaves a
 * wet-bulb entry unbounded, because `rh_from_wet_bulb` clamps to 0 – 100
 * (ADR-0002 decision 46), and a humidity-ratio entry unbounded while the
 * pressure is out of range (decision 53). Object order is the panel's order.
 */
export interface HumidityMode {
  readonly id: string;
  readonly quantity: Quantity;
  /** The entered value as relative humidity, at this dry-bulb temperature and atmospheric pressure. */
  readonly toRelativeHumidity: (value: number, tdb: number, atmosphericPressure: number) => number;
  /** Relative humidity expressed in this mode, at this dry-bulb temperature and atmospheric pressure. */
  readonly fromRelativeHumidity: (rh: number, tdb: number, atmosphericPressure: number) => number;
}

export const humidityMode = {
  rh: {
    id: "relative-humidity",
    quantity: quantities.rh,
    // Every parameter named, the unused ones too, so this stays typed as the
    // three-argument signature `satisfies` narrows to: a shorter arrow here
    // would freeze to its own arity and reject the three-argument calls every
    // other caller (and mode) makes. The same holds for the pressure the other
    // modes below take and do not use.
    toRelativeHumidity: (rh, tdb, atmosphericPressure) => rh,
    fromRelativeHumidity: (rh, tdb, atmosphericPressure) => rh,
  },
  humidityRatio: {
    id: "humidity-ratio",
    quantity: quantities.hr,
    toRelativeHumidity: (hr, tdb, atmosphericPressure) => hr_to_rh(hr, tdb, atmosphericPressure),
    fromRelativeHumidity: (rh, tdb, atmosphericPressure) => psy_ta_rh(tdb, rh, atmosphericPressure).hr,
  },
  dewPoint: {
    id: "dew-point",
    quantity: quantities.dew_point_tmp,
    toRelativeHumidity: (dewPoint, tdb, atmosphericPressure) => rh_from_dew_point(dewPoint, tdb),
    fromRelativeHumidity: (rh, tdb, atmosphericPressure) => psy_ta_rh(tdb, rh).t_dp,
  },
  wetBulb: {
    id: "wet-bulb",
    quantity: quantities.wet_bulb_tmp,
    toRelativeHumidity: (wetBulb, tdb, atmosphericPressure) => rh_from_wet_bulb(wetBulb, tdb),
    fromRelativeHumidity: (rh, tdb, atmosphericPressure) => psy_ta_rh(tdb, rh).t_wb,
  },
  vapourPressure: {
    id: "vapour-pressure",
    quantity: quantities.pa,
    toRelativeHumidity: (vapourPressure, tdb, atmosphericPressure) => rh_from_vapour_pressure(vapourPressure, tdb),
    fromRelativeHumidity: (rh, tdb, atmosphericPressure) => psy_ta_rh(tdb, rh).p_vap,
  },
} as const satisfies Record<string, HumidityMode>;
