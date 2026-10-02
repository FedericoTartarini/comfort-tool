import { temperatureMode } from "./entryModes";
import {
  hasClothingGroup,
  hasHumidityGroup,
  hasTemperatureGroup,
  takesRelativeAirSpeed,
  type OptionSpec,
  type OptionsReader,
  type RegisteredModel,
  type Values,
} from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";
import { dynamicClothingOf, expandOperative, relativeAirSpeedOf, relativeHumidityOf, requireValue, type Slot } from "./slot";

const q = quantities;

/**
 * Entry-group representations → the SI quantities the library model takes
 * (ADR §4.5): operative temperature expands to `tdb = tr = operative_tmp`, the
 * humidity entry becomes `rh` at `atmosphericPressure`, and `v` becomes `vr`
 * when the model asks for it, where an entered `vr` is handed over as it is
 * and nothing is derived (ADR-0002 decision 54). A model with the clothing
 * entry group is given the dynamic clothing insulation under `clo`, the
 * library's key for it: the entered clothing insulation corrected by the rule
 * of the model's standard, or an entered dynamic one as it is. So `clo` among
 * the resolved values is the library's, and among a slot's the entry. No
 * `p_atm` is filled: no registered model takes one (ADR-0002 decision 49).
 */
export function resolveQuantities(slot: Slot, model: RegisteredModel, atmosphericPressure: number): Map<Quantity, number> {
  const resolved = new Map(slot.values);

  if (hasTemperatureGroup(model) && slot.temperature.mode === temperatureMode.operative) {
    expandOperative(resolved);
  }

  if (hasHumidityGroup(model)) {
    resolved.set(q.rh, relativeHumidityOf(slot, atmosphericPressure));
  }

  if (takesRelativeAirSpeed(model)) {
    resolved.set(q.vr, relativeAirSpeedOf(slot));
    resolved.delete(q.v);
  }

  if (hasClothingGroup(model)) {
    resolved.set(q.clo, dynamicClothingOf(slot, model));
    resolved.delete(q.clo_dynamic);
  }

  return resolved;
}

/**
 * The values a declaration reads for `slot`, in `run` and in a polygons
 * chart's `comfortZones`: its resolved quantities, wrapped by {@link valuesReader}.
 * On the `run` side, the declaration hardcodes
 * `limit_inputs: false` — `core/applicability.ts` gates entered values
 * against `_INFO` before calling, and the library then always returns numbers
 * rather than NaN, the behaviour of the deployed CBE tool. The rows a run
 * still breaks (derived, output, or the air-speed row when the relative air
 * speed breaks a limit the gate does not hold the entry to) come back on the result's
 * `warnings` and are reported, not gated, by `applicability.violationRows`.
 */
export function toLibraryInputs(slot: Slot, model: RegisteredModel, atmosphericPressure: number): Values {
  return valuesReader(resolveQuantities(slot, model, atmosphericPressure));
}

/**
 * `values` as the object a declaration's `run` reads: one getter per
 * `Quantity`, under its key, and a throw naming the quantity the map does not
 * carry (ADR-0002 decision 34). Never a silent `undefined` — a missing input
 * that reaches the library unnoticed is the failure this shape exists to rule
 * out.
 */
export function valuesReader(values: ReadonlyMap<Quantity, number>): Values {
  const object = {};
  for (const [key, quantity] of Object.entries(quantities)) {
    Object.defineProperty(object, key, { enumerable: true, get: () => requireValue(values, quantity) });
  }
  // `defineProperty` cannot tell the compiler what it added; the loop above
  // defines exactly the table's keys, which is what `Values` promises.
  return object as Values;
}

/**
 * `options` as the reader a declaration's `run` asks: the boolean the slot
 * holds for the option, and a throw naming an option the map does not carry,
 * for the reason {@link valuesReader} gives (ADR-0002 decision 36).
 */
export function optionsReader(options: ReadonlyMap<OptionSpec, boolean>): OptionsReader {
  return (option) => {
    const value = options.get(option);
    if (value === undefined) {
      throw new Error(`Slot has no value for ${option.label}`);
    }
    return value;
  };
}
