import { PhysicalQuantityId, type QuantityState } from "../../catalog/quantities";
import {
  derivePsychrometricSlots,
  type DerivedSlotQuantityState,
} from "./derivations/psychrometrics";
import { InputId, type InputId as InputIdType } from "../../catalog/inputSlots";
import {
  TemperatureMode,
  type TemperatureMode as TemperatureModeType,
} from "../../catalog/inputModes";
import { t_o } from "jsthermalcomfort";
import {
  QuantitiesByInputState,
  syncAllDerivedQuantities,
  syncDerivedQuantities,
} from "./quantityStateRouting";

export { derivePsychrometricSlots } from "./derivations/psychrometrics";

export function deriveInputsDerivedState(
  quantitiesByInput: QuantitiesByInputState,
): Record<InputIdType, DerivedSlotQuantityState> {
  return {
    [InputId.Input1]: derivePsychrometricSlots(quantitiesByInput[InputId.Input1]),
    [InputId.Input2]: derivePsychrometricSlots(quantitiesByInput[InputId.Input2]),
    [InputId.Input3]: derivePsychrometricSlots(quantitiesByInput[InputId.Input3]),
  };
}

export function syncDerivedState(
  quantitiesByInput: QuantitiesByInputState,
): void {
  syncAllDerivedQuantities(quantitiesByInput, derivePsychrometricSlots);
}

export function syncDerivedStateForInput(
  inputId: InputIdType,
  quantitiesByInput: QuantitiesByInputState,
): void {
  syncDerivedQuantities(
    quantitiesByInput[inputId],
    derivePsychrometricSlots(quantitiesByInput[inputId]),
  );
}

export function synchronizeTemperatureMode(
  inputState: QuantityState,
  temperatureMode: TemperatureModeType,
): { inputState: QuantityState } {
  if (temperatureMode === TemperatureMode.Air) {
    return { inputState: { ...inputState } };
  }

  const dryBulb = inputState[PhysicalQuantityId.DryBulbTemperature];
  const radiant = inputState[PhysicalQuantityId.MeanRadiantTemperature];
  const airSpeed = inputState[PhysicalQuantityId.RelativeAirSpeed];
  if (dryBulb === undefined || radiant === undefined || airSpeed === undefined) {
    return { inputState: { ...inputState } };
  }

  const operativeTemperature = t_o(dryBulb, radiant, airSpeed);

  return {
    inputState: {
      ...inputState,
      [PhysicalQuantityId.DryBulbTemperature]: operativeTemperature,
      [PhysicalQuantityId.MeanRadiantTemperature]: operativeTemperature,
    },
  };
}

export function readDerivedQuantities(
  quantities: QuantityState,
): DerivedSlotQuantityState {
  const derived = derivePsychrometricSlots(quantities);
  return {
    [PhysicalQuantityId.DewPointTemperature]: quantities[PhysicalQuantityId.DewPointTemperature]
      ?? derived[PhysicalQuantityId.DewPointTemperature],
    [PhysicalQuantityId.HumidityRatio]: quantities[PhysicalQuantityId.HumidityRatio]
      ?? derived[PhysicalQuantityId.HumidityRatio],
    [PhysicalQuantityId.WetBulbTemperature]: quantities[PhysicalQuantityId.WetBulbTemperature]
      ?? derived[PhysicalQuantityId.WetBulbTemperature],
    [PhysicalQuantityId.VaporPressure]: quantities[PhysicalQuantityId.VaporPressure]
      ?? derived[PhysicalQuantityId.VaporPressure],
  };
}
