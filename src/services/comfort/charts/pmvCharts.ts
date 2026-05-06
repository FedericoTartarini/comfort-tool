/**
 * PMV Comfort Chart Services
 * 
 * Provides functions for building PMV (Predicted Mean Vote) and PPD 
 * (Predicted Percentage of Dissatisfied) charts. Includes logic for rendering 
 * psychrometric charts with comfort zone boundaries and dynamic PMV visualizations.
 */
import { FieldKey } from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import { CalculationSource } from "../../../models/calculationMetadata";
import { inputDisplayMetaById } from "../../../models/inputSlotPresentation";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import type {
  ComfortPointDto,
  PlotlyChartResponseDto,
  PlotTraceDto,
  PmvChartInputsRequestDto,
  PmvChartSourceDto,
} from "../../../models/comfortDtos";
import { InputId as InputIdType } from "../../../models/inputSlots";
import type { FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import {
  convertFieldValueFromSi,
  convertFieldValueToSi,
  convertHumidityRatioFromSi,
  getHumidityRatioDisplayMeta,
} from "../../units";
import { calculateComfortZone } from "../comfortZone";
import {
  getCompareInputs,
  roundValue,
  type ComfortZonesByInput,
} from "../helpers";
import { pmv_ppd, psy_ta_rh, p_sat, t_o } from "jsthermalcomfort";
import { buildComfortPolygonTrace, buildInputScatterTrace, buildLineTrace, buildContourTrace } from "./plotlyBuilders";

import { pmvZones, getPmvZoneMeta } from "../../../models/pmvZones";

// Color scale for the PMV chart dynamically generated from pmvZones
const PMV_COLORSCALE = pmvZones.reduce((acc, zone, index, array) => {
  // Calculate the step size for the color scale.
  const step = 1 / array.length;
  // Start point of the discrete color block for this zone.
  acc.push([index * step, zone.color]);
  // End point of the discrete color block for this zone.
  acc.push([(index + 1) * step, zone.color]);
  return acc;
}, [] as [number, string][]);

// Contours for the PMV chart.
const PMV_CONTOURS = {
  start: -2.5,
  end: 2.5,
  size: 1,
  type: "levels",
  coloring: "fill",
  showlines: true,
  // This tells the rendering engine to mathematically interpolate and soften the edges of the colored zones
  smoothing: 1,
  line: { width: 1, color: "#333333" },
};

/**
 * Applies a light 3-point smoothing pass to X coordinates only.
 * This keeps the first/last points fixed while softening small left/right jitter
 * introduced by the comfort-zone solver sampling.
 * @param xValues - The x-coordinates of the comfort zone polygon.
 * @returns The smoothed x-coordinates.
 */
function smoothComfortZoneXValues(xValues: number[]): number[] {
  // If there are less than 3 x-values, return them as is.
  if (xValues.length < 3) {
    return xValues;
  }
  // Smooths the x-coordinates of the comfort zone polygon. If index is 0 or last, return as is.
  return xValues.map((value, index) => (
    index === 0 || index === xValues.length - 1
      ? value
      : Math.round((((xValues[index - 1] + (value * 2) + xValues[index + 1]) / 4) * 1000)) / 1000
  ));
}



/**
 * Builds a closed comfort-zone polygon while smoothing only the X axis.
 * The Y axis remains untouched so the RH/humidity-ratio sampling stays exact.
 * @param coolEdge - The cool edge of the comfort zone.
 * @param warmEdge - The warm edge of the comfort zone.
 * @param getX - A function to get the x-coordinate from a comfort point.
 * @param getY - A function to get the y-coordinate from a comfort point.
 * @returns The comfort zone polygon.
 */
export function buildComfortZonePolygon(
  coolEdge: ComfortPointDto[],
  warmEdge: ComfortPointDto[],
  getX: (point: ComfortPointDto) => number,
  getY: (point: ComfortPointDto) => number,
): { polygonX: number[]; polygonY: number[] } {
  // Smooths the x-coordinates of the comfort zone polygon.
  const coolX = smoothComfortZoneXValues(coolEdge.map(getX));
  // Gets the y-coordinates of the comfort zone polygon.
  const coolY = coolEdge.map(getY);
  // Smooths the x-coordinates of the comfort zone polygon.
  const warmX = smoothComfortZoneXValues(warmEdge.map(getX));
  // Gets the y-coordinates of the comfort zone polygon.
  const warmY = warmEdge.map(getY);

  // Returns the polygon x and y coordinates by concatenating the cool and warm edges.
  return {
    polygonX: coolX.concat(warmX.slice().reverse()),
    polygonY: coolY.concat(warmY.slice().reverse()),
  };
}

/**
 * Retrieves or computes the comfort zone polygon boundaries for a given set of PMV inputs.
 *
 * @param inputId The ID of the input being generated.
 * @param payload The canonical PMV inputs for that slot.
 * @param comfortZonesByInput A cache containing previously computed comfort zones.
 * @returns The resolved ComfortZone mapping.
 */
function getComfortZoneForInput(inputId, payload, comfortZonesByInput: ComfortZonesByInput) {
  // Returns the comfort zone for the given input ID.
  return comfortZonesByInput[inputId] ?? calculateComfortZone(payload);
}

/**
 * Converts humidity ratio from SI units to the display units defined by the UnitSystem.
 *
 * @param temperature Air temperature in Celsius (required for conversion).
 * @param relativeHumidity Relative humidity in percent.
 * @param unitSystem The target unit system (SI or IP).
 * @returns Humidity ratio in the display units for the specified system.
 */
function getHumidityRatioDisplayValue(
  temperature: number,
  relativeHumidity: number,
  unitSystem: UnitSystemType,
): number {
  return convertHumidityRatioFromSi(psy_ta_rh(temperature, relativeHumidity).hr, unitSystem);
}

/**
 * Builds the psychrometric chart (Temperature vs Humidity Ratio) specific to the PMV model.
 * Maps out curves, comfort boundary polygons, and scatter points for inputs.
 *
 * @param payload The Chart Inputs structure.
 * @param comfortZonesByInput The computed comfort zones per input.
 * @param unitSystem The UI state representation style.
 * @returns Complete plotly response bindings (traces, annotations, layout).
 */
export function buildComparePsychrometricChart(
  // PMV Chart Inputs Request Data Transfer Object (DTO).
  payload: PmvChartInputsRequestDto,
  // Comfort zones calculated for each input.
  comfortZonesByInput: ComfortZonesByInput = {},
  // Unit system (SI or IP).
  unitSystem: UnitSystemType = UnitSystem.SI,
  // Full chart source context for baseline selection.
  chartSource?: PmvChartSourceDto,
): PlotlyChartResponseDto {
  // Get the inputs for the chart.
  const inputs = getCompareInputs(payload.inputs);
  // Show input legend if there are multiple inputs.
  const showInputLegend = inputs.length > 1;
  // Get chart range and display metadata.
  const { chartRange } = payload;
  const temperatureDisplayUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  const humidityRatioMeta = getHumidityRatioDisplayMeta(unitSystem);
  // Generate temperature points for drawing curves.
  const temperatures = Array.from({ length: chartRange.tdbPoints }, (_, index) => (
    chartRange.tdbMin + ((chartRange.tdbMax - chartRange.tdbMin) * index) / (chartRange.tdbPoints - 1)
  ));

  const traces: PlotTraceDto[] = [];

  // Generate a background contour plot for the PMV ranges. If no baseline input is selected, use the first input.
  const activeInputPayload = (payload.inputs[chartSource?.baselineInputId as InputIdType] || inputs[0]?.payload);
  if (activeInputPayload) {
    // Number of points for the contour plot.
    const xPoints = 50;
    const yPoints = 50;
    // X and Y values for the contour plot.
    const xValuesSi: number[] = [];
    const yValuesSi: number[] = [];
    // Generate x and y values for the contour plot.
    for (let i = 0; i < xPoints; i++) xValuesSi.push(chartRange.tdbMin + (chartRange.tdbMax - chartRange.tdbMin) * (i / (xPoints - 1)));
    for (let i = 0; i < yPoints; i++) yValuesSi.push(chartRange.humidityRatioMin + (chartRange.humidityRatioMax - chartRange.humidityRatioMin) * (i / (yPoints - 1)));

    // Z values for the contour plot.
    const zValues: number[][] = [];
    // Text values for the contour plot.
    const textValues: string[][] = [];
    // Generate z and text values for the contour plot.
    for (let i = 0; i < yPoints; i++) {
      // Row of z and text values for the contour plot.
      const row: number[] = [];
      const textRow: string[] = [];
      // Humidity ratio for the current row.
      const hr = yValuesSi[i];
      // Temperature for the current column.
      for (let j = 0; j < xPoints; j++) {
        // Temperature for the current column.
        const tdb = xValuesSi[j];
        // Atmospheric pressure in Pascals.
        const pAtm = 101325;
        // Vapor pressure in Pascals.
        const pVap = (hr * pAtm) / (0.62198 + hr);
        // Saturation vapor pressure in Pascals.
        const pSaturation = p_sat(tdb);
        // Relative humidity in percent.
        const rh = Math.min(100, Math.max(0, (pVap / pSaturation) * 100));
        // Calculate PMV and PPD for the current temperature and humidity ratio.
        try {
          const pmvResult = pmv_ppd(tdb, activeInputPayload.tr, activeInputPayload.vr, rh, activeInputPayload.met, activeInputPayload.clo, activeInputPayload.wme, "ASHRAE", { limit_inputs: false });
          row.push(pmvResult.pmv);
          textRow.push(getPmvZoneMeta(pmvResult.pmv).label);
        // Catch any errors in the PMV calculation.
        } catch {
          row.push(NaN);
          textRow.push("");
        }
      }
      // Add the row of z values to the z values.
      zValues.push(row);
      textValues.push(textRow);
    }
    // Convert the x and y values to the display units.
    const displayXValues = xValuesSi.map(x => convertFieldValueFromSi(FieldKey.DryBulbTemperature, x, unitSystem));
    const displayYValues = yValuesSi.map(y => convertHumidityRatioFromSi(y, unitSystem));
    
    // Add the contour trace to the traces.
    traces.push(buildContourTrace({
      name: "PMV Zones",
      x: displayXValues,
      y: displayYValues,
      z: zValues,
      text: textValues,
      colorscale: PMV_COLORSCALE,
      contours: PMV_CONTOURS,
      // Only show PMV values between -3.5 and 3.5
      zmin: -3.5,
      zmax: 3.5,
      hovertemplate: `Tdb: %{x:.1f} ${temperatureDisplayUnits}<br>Humidity ratio: %{y:.${humidityRatioMeta.decimals}f} ${humidityRatioMeta.displayUnits}<br><b>Zone: %{text}</b><br>PMV: %{z:.2f}<extra></extra>`,
      opacity: 0.80,
      isZone: true,
    }));
  }

  // Generate relative humidity (RH) curves.
  payload.rhCurves.forEach((relativeHumidity) => {
    // X-axis values.
    const xValues: number[] = [];
    // Y-axis values.
    const yValues: number[] = [];
    // Generate the curve for the current relative humidity.
    temperatures.forEach((temperature) => {
      const humidityRatioSi = psy_ta_rh(temperature, relativeHumidity).hr;
      const humidityRatio = convertHumidityRatioFromSi(humidityRatioSi, unitSystem);
      // Add the point to the curve if it is within the chart range.
      if (humidityRatioSi >= chartRange.humidityRatioMin && humidityRatioSi <= chartRange.humidityRatioMax) {
        xValues.push(roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, temperature, unitSystem)));
        yValues.push(roundValue(humidityRatio));
      }
    });
    // Add the curve to the traces if it has any points.
    if (xValues.length === 0) {
      return;
    }
    // Add the curve to the traces.
    traces.push(buildLineTrace({
      // Name of the curve.
      name: `RH ${relativeHumidity}%`,
      // X-axis values.
      x: xValues,
      // Y-axis values.
      y: yValues,
      // Color of the curve.
      color: "#94a3b8",
      // Hover template for the curve.
      hovertemplate: `Tdb %{x:.1f} ${temperatureDisplayUnits}<br>` +
      `Humidity ratio %{y:.${humidityRatioMeta.decimals}f} ${humidityRatioMeta.displayUnits}<extra></extra>`,
    }));
  });

  // Generate comfort zones and data points for each input.
  inputs.forEach(({ inputId, payload: inputPayload }) => {
    // Get the comfort zone for the current input.
    const comfortZone = getComfortZoneForInput(inputId, inputPayload, comfortZonesByInput);
    
    // Build the comfort zone polygon by mapping the cool/warm edges to chart coordinates. 
    // This converts SI temperature and RH into rounded display values for the X (Temperature) and Y (Humidity Ratio) axes.
    const { polygonX, polygonY } =  buildComfortZonePolygon(
      comfortZone.coolEdge || [],
      comfortZone.warmEdge || [],
      (point) => roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, point.tdb, unitSystem)),
      (point) => roundValue(getHumidityRatioDisplayValue(point.tdb, point.rh, unitSystem)),
    );

    if (polygonX.length > 0) {
      // Add the shaded comfort zone polygon.
      traces.push(buildComfortPolygonTrace({
        inputId,
        nameSuffix: "comfort zone",
        polygonX,
        polygonY,
        // Tooltip text for the comfort zone.
        hovertemplate: `Tdb %{x:.1f} ${temperatureDisplayUnits}<br>` +
        `Humidity ratio %{y:.${humidityRatioMeta.decimals}f} ${humidityRatioMeta.displayUnits}<extra></extra>`,
        isZone: true,
      }));
    }

    // Add the data point for the current conditions.
    traces.push(buildInputScatterTrace({
      inputId,
      // Convert coordinates to display units.
      x: roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, inputPayload.tdb, unitSystem)),
      y: roundValue(getHumidityRatioDisplayValue(inputPayload.tdb, inputPayload.rh, unitSystem)),
      showLegend: showInputLegend,
      // Tooltip text for the data point.
      hovertemplate: `${inputDisplayMetaById[inputId]?.label ?? "Input"}<br>Tdb %{x:.1f} ${temperatureDisplayUnits}<br>` +
      `Humidity ratio %{y:.${humidityRatioMeta.decimals}f} ${humidityRatioMeta.displayUnits}<extra></extra>`,
    }));
  });

  // Return the chart traces and layout.
  return {
    traces,
    layout: {
      // Chart title.
      title: "Psychrometric chart",
      // Background colors.
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#f8fafc",
      // Show legend if multiple inputs.
      showlegend: showInputLegend,
      // Margins.
      margin: { l: 56, r: 24, t: 48, b: 80 },
      // X-axis (Dry bulb temperature).
      xaxis: {
        title: `Dry bulb temperature (${temperatureDisplayUnits})`,
        range: [
          convertFieldValueFromSi(FieldKey.DryBulbTemperature, chartRange.tdbMin, unitSystem),
          convertFieldValueFromSi(FieldKey.DryBulbTemperature, chartRange.tdbMax, unitSystem),
        ],
        gridcolor: "#e2e8f0",
      },
      // Y-axis (Humidity ratio).
      yaxis: {
        title: `Humidity ratio (${humidityRatioMeta.displayUnits})`,
        range: [
          convertHumidityRatioFromSi(chartRange.humidityRatioMin, unitSystem),
          convertHumidityRatioFromSi(chartRange.humidityRatioMax, unitSystem),
        ],
        gridcolor: "#e2e8f0",
      },
      // Legend and height.
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    // Annotations.
    annotations: [],
    // The source of the calculation, indicating it was generated directly in the browser.
    source: CalculationSource.FrontendGenerated,
  };
}

