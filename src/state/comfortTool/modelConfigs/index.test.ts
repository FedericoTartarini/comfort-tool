import { describe, expect, it } from "vitest";

import {
  adaptiveAshraeDeclaration,
  adaptiveAshraeZonesList,
} from "../../../comfortModels/adaptiveAshrae";
import {
  adaptiveEnDeclaration,
  adaptiveEnZonesList,
} from "../../../comfortModels/adaptiveEn";
import { heatIndexZonesList } from "../../../comfortModels/heatIndex";
import { humidexZonesList } from "../../../comfortModels/humidex";
import { pmvZonesList } from "../../../comfortModels/pmvCalculation";
import { calculateUtci, utciZonesList } from "../../../comfortModels/utci";
import { windChillZonesList } from "../../../comfortModels/windChill";
import { ComfortStandard } from "../../../models/calculationMetadata";
import { ChartId } from "../../../models/chartOptions";
import {
  ComfortModel,
  type ComfortModel as ComfortModelType,
} from "../../../models/comfortModels";
import { FieldKey } from "../../../models/fieldKeys";
import { ModifierId } from "../../../models/inputModifiers";
import {
  ChartMode,
  findNumericBandIndexForValue,
  ModelOutputKey,
  resolveBandEdge,
  type BandInputsSi,
} from "../../../models/modelCapabilities";
import type { ThermalZone } from "../../../models/thermalZone";
import { StandardId } from "../../../models/workspaces";
import {
  comfortModelConfigs,
  comfortModelOrder,
  getComfortModelConfig,
  getExploreModels,
  getModelsForStandard,
} from ".";

function createInputsSi(relativeAirSpeed: number): BandInputsSi {
  return { [FieldKey.RelativeAirSpeed]: relativeAirSpeed };
}

function expectZoneDerivedBands(modelId: ComfortModelType, zones: readonly ThermalZone[]) {
  const output = getComfortModelConfig(modelId).chartableOutputs[0];
  expect(output.defaultBands).toEqual(zones.map((zone) => ({
    min: zone.min,
    max: zone.max,
    label: zone.label,
    color: zone.color,
  })));
}

