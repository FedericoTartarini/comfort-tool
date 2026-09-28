import { v_relative } from "jsthermalcomfort";
import { temperatureMode } from "./entryModes";
import {
  hasHumidityGroup,
  hasTemperatureGroup,
  type OptionSpec,
  type OptionsReader,
  type RegisteredModel,
  type Values,
} from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";
import { expandOperative, relativeHumidityOf, requireValue, type SlotInputs } from "./slot";

const q = quantities;

/**
 * Entry-group representations → the SI quantities the library model takes
 * (ADR §4.5): operative temperature expands to `tdb = tr = operative_tmp`, the
 * humidity entry becomes `rh`, and `v` becomes `vr` when the model asks for it.
 */
export function resolveQuantities(slot: SlotInputs, model: RegisteredModel): Map<Quantity, number> {
  const resolved = new Map(slot.values);

  if (hasTemperatureGroup(model) && slot.temperature.mode === temperatureMode.operative) {
    expandOperative(resolved);
  }

  if (hasHumidityGroup(model)) {
    resolved.set(q.rh, relativeHumidityOf(slot));
  }

  if (model.relativeAirSpeed) {
    resolved.set(q.vr, v_relative(requireValue(resolved, q.v), requireValue(resolved, q.met)));
    resolved.delete(q.v);
  }

  return resolved;
}

/**
 * The values a declaration reads for `slot`, in `run` and in a polygons
 * chart's `zones`: its resolved quantities, wrapped by {@link valuesReader}.
 * On the `run` side, the declaration hardcodes
 * `limit_inputs: false` — `core/applicability.ts` gates entered values
 * against `_INFO` before calling, and the library then always returns numbers
 * rather than NaN, the behaviour of the deployed CBE tool. The rows a run
 * still breaks (derived, output, or the `v` row when `vr = v + 0.3(met − 1)`
 * breaks it while the entered `v` does not) come back on the result's
 * `warnings` and are reported, not gated, by `applicability.violationRows`.
 */
export function toLibraryInputs(slot: SlotInputs, model: RegisteredModel): Values {
  return valuesReader(resolveQuantities(slot, model));
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
