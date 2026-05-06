/**
 * Shared Chart Construction Logic
 * 
 * Contains common chart building functions that are reused across different 
 * comfort models. Provides standardized visualizations for shared parameters (e.g. comfort zones and input points).
 */
import { inputChartStyleById, inputDisplayMetaById } from "../../../models/inputSlotPresentation";
import { FieldKey } from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import { CalculationSource } from "../../../models/calculationMetadata";
import type { ComfortPointDto, CompareInputMap, PlotlyChartResponseDto, PlotTraceDto, PlotAnnotationDto } from "../../../models/comfortDtos";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import { convertFieldValueFromSi } from "../../units";
import { getCompareInputs, roundValue, type ComfortZonesByInput } from "../helpers";
import { buildComfortPolygonTrace, buildInputAnnotation, buildInputScatterTrace } from "./plotlyBuilders";
import { buildComfortZonePolygon } from "./pmvCharts";

/**
 * Builds the Relative Humidity chart.
 * @param payload - The comfort inputs.
 * @param comfortZonesByInput - The comfort zones.
 * @param unitSystem - The unit system.
 * @returns The comfort chart response DTO.
 */
export function buildRelativeHumidityChart(
  payload: { inputs: CompareInputMap<ComfortPointDto> },
  comfortZonesByInput: ComfortZonesByInput = {},
  unitSystem: UnitSystemType = UnitSystem.SI,
): PlotlyChartResponseDto {
  const inputs = getCompareInputs(payload.inputs);
  const showInputLegend = inputs.length > 1;
  const traces: PlotTraceDto[] = [];
  const annotations: PlotAnnotationDto[] = [];
  const temperatureDisplayUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];

  // Add traces for each input.
  inputs.forEach(({ inputId, payload: inputPayload }) => {
    // Get the input meta data.
    const inputMeta = inputDisplayMetaById[inputId];
    // Get the comfort zone.
    const comfortZone = comfortZonesByInput[inputId];
    // Build the comfort zone polygon.
    const { polygonX, polygonY } = buildComfortZonePolygon(
      /*
        The polygon is built using the cool and warm edges of the comfort zone.
        The edges are arrays of comfort points.
        The points are converted to the display units using the convertFieldValueFromSi function.
      */
      comfortZone?.coolEdge || [],
      comfortZone?.warmEdge || [],
      (point) => roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, point.tdb, unitSystem)),
      (point) => roundValue(point.rh),
    );

    if (polygonX.length > 0) {
      // Add the comfort zone polygon trace.
      traces.push(buildComfortPolygonTrace({
        inputId,
        nameSuffix: "RH comfort zone",
        polygonX,
        polygonY,
        hovertemplate: `Tdb %{x:.1f} ${temperatureDisplayUnits}<br>RH %{y:.0f}%<extra></extra>`,
        isZone: true,
      }));
    }
    // Add the input scatter trace.
    traces.push(buildInputScatterTrace({
      inputId,
      x: roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, inputPayload.tdb, unitSystem)),
      y: roundValue(inputPayload.rh),
      showLegend: showInputLegend,
      hovertemplate: `${inputMeta.label}<br>Tdb %{x:.1f} ${temperatureDisplayUnits}<br>RH %{y:.0f}%<extra></extra>`,
    }));
  });

  // Return the comfort chart response DTO.
  return {
    traces,
    layout: {
      title: "Relative humidity chart",
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#f8fafc",
      showlegend: showInputLegend,
      margin: { l: 56, r: 24, t: 48, b: 56 },
      xaxis: {
        title: `Dry bulb temperature (${temperatureDisplayUnits})`,
        range: [
          convertFieldValueFromSi(FieldKey.DryBulbTemperature, 10, unitSystem),
          convertFieldValueFromSi(FieldKey.DryBulbTemperature, 40, unitSystem),
        ],
        gridcolor: "#e2e8f0",
      },
      yaxis: {
        title: "Relative humidity (%)",
        range: [0, 100],
        gridcolor: "#e2e8f0",
      },
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    annotations,
    source: CalculationSource.FrontendGenerated,
  };
}