describe("comfort model capability registry", () => {
  it("registers every model exactly once with matching IDs and stable PMV ordering", () => {
    expect(ComfortModel.PmvAshrae).toBe("PMV_ASHRAE");
    expect(ComfortModel.PmvIso).toBe("PMV_ISO");
    expect(comfortModelOrder).toEqual([
      ComfortModel.PmvAshrae,
      ComfortModel.PmvIso,
      ComfortModel.Utci,
      ComfortModel.AdaptiveAshrae,
      ComfortModel.AdaptiveEn,
      ComfortModel.HeatIndex,
      ComfortModel.Humidex,
      ComfortModel.WindChill,
    ]);
    expect(comfortModelOrder).toEqual(Object.values(ComfortModel));

    comfortModelOrder.forEach((modelId) => {
      expect(comfortModelConfigs[modelId].id).toBe(modelId);
    });
  });

  it("declares the current fixed-first default chart matrix", () => {
    const expectedDefaultCharts: Record<ComfortModelType, ChartId> = {
      [ComfortModel.PmvAshrae]: ChartId.Psychrometric,
      [ComfortModel.PmvIso]: ChartId.Psychrometric,
      [ComfortModel.Utci]: ChartId.Stress,
      [ComfortModel.AdaptiveAshrae]: ChartId.Adaptive,
      [ComfortModel.AdaptiveEn]: ChartId.Adaptive,
      [ComfortModel.HeatIndex]: ChartId.HeatIndexRanges,
      [ComfortModel.Humidex]: ChartId.Humidex,
      [ComfortModel.WindChill]: ChartId.WindChillDynamic,
    };

    comfortModelOrder.forEach((modelId) => {
      expect(getComfortModelConfig(modelId).charts.defaultId)
        .toBe(expectedDefaultCharts[modelId]);
    });
  });

  it("identifies the ISO declaration and result metadata as ISO 7730 Category B", () => {
    const isoMeta = getComfortModelConfig(ComfortModel.PmvIso);

    expect(isoMeta.label).toContain("ISO 7730 Category B");
    expect(isoMeta.description).toContain("ISO 7730 Category B");
    expect(ComfortStandard.Iso7730PmvPpd).toContain("ISO 7730 Category B");
  });

  it("declares semantic default axes and every directed distinct pair", () => {
    const expected = {
      [ComfortModel.PmvAshrae]: {
        count: 42,
        defaults: {
          xAxis: FieldKey.DryBulbTemperature,
          yAxis: FieldKey.RelativeHumidity,
        },
      },
      [ComfortModel.PmvIso]: {
        count: 42,
        defaults: {
          xAxis: FieldKey.DryBulbTemperature,
          yAxis: FieldKey.RelativeHumidity,
        },
      },
      [ComfortModel.Utci]: {
        count: 20,
        defaults: {
          xAxis: FieldKey.DryBulbTemperature,
          yAxis: FieldKey.RelativeHumidity,
        },
      },
      [ComfortModel.AdaptiveAshrae]: {
        count: 2,
        defaults: {
          xAxis: FieldKey.PrevailingMeanOutdoorTemperature,
          yAxis: FieldKey.OperativeTemperature,
        },
      },
      [ComfortModel.AdaptiveEn]: {
        count: 2,
        defaults: {
          xAxis: FieldKey.PrevailingMeanOutdoorTemperature,
          yAxis: FieldKey.OperativeTemperature,
        },
      },
      [ComfortModel.HeatIndex]: {
        count: 2,
        defaults: {
          xAxis: FieldKey.DryBulbTemperature,
          yAxis: FieldKey.RelativeHumidity,
        },
      },
      [ComfortModel.Humidex]: {
        count: 2,
        defaults: {
          xAxis: FieldKey.DryBulbTemperature,
          yAxis: FieldKey.RelativeHumidity,
        },
      },
      [ComfortModel.WindChill]: {
        count: 2,
        defaults: {
          xAxis: FieldKey.DryBulbTemperature,
          yAxis: FieldKey.WindSpeed,
        },
      },
    } as const;

    comfortModelOrder.forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      const pairCount = config.dynamicAxisFields.reduce((count, xAxis) => (
        count + config.dynamicAxisFields.filter((yAxis) => (
          xAxis !== yAxis
        )).length
      ), 0);

      expect(config.defaultDynamicAxes).toEqual(expected[modelId].defaults);
      expect(pairCount).toBe(expected[modelId].count);
    });
  });

  it("declares the exact mode, output, and compliance matrix", () => {
    const expected = {
      [ComfortModel.PmvAshrae]: {
        modes: [ChartMode.Compliance, ChartMode.Explore],
        outputs: [ModelOutputKey.Pmv, ModelOutputKey.Ppd],
        complianceOutput: ModelOutputKey.Pmv,
      },
      [ComfortModel.PmvIso]: {
        modes: [ChartMode.Compliance, ChartMode.Explore],
        outputs: [ModelOutputKey.Pmv, ModelOutputKey.Ppd],
        complianceOutput: ModelOutputKey.Pmv,
      },
      [ComfortModel.Utci]: {
        modes: [ChartMode.Explore],
        outputs: [ModelOutputKey.Utci],
        complianceOutput: undefined,
      },
      [ComfortModel.AdaptiveAshrae]: {
        modes: [ChartMode.Compliance],
        outputs: [],
        complianceOutput: ModelOutputKey.OperativeTemperature,
      },
      [ComfortModel.AdaptiveEn]: {
        modes: [ChartMode.Compliance],
        outputs: [],
        complianceOutput: ModelOutputKey.OperativeTemperature,
      },
      [ComfortModel.HeatIndex]: {
        modes: [ChartMode.Explore],
        outputs: [ModelOutputKey.HeatIndex],
        complianceOutput: undefined,
      },
      [ComfortModel.Humidex]: {
        modes: [ChartMode.Explore],
        outputs: [ModelOutputKey.Humidex],
        complianceOutput: undefined,
      },
      [ComfortModel.WindChill]: {
        modes: [ChartMode.Explore],
        outputs: [ModelOutputKey.WindChill],
        complianceOutput: undefined,
      },
    } as const;

    comfortModelOrder.forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      expect(config.modes).toEqual(expected[modelId].modes);
      expect(config.chartableOutputs.map((output) => output.key)).toEqual(expected[modelId].outputs);
      expect(config.complianceSpec?.output).toBe(expected[modelId].complianceOutput);
    });
  });

  it("derives Standard and Explore model collections from declarations", () => {
    expect(getModelsForStandard(StandardId.Ashrae55)).toEqual([
      ComfortModel.PmvAshrae,
      ComfortModel.AdaptiveAshrae,
    ]);
    expect(getModelsForStandard(StandardId.Iso7730)).toEqual([
      ComfortModel.PmvIso,
    ]);
    expect(getModelsForStandard(StandardId.En16798)).toEqual([
      ComfortModel.AdaptiveEn,
    ]);
    expect(getExploreModels()).toEqual([
      ComfortModel.PmvAshrae,
      ComfortModel.PmvIso,
      ComfortModel.Utci,
      ComfortModel.HeatIndex,
      ComfortModel.Humidex,
      ComfortModel.WindChill,
    ]);

    for (const modelId of comfortModelOrder) {
      const config = getComfortModelConfig(modelId);
      expect(new Set(config.standardIds).size).toBe(config.standardIds.length);
      expect(config.standardIds.length > 0).toBe(
        config.modes.includes(ChartMode.Compliance),
      );
    }
  });

  it("declares generic input-modifier availability per model", () => {
    const pmvModifiers = [
      ModifierId.MeasuredAirSpeed,
      ModifierId.MorningClothingEstimate,
      ModifierId.DynamicClothing,
      ModifierId.SolarGain,
    ];

    expect(getComfortModelConfig(ComfortModel.PmvAshrae).modifiers.map(({ id }) => id))
      .toEqual(pmvModifiers);
    expect(getComfortModelConfig(ComfortModel.PmvIso).modifiers.map(({ id }) => id))
      .toEqual(pmvModifiers);

    comfortModelOrder
      .filter((modelId) => (
        modelId !== ComfortModel.PmvAshrae && modelId !== ComfortModel.PmvIso
      ))
      .forEach((modelId) => {
        expect(getComfortModelConfig(modelId).modifiers).toEqual([]);
      });
  });

  it("derives Explore presets from the existing model zones", () => {
    expectZoneDerivedBands(
      ComfortModel.PmvAshrae,
      pmvZonesList,
    );
    expectZoneDerivedBands(
      ComfortModel.PmvIso,
      pmvZonesList,
    );
    expectZoneDerivedBands(ComfortModel.Utci, utciZonesList);
    expectZoneDerivedBands(ComfortModel.HeatIndex, heatIndexZonesList);
    expectZoneDerivedBands(ComfortModel.Humidex, humidexZonesList);
    expectZoneDerivedBands(ComfortModel.WindChill, windChillZonesList);
  });

  it("covers finite UTCI results with unbounded outer Explore bands", () => {
    const bands = getComfortModelConfig(ComfortModel.Utci).chartableOutputs[0].defaultBands;
    const coldResult = calculateUtci({
      tdb: -50,
      tr: -80,
      v: 17,
      rh: 0,
    });
    const hotResult = calculateUtci({
      tdb: 50,
      tr: 120,
      v: 0.5,
      rh: 100,
    });

    expect(bands[0]).toEqual(expect.objectContaining({ min: -Infinity, max: -40 }));
    const lastBand = bands[bands.length - 1];
    expect(lastBand).toEqual(expect.objectContaining({ min: 46, max: Infinity }));
    expect(coldResult.utci).toBeLessThan(-50);
    expect(coldResult.stressCategory).toBe("extreme cold stress");
    expect(findNumericBandIndexForValue(bands, coldResult.utci)).toBe(0);
    expect(hotResult.utci).toBeGreaterThan(55);
    expect(hotResult.stressCategory).toBe("extreme heat stress");
    expect(findNumericBandIndexForValue(bands, hotResult.utci)).toBe(bands.length - 1);
    expect(findNumericBandIndexForValue(bands, -40)).toBe(1);
    expect(findNumericBandIndexForValue(bands, 46)).toBe(bands.length - 1);
  });

  it("declares independent PMV bands and assigns PMV/PPD edges half-open", () => {
    const ashrae = getComfortModelConfig(ComfortModel.PmvAshrae);
    const iso = getComfortModelConfig(ComfortModel.PmvIso);
    const pmvOutput = ashrae.chartableOutputs.find((output) => output.key === ModelOutputKey.Pmv);
    const ppdOutput = ashrae.chartableOutputs.find((output) => output.key === ModelOutputKey.Ppd);
    const ppdBands = ppdOutput?.defaultBands;

    expect(pmvOutput?.legendTitle).toBe("PMV Zones");
    expect(ppdOutput?.legendTitle).toBe("PPD Bands");
    expect(ppdBands).toEqual([
      expect.objectContaining({ min: -Infinity, max: 10 }),
      expect.objectContaining({ min: 10, max: Infinity }),
    ]);
    expect(ppdBands?.[0].label).toMatch(/acceptable dissatisfaction/i);
    expect(ppdBands?.[1].label).toMatch(/elevated dissatisfaction/i);

    if (!ppdBands) {
      throw new Error("PMV must declare PPD Explore bands.");
    }

    expect(ashrae.complianceSpec).not.toBe(iso.complianceSpec);
    expect(ashrae.complianceSpec?.bands).not.toBe(iso.complianceSpec?.bands);
    expect(ashrae.complianceSpec?.bands[1]).not.toBe(iso.complianceSpec?.bands[1]);
    expect(ashrae.complianceSpec?.bands).toEqual(iso.complianceSpec?.bands);

    [ashrae, iso].forEach((config) => {
      const bands = config.complianceSpec!.bands;
      expect(bands[1]).toEqual(expect.objectContaining({
        min: -0.5,
        max: 0.5,
      }));
    });

    expect(findNumericBandIndexForValue(ppdBands, 10)).toBe(1);
  });

  it("evaluates Adaptive functional bands from the existing standard boundaries", () => {
    const inputsSi = createInputsSi(0.1);
    const xValueSi = 20;
    const ashraeBands = adaptiveAshraeDeclaration.complianceSpec.bands;
    const enBands = adaptiveEnDeclaration.complianceSpec.bands;

    expect(adaptiveAshraeDeclaration.modes).toEqual([ChartMode.Compliance]);
    expect(adaptiveEnDeclaration.modes).toEqual([ChartMode.Compliance]);
    expect(adaptiveAshraeDeclaration.chartableOutputs).toEqual([]);
    expect(adaptiveEnDeclaration.chartableOutputs).toEqual([]);
    expect(adaptiveAshraeDeclaration.complianceSpec.output)
      .toBe(ModelOutputKey.OperativeTemperature);
    expect(adaptiveEnDeclaration.complianceSpec.output)
      .toBe(ModelOutputKey.OperativeTemperature);
    [ComfortModel.AdaptiveAshrae, ComfortModel.AdaptiveEn].forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      expect(config.charts.entries.map(({ id }) => id)).toEqual([ChartId.Adaptive]);
      expect(config.charts.defaultId).toBe(ChartId.Adaptive);
      expect(config.dynamicAxisFields).toEqual([
        FieldKey.PrevailingMeanOutdoorTemperature,
        FieldKey.OperativeTemperature,
      ]);
    });
    expect(ashraeBands).not.toBe(enBands);
    expect(ashraeBands[0]).not.toBe(enBands[0]);
    expect(getComfortModelConfig(ComfortModel.AdaptiveAshrae).complianceSpec?.bands)
      .toEqual(ashraeBands);
    expect(getComfortModelConfig(ComfortModel.AdaptiveEn).complianceSpec?.bands)
      .toEqual(enBands);

    expect(ashraeBands.map((band) => resolveBandEdge(band.max, xValueSi, inputsSi)))
      .toEqual([20.5, 21.5, 26.5, 27.5, Infinity]);
    expect(ashraeBands.map((band) => band.label)).toEqual([
      adaptiveAshraeZonesList[0].label,
      adaptiveAshraeZonesList[1].label,
      adaptiveAshraeZonesList[2].label,
      adaptiveAshraeZonesList[1].label,
      adaptiveAshraeZonesList[3].label,
    ]);

    expect(enBands.map((band) => {
      const edge = resolveBandEdge(band.max, xValueSi, inputsSi);
      return Number.isFinite(edge) ? Number(edge.toFixed(6)) : edge;
    }))
      .toEqual([20.4, 21.4, 22.4, 27.4, 28.4, 29.4, Infinity]);
    expect(enBands.map((band) => band.label)).toEqual([
      adaptiveEnZonesList[0].label,
      adaptiveEnZonesList[1].label,
      adaptiveEnZonesList[2].label,
      adaptiveEnZonesList[3].label,
      adaptiveEnZonesList[2].label,
      adaptiveEnZonesList[1].label,
      adaptiveEnZonesList[4].label,
    ]);

    [ashraeBands, enBands].forEach((bands) => {
      bands.slice(0, -1).forEach((band, index) => {
        const boundaryValue = resolveBandEdge(band.max, xValueSi, inputsSi);
        expect(resolveBandEdge(bands[index + 1].min, xValueSi, inputsSi))
          .toBe(boundaryValue);
      });
    });
  });
});
