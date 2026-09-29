import { copy } from "$lib/text/copy";
import { formatNumber } from "./numberFormat";
import type { Quantity, QuantityKind } from "./quantities";
import { unitSystem, type UnitSystem } from "./unitSystem";

/**
 * Display units. The conversion formulas live here on purpose: this is the
 * one exception to "the app never implements a formula" (ADR §3). The library
 * is always called in SI, and its own IP units (fps) are not what the tool
 * shows (fpm), so its `units_converter` is never read.
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
const PASCALS_PER_INCH_OF_MERCURY = 3386.389;
const PASCALS_PER_KILOPASCAL = 1000;
const GRAMS_PER_KILOGRAM = 1000;
const POUNDS_PER_KILOPOUND = 1000;

// Both pressure kinds, vapour and atmospheric, are shown in inHg in IP.
const inchesOfMercury: DisplayUnit = {
  symbol: "inHg",
  step: 0.01,
  toSi: (inches) => inches * PASCALS_PER_INCH_OF_MERCURY,
  fromSi: (pascals) => pascals / PASCALS_PER_INCH_OF_MERCURY,
};

// `satisfies Record<QuantityKind, …>`: a kind added to `QuantityKind` fails
// to compile here until the app decides how to display it.
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
  // Stored as the library's kg/kg, shown per thousand, g/kg and lb/klb as the
  // deployed tool's psychrometric chart shows it (ADR-0002 decision 45): two
  // decimals of kg/kg read 0.01 for 30, 50 and 70 % relative humidity at 25 °C.
  humidityRatio: {
    si: {
      symbol: "g/kg",
      step: 1,
      toSi: (gramsPerKilogram) => gramsPerKilogram / GRAMS_PER_KILOGRAM,
      fromSi: (kilogramsPerKilogram) => kilogramsPerKilogram * GRAMS_PER_KILOGRAM,
    },
    ip: {
      symbol: "lb/klb",
      step: 1,
      toSi: (poundsPerKilopound) => poundsPerKilopound / POUNDS_PER_KILOPOUND,
      fromSi: (poundsPerPound) => poundsPerPound * POUNDS_PER_KILOPOUND,
    },
  },
  metabolicRate: sameInBothSystems({ symbol: "met", step: 0.1 }),
  clothingInsulation: sameInBothSystems({ symbol: "clo", step: 0.1 }),
  thermalSensation: sameInBothSystems({ symbol: "", step: 0.1 }),
  // A classified output (`tsv`, `stress_category`): no unit, no meaningful
  // step — it is never an editable input.
  category: sameInBothSystems({ symbol: "", step: 0 }),
  // A boolean output (`acceptability_80`, `compliance`), shown as "Yes" or
  // "No": no unit, and like a category never an editable input.
  yesNo: sameInBothSystems({ symbol: "", step: 0 }),
  // `pa` is in pascals; kPa is the display unit, as in the deployed tool.
  pressure: {
    si: {
      symbol: "kPa",
      step: 0.1,
      toSi: (kilopascals) => kilopascals * PASCALS_PER_KILOPASCAL,
      fromSi: (pascals) => pascals / PASCALS_PER_KILOPASCAL,
    },
    ip: inchesOfMercury,
  },
  // `p_atm` is in pascals and shown in them: in kPa the formatter's two
  // decimals would show 101 325 Pa as 101.33 (ADR-0002 decision 49).
  atmosphericPressure: {
    si: { symbol: "Pa", step: 100, toSi: identity, fromSi: identity },
    ip: inchesOfMercury,
  },
} satisfies Record<QuantityKind, UnitPair>;

export function displayUnitFor(quantity: Quantity, system: UnitSystem): DisplayUnit {
  const pair: UnitPair = displayUnits[quantity.kind];
  return system === unitSystem.si ? pair.si : pair.ip;
}

/** `quantity`'s label with its display unit in brackets, or the bare label when the unit has no symbol. */
export function labelWithUnit(quantity: Quantity, unit: DisplayUnit): string {
  return unit.symbol ? `${quantity.label} (${unit.symbol})` : quantity.label;
}

/**
 * `text`, already in `unit` and formatted, followed by the unit's symbol after
 * a space, or bare when the unit has no symbol. It takes text, not a number,
 * so a formatted bound (`≤ 0.2`) reads the same way as a single value.
 */
export function valueWithUnit(text: string, unit: DisplayUnit): string {
  return unit.symbol ? `${text} ${unit.symbol}` : text;
}

/**
 * The SI `value` as the tool shows it: converted to `unit`, formatted, and
 * followed by the unit's symbol as {@link valueWithUnit} writes it; the dash
 * for anything that is not a finite number.
 */
export function numberWithUnit(value: number, unit: DisplayUnit): string {
  return Number.isFinite(value) ? valueWithUnit(formatNumber(unit.fromSi(value)), unit) : copy.notAvailable;
}