/**
 * Builds a dynamic 2D chart for PMV by evaluating PMV over a grid of X and Y values.
 * @param payload - The PMV chart inputs request DTO.
 * @param dynamicXAxis - The dynamic X-axis field key.
 * @param dynamicYAxis - The dynamic Y-axis field key.
 * @param unitSystem - The unit system to use for the chart.
 * @param chartSource - The source of the chart.
 * @returns The PMV dynamic chart response DTO.
 */
export function buildPmvDynamicChart(
  payload: PmvChartInputsRequestDto,
  dynamicXAxis: FieldKeyType,
  dynamicYAxis: FieldKeyType,
  unitSystem: UnitSystemType = UnitSystem.SI,
  chartSource?: PmvChartSourceDto,
): PlotlyChartResponseDto {
  const inputs = getCompareInputs(payload.inputs);
  const showInputLegend = inputs.length > 1;
  const activeInputPayload = payload.inputs[chartSource?.baselineInputId as InputIdType] || inputs[0]?.payload;

  const xMeta = fieldMetaByKey[dynamicXAxis];
  const yMeta = fieldMetaByKey[dynamicYAxis];

  const xMin = convertFieldValueFromSi(dynamicXAxis, xMeta.minValue, unitSystem);
  const xMax = convertFieldValueFromSi(dynamicXAxis, xMeta.maxValue, unitSystem);
  const yMin = convertFieldValueFromSi(dynamicYAxis, yMeta.minValue, unitSystem);
  const yMax = convertFieldValueFromSi(dynamicYAxis, yMeta.maxValue, unitSystem);

  const xPoints = 50;
  const yPoints = 50;
  const xValues: number[] = [];
  const yValues: number[] = [];

  // For each point on the x-axis, calculate the PMV values.
  for (let i = 0; i < xPoints; i++) {
    xValues.push(xMin + (xMax - xMin) * (i / (xPoints - 1)));
  }
  // For each point on the y-axis, calculate the PMV values.
  for (let i = 0; i < yPoints; i++) {
    yValues.push(yMin + (yMax - yMin) * (i / (yPoints - 1)));
  }

  const zValues: number[][] = [];
  const textValues: string[][] = [];

  // If there is an active input payload, calculate the PMV values for each point on the grid.
  if (activeInputPayload) {
    // For each point on the y-axis, calculate the PMV values for each point on the x-axis.
    for (let i = 0; i < yPoints; i++) {
      const row: number[] = [];
      const textRow: string[] = [];
      const currentYSi = yValues[i];
      const ySi = convertFieldValueToSi(dynamicYAxis, yValues[i], unitSystem);

      // For each point on the x-axis, update the values in the payload with the current x value and calculate the PMV values.
      for (let j = 0; j < xPoints; j++) {
        const xSi = convertFieldValueToSi(dynamicXAxis, xValues[j], unitSystem);

        // Copy baseline inputs
        const pointArgs = { ...activeInputPayload };
        
        // Update the values in the payload with the current x and y values, if the dynamic axes are not Tdb or Tr.
        if (dynamicXAxis === FieldKey.OperativeTemperature) {
          pointArgs.tdb = xSi;
          pointArgs.tr = xSi;
        } else {
          (pointArgs as any)[dynamicXAxis] = xSi;
        }

        if (dynamicYAxis === FieldKey.OperativeTemperature) {
          pointArgs.tdb = ySi;
          pointArgs.tr = ySi;
        } else {
          (pointArgs as any)[dynamicYAxis] = ySi;
        }

        // If Tdb is X and Tr is not selected, we don't automatically link them unless Tr was identical to Tdb originally, but let's just use the current logic.
        try {
          const pmvResult = pmv_ppd(pointArgs.tdb, pointArgs.tr, pointArgs.vr, pointArgs.rh, pointArgs.met, pointArgs.clo, pointArgs.wme, "ASHRAE", { limit_inputs: false });
          row.push(pmvResult.pmv);
          textRow.push(getPmvZoneMeta(pmvResult.pmv).label);
        } catch (e) {
          row.push(NaN);
          textRow.push("");
        }
      }
      zValues.push(row);
      textValues.push(textRow);
    }
  }

  const traces: PlotTraceDto[] = [];

  // If there are PMV values, add the contour plot.
  if (zValues.length > 0) {
    // PMV dynamic chart contour plot.
    traces.push(buildContourTrace({
      name: "PMV",
      x: xValues,
      y: yValues,
      z: zValues,
      text: textValues,
      colorscale: PMV_COLORSCALE,
      contours: PMV_CONTOURS,
      // Only show PMV values between -3.5 and 3.5
      zmin: -3.5,
      zmax: 3.5,
      hovertemplate: `${xMeta.label}: %{x:.2f} ${xMeta.displayUnits[unitSystem]}<br>${yMeta.label}: %{y:.2f} ${yMeta.displayUnits[unitSystem]}<br><b>Zone: %{text}</b><br>PMV: %{z:.2f}<extra></extra>`,
      opacity: 0.80,
      isZone: true,
    }));
  }

  // Add traces for each input. 
  inputs.forEach(({ inputId, payload: inputPayload }) => {
    let inputX: number;
    // If the dynamic axis is Operative Temperature, calculate the operative temperature. Otherwise, get the value from the payload.
    if (dynamicXAxis === FieldKey.OperativeTemperature) {
      inputX = t_o(inputPayload.tdb, inputPayload.tr, inputPayload.vr, "ASHRAE");
    } else {
      inputX = inputPayload[dynamicXAxis as keyof typeof inputPayload] as number;
    }

    let inputY: number;
    // If the dynamic axis is Operative Temperature, calculate the operative temperature. Otherwise, get the value from the payload.
    if (dynamicYAxis === FieldKey.OperativeTemperature) {
      inputY = t_o(inputPayload.tdb, inputPayload.tr, inputPayload.vr, "ASHRAE");
    } else {
      inputY = inputPayload[dynamicYAxis as keyof typeof inputPayload] as number;
    }
    
    // Convert the values to the appropriate unit system.
    inputX = convertFieldValueFromSi(dynamicXAxis, inputX, unitSystem);
    inputY = convertFieldValueFromSi(dynamicYAxis, inputY, unitSystem);

    // Add the input trace.
    traces.push(buildInputScatterTrace({
      inputId,
      x: roundValue(inputX),
      y: roundValue(inputY),
      showLegend: showInputLegend,
      hovertemplate: `${inputDisplayMetaById[inputId]?.label ?? "Input"}<br>${xMeta.label} %{x:.2f} ${xMeta.displayUnits[unitSystem]}<br>${yMeta.label} %{y:.2f} ${yMeta.displayUnits[unitSystem]}<extra></extra>`,
    }));
  });

  // Return the PMV dynamic chart response DTO.
  return {
    traces,
    layout: {
      title: `PMV Dynamic Chart (${xMeta.label} vs ${yMeta.label})`,
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#f8fafc",
      showlegend: showInputLegend,
      margin: { l: 64, r: 24, t: 48, b: 64 },
      xaxis: {
        title: `${xMeta.label} (${xMeta.displayUnits[unitSystem]})`,
        range: [xMin, xMax],
        gridcolor: "#e2e8f0",
      },
      yaxis: {
        title: `${yMeta.label} (${yMeta.displayUnits[unitSystem]})`,
        range: [yMin, yMax],
        gridcolor: "#e2e8f0",
      },
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    annotations: [],
    source: CalculationSource.FrontendGenerated,
  };
}

