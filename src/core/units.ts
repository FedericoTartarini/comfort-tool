import type { Quantity, QuantityKind } from "jsthermalcomfort/io";
import { unitSystem, type UnitSystem } from "./unitSystem";

/**
 * Display units. The conversion formulas live here on purpose: this is the
 * one exception to "the app never implements a formula" (ADR §3). The library
 * is always called in SI, and its own IP units (fps) are not what the tool
 * shows (fpm), so `Quantity.ipUnit` and `units_converter` are never read.
 */
export interface DisplayUnit {
  readonly symbol: string;
  /** Input step in the displayed unit (ADR §4.6). */
  readonly step: number;
  toSi(value: number): number;
  fromSi(value: number): number;
}

interface UnitPair {
  readonly si: DisplayUnit;
  readonly ip: DisplayUnit;
}

const identity = (value: number): number => value;

function sameInBothSystems(unit: Pick<DisplayUnit, "symbol" | "step">): UnitPair {
  const both: DisplayUnit = { ...unit, toSi: identity, fromSi: identity };
  return { si: both, ip: both };
}

const METRES_PER_FOOT = 0.3048;
const SECONDS_PER_MINUTE = 60;
const KILOPASCALS_PER_INCH_OF_MERCURY = 3.386389;

// `satisfies Record<QuantityKind, …>`: when the library adds a kind, this
// table fails to compile until the app decides how to display it.
const displayUnits = {
  temperature: {
    si: { symbol: "°C", step: 0.1, toSi: identity, fromSi: identity },
    ip: {
      symbol: "°F",
      step: 0.1,
      toSi: (fahrenheit) => ((fahrenheit - 32) * 5) / 9,
      fromSi: (celsius) => (celsius * 9) / 5 + 32,
    },
  },
  airSpeed: {
    si: { symbol: "m/s", step: 0.05, toSi: identity, fromSi: identity },
    ip: {
      symbol: "fpm",
      step: 10,
      toSi: (feetPerMinute) => (feetPerMinute * METRES_PER_FOOT) / SECONDS_PER_MINUTE,
      fromSi: (metresPerSecond) => (metresPerSecond / METRES_PER_FOOT) * SECONDS_PER_MINUTE,
    },
  },
  percentage: sameInBothSystems({ symbol: "%", step: 1 }),
  metabolicRate: sameInBothSystems({ symbol: "met", step: 0.1 }),
  clothingInsulation: sameInBothSystems({ symbol: "clo", step: 0.1 }),
  thermalSensation: sameInBothSystems({ symbol: "", step: 0.1 }),
  pressure: {
    si: { symbol: "kPa", step: 0.1, toSi: identity, fromSi: identity },
    ip: {
      symbol: "inHg",
      step: 0.01,
      toSi: (inchesOfMercury) => inchesOfMercury * KILOPASCALS_PER_INCH_OF_MERCURY,
      fromSi: (kilopascals) => kilopascals / KILOPASCALS_PER_INCH_OF_MERCURY,
    },
  },
} satisfies Record<QuantityKind, UnitPair>;

export function displayUnitFor(quantity: Quantity, system: UnitSystem): DisplayUnit {
  const pair: UnitPair = displayUnits[quantity.kind];
  return system === unitSystem.si ? pair.si : pair.ip;
}
