import { heat_index, humidex, wc } from "jsthermalcomfort";
import { CalculationSource } from "../../models/calculationMetadata";
import type { ThermalIndicesRequestDto, ThermalIndicesResponseDto } from "../../models/comfortDtos";
import {
  ensureFiniteValue,
  getHeatIndexCategory,
  getHumidexDiscomfort,
  getWindChillZone,
} from "./helpers";
import { UnitSystem } from "../../models/units";
import { FieldKey } from "../../models/fieldKeys";
import { convertFieldValueToSi, convertFieldValueFromSi } from "../units/index";

/**
 * Main entry point for calculation of thermal indices (Heat Index, Humidex, Wind Chill).
 * @param payload The request parameters.
 * @returns An object containing the calculated indices and categories.
 */
export function calculateThermalIndices(payload: ThermalIndicesRequestDto): ThermalIndicesResponseDto {
  // Inputs normalized to SI for internal logic
  const tdbSi = convertFieldValueToSi(FieldKey.DryBulbTemperature, payload.tdb, payload.units);
  
  // Handle optional wind speed input, convert if provided
  let vSi: number | undefined;
  if (payload.v !== undefined) {
    vSi = convertFieldValueToSi(FieldKey.WindSpeed, payload.v, payload.units);
  }

  // Heat Index calculation
  const result = heat_index(payload.tdb, payload.rh, { units: payload.units, round: true });
  const hi = result.hi;
  
  // Categorization must use Celsius values
  const hiSi = convertFieldValueToSi(FieldKey.DryBulbTemperature, hi, payload.units);
  const category = getHeatIndexCategory(hiSi);

  // Humidex calculation (expects Celsius)
  const humidexResult = humidex(tdbSi, payload.rh, { round: true });
  const humidexDiscomfort = getHumidexDiscomfort(humidexResult.humidex);

  // Wind Chill calculation (expects Celsius and m/s)
  let wci = undefined;
  let wciTemp = undefined;
  let wciZone = undefined;
  
  // Calculate Wind Chill if wind speed is provided
  if (vSi !== undefined) {
    // Calculate Wind Chill Index (expects SI)
    const wcResult = wc(tdbSi, vSi, { round: true });
    wci = wcResult.wci;
    
    // Calculate Wind Chill Temperature using formula (expects tdbSi in Celsius and vSi in m/s)
    // Only applied if wind speed is greater than 1.33 m/s and temperature is less than or equal to 10 Celsius
    if (vSi > 1.33 && tdbSi <= 10) {
      // 13.95 (wind coefficient) and 0.486 (temp/wind interaction) are calibrated for m/s
      wciTemp = 13.12 + 0.6215 * tdbSi - 13.95 * Math.pow(vSi, 0.16) + 0.486 * tdbSi * Math.pow(vSi, 0.16);
      
      // Convert result back to requested unit system if needed
      if (payload.units === UnitSystem.IP) {
        wciTemp = convertFieldValueFromSi(FieldKey.DryBulbTemperature, wciTemp, UnitSystem.IP);
      }
    } else {
      // In mild conditions, Wind Chill Temp is equal to Air Temp
      wciTemp = payload.tdb;
    }
    // Categorization must use Celsius values
    wciZone = getWindChillZone(wci);
  }

  // Ensure we return finite values for the optional Wind Chill indices
  let finalWci: number | undefined;
  if (wci !== undefined) {
    finalWci = ensureFiniteValue("Wind Chill", wci);
  }
  let finalWciTemp: number | undefined;
  if (wciTemp !== undefined) {
    finalWciTemp = ensureFiniteValue("Wind Chill Temp", wciTemp);
  }

  return {
    hi: ensureFiniteValue("Heat Index", hi),
    category,
    humidex: ensureFiniteValue("Humidex", humidexResult.humidex),
    humidexDiscomfort,
    wci: finalWci,
    wciTemp: finalWciTemp,
    wciZone,
    source: CalculationSource.JsThermalComfort,
  };
}
