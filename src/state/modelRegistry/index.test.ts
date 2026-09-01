import { describe, expect, it } from "vitest";

import {
  adaptiveAshraeDeclaration,
  adaptiveAshraeZonesList,
} from "../../declarations/adaptive/ashrae";
import {
  adaptiveEnDeclaration,
  adaptiveEnZonesList,
} from "../../declarations/adaptive/en";
import { heatIndexZonesList } from "../../declarations/heatIndex";
import { humidexZonesList } from "../../declarations/humidex";
import {
  ashraeComplianceZonesList,
  isoTsvZonesList,
} from "../../declarations/pmv/zones";
import { calculateUtci, utciZonesList } from "../../declarations/utci/utci";
import { ComfortStandard } from "../../catalog/calculationMetadata";
import {
  ModelId,
  type ModelId as ModelIdType,
} from "../../catalog/modelIds";
import { defaultPhsPersonSettings } from "../../catalog/phs";
import {
  PhysicalQuantityId,
  getPhysicalQuantityMeta,
  primaryInputOrder,
} from "../../catalog/quantities";
import { ModifierId } from "../../catalog/inputModifiers";
import {
  findNumericBandIndexForValue,
  resolveBandEdge,
  type BandInputsSi,
  type NumericBand,
} from "../../catalog/modelCapabilities";
import type { ThermalZone } from "../../catalog/thermalZone";
import {
  StandardId,
  SurfaceId,
  supportsStandardSurface,
} from "../../catalog/surfaces";
import { ChartType, resolveChartCapabilities } from "../../catalog/chartTypes";
import {
  comfortModelConfigs,
  comfortModelOrder,
  getComfortModelConfig,
  getDeclaredChartInstanceIds,
  getModelsForSurface,
  getModelsForStandard,
} from ".";
import { isAllowedExtraQuantityId } from "../../engines/comfort/quantityStateRouting";

function createInputsSi(relativeAirSpeed: number): BandInputsSi {
  return { [PhysicalQuantityId.RelativeAirSpeed]: relativeAirSpeed };
}

function expectZoneDerivedBands(
  modelId: ModelIdType,
  zones: readonly ThermalZone[],
) {
  const output = getComfortModelConfig(modelId).exploreOutputs[0];
  expect(output.defaultBands.map(({ min, max, label, color }) => ({
    min,
    max,
    label,
    color,
  }))).toEqual(
    zones.map((zone) => ({
      min: zone.min,
      max: zone.max,
      label: zone.label,
      color: zone.color,
    })),
  );
}

describe("comfort model capability registry", () => {
  it("registers every model exactly once with matching IDs and stable PMV ordering", () => {
    expect(ModelId.PmvAshrae).toBe("pmv-ashrae");
    expect(ModelId.PmvIso).toBe("pmv-iso");
    expect(comfortModelOrder).toEqual([
      ModelId.PmvAshrae,
      ModelId.PmvIso,
      ModelId.Utci,
      ModelId.AdaptiveAshrae,
      ModelId.AdaptiveEn,
      ModelId.HeatIndex,
      ModelId.Humidex,
      ModelId.WindChill,
      ModelId.Phs2023,
    ]);
    expect(comfortModelOrder).toEqual(Object.values(ModelId));

    comfortModelOrder.forEach((modelId) => {
      expect(comfortModelConfigs[modelId].id).toBe(modelId);
    });
  });

  it("declares the current fixed-first default chart matrix", () => {
    const expectedDefaultCharts: Record<ModelIdType, string> = {
      [ModelId.PmvAshrae]: "psychrometric",
      [ModelId.PmvIso]: "psychrometric",
      [ModelId.Utci]: "utci",
      [ModelId.AdaptiveAshrae]: "adaptive",
      [ModelId.AdaptiveEn]: "adaptive",
      [ModelId.HeatIndex]: "dynamic",
      [ModelId.Humidex]: "dynamic",
      [ModelId.WindChill]: "dynamic",
      [ModelId.Phs2023]: "body-temperature",
    };

    comfortModelOrder.forEach((modelId) => {
      expect(
        getComfortModelConfig(modelId).chartInstances.defaultInstanceId,
      ).toBe(expectedDefaultCharts[modelId]);
    });
  });

  it("derives unique ChartType ids per model", () => {
    comfortModelOrder.forEach((modelId) => {
      const instanceIds = getDeclaredChartInstanceIds(modelId);
      expect(instanceIds.length).toBeGreaterThan(0);
      expect(new Set(instanceIds).size).toBe(instanceIds.length);
    });
  });

  it("declares Heat Index and Humidex as a single Dynamic chart", () => {
    [ModelId.HeatIndex, ModelId.Humidex].forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      expect(config.chartInstances.entries).toHaveLength(1);
      const [dynamicChart] = config.chartInstances.entries;
      expect(dynamicChart.type).toBe(ChartType.Dynamic);
      expect(
        resolveChartCapabilities(dynamicChart.type, dynamicChart.capabilities)
          .allowsAxisSelection,
      ).toBe(true);
    });
  });

  it("allows Psychrometric only on PMV models, using declaration-owned instance ids", () => {
    const psychrometricCharts = comfortModelOrder.flatMap((modelId) =>
      getComfortModelConfig(modelId)
        .chartEngineRegistrations.filter(
          ({ registration }) => registration.type === ChartType.Psychrometric,
        )
        .map(({ instanceId }) => ({ modelId, instanceId })),
    );
    expect(new Set(psychrometricCharts.map(({ modelId }) => modelId))).toEqual(
      new Set([ModelId.PmvAshrae, ModelId.PmvIso]),
    );
    psychrometricCharts.forEach(({ modelId, instanceId }) => {
      const entry = getComfortModelConfig(modelId).chartInstances.entries.find(
        (chart) => chart.instanceId === instanceId,
      );
      expect(entry?.type).toBe(ChartType.Psychrometric);
    });
  });

  it("declares PMV Dynamic and Psychrometric types", () => {
    [ModelId.PmvAshrae, ModelId.PmvIso].forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      const dynamic = config.chartInstances.entries.find(
        ({ type }) => type === ChartType.Dynamic,
      );
      expect(dynamic?.type).toBe(ChartType.Dynamic);
      const psychrometric = config.chartInstances.entries.find(
        ({ type }) => type === ChartType.Psychrometric,
      );
      expect(psychrometric?.type).toBe(ChartType.Psychrometric);
    });
  });

  it("registers Heat Loss and SET instances on both PMV standards", () => {
    expect(getDeclaredChartInstanceIds(ModelId.PmvAshrae)).toEqual([
      "psychrometric",
      "dynamic",
      "heat-loss",
      "set",
    ]);
    expect(getDeclaredChartInstanceIds(ModelId.PmvIso)).toEqual([
      "psychrometric",
      "dynamic",
      "heat-loss",
      "set",
    ]);

    [ModelId.PmvAshrae, ModelId.PmvIso].forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      const heatLoss = config.chartInstances.entries.find(
        ({ type }) => type === ChartType.HeatLoss,
      );
      const set = config.chartInstances.entries.find(
        ({ type }) => type === ChartType.Set,
      );
      expect(heatLoss?.type).toBe(ChartType.HeatLoss);
      expect(set?.type).toBe(ChartType.Set);
      expect(
        resolveChartCapabilities(heatLoss!.type, heatLoss?.capabilities),
      ).toEqual(
        expect.objectContaining({
          allowsAxisSelection: false,
          allowsBaselineSelection: true,
          showsLegend: false,
        }),
      );
    });
  });

  it("declares both PHS charts and their chart-specific Explore capabilities", () => {
    const config = getComfortModelConfig(ModelId.Phs2023);
    const [history, dynamic] = config.chartInstances.entries;
    const historyRegistration = config.chartEngineRegistrations.find(
      ({ instanceId }) => instanceId === "body-temperature",
    );
    const dynamicRegistration = config.chartEngineRegistrations.find(
      ({ instanceId }) => instanceId === "dynamic",
    );

    expect(config.chartInstances.defaultInstanceId).toBe("body-temperature");
    expect(history.instanceId).toBe("body-temperature");
    expect(history.type).toBe(ChartType.BodyTemperature);
    expect(
      resolveChartCapabilities(history.type, history.capabilities),
    ).toEqual(
      expect.objectContaining({
        allowsAxisSelection: false,
        allowsBaselineSelection: true,
      }),
    );
    expect(historyRegistration?.supportedExploreOutputs).toEqual([
      PhysicalQuantityId.RectalTemperature,
    ]);
    expect(historyRegistration?.defaultExploreOutput).toBe(
      PhysicalQuantityId.RectalTemperature,
    );
    expect(dynamic.instanceId).toBe("dynamic");
    expect(
      resolveChartCapabilities(dynamic.type, dynamic.capabilities)
        .allowsAxisSelection,
    ).toBe(true);
    expect(dynamicRegistration?.supportedExploreOutputs).toEqual([
      PhysicalQuantityId.LimitingExposureTime,
      PhysicalQuantityId.RectalTemperature,
      PhysicalQuantityId.SweatLoss,
    ]);
  });

  it("identifies the ISO declaration and result metadata as ISO 7730", () => {
    const isoMeta = getComfortModelConfig(ModelId.PmvIso);

    expect(isoMeta.label).toBe("PMV/PPD (ISO 7730)");
    expect(isoMeta.description).toContain("ISO 7730");
    expect(ComfortStandard.Iso7730PmvPpd).toContain("ISO 7730 Category B");
    expect(isoMeta.complianceProfile?.caption).toContain("thermal sensation vote");
  });

  it("declares semantic default axes and every directed distinct pair", () => {
    const expected = {
      [ModelId.PmvAshrae]: {
        count: 42,
        defaults: { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity },
      },
      [ModelId.PmvIso]: {
        count: 42,
        defaults: { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity },
      },
      [ModelId.Utci]: {
        count: 20,
        defaults: { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity },
      },
      [ModelId.AdaptiveAshrae]: {
        count: 2,
        defaults: { xAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature, yAxis: PhysicalQuantityId.OperativeTemperature },
      },
      [ModelId.AdaptiveEn]: {
        count: 2,
        defaults: { xAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature, yAxis: PhysicalQuantityId.OperativeTemperature },
      },
      [ModelId.HeatIndex]: {
        count: 2,
        defaults: { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity },
      },
      [ModelId.Humidex]: {
        count: 2,
        defaults: { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity },
      },
      [ModelId.WindChill]: {
        count: 2,
        defaults: { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.WindSpeed },
      },
      [ModelId.Phs2023]: {
        count: 30,
        defaults: { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity },
      },
    } as const;

    comfortModelOrder.forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      const pairCount = config.dynamicAxisFields.reduce(
        (count, xAxis) =>
          count +
          config.dynamicAxisFields.filter((yAxis) => xAxis !== yAxis).length,
        0,
      );

      expect(config.defaultDynamicAxes).toEqual(expected[modelId].defaults);
      expect(pairCount).toBe(expected[modelId].count);
    });
  });

  it("declares the exact mode, output, and compliance matrix", () => {
    const expected = {
      [ModelId.PmvAshrae]: { capabilities: [
          SurfaceId.Standard, SurfaceId.Explore, ], outputs: [PhysicalQuantityId.PredictedMeanVote, PhysicalQuantityId.PredictedPercentageOfDissatisfied], complianceOutput: PhysicalQuantityId.PredictedMeanVote },
      [ModelId.PmvIso]: { capabilities: [
          SurfaceId.Standard, SurfaceId.Explore, ], outputs: [PhysicalQuantityId.PredictedMeanVote, PhysicalQuantityId.PredictedPercentageOfDissatisfied], complianceOutput: PhysicalQuantityId.PredictedMeanVote },
      [ModelId.Utci]: {
        capabilities: [SurfaceId.Explore],
        outputs: [PhysicalQuantityId.UniversalThermalClimateIndex],
        complianceOutput: undefined,
      },
      [ModelId.AdaptiveAshrae]: {
        capabilities: [SurfaceId.Standard],
        outputs: [],
        complianceOutput: PhysicalQuantityId.OperativeTemperature,
      },
      [ModelId.AdaptiveEn]: {
        capabilities: [SurfaceId.Standard],
        outputs: [],
        complianceOutput: PhysicalQuantityId.OperativeTemperature,
      },
      [ModelId.HeatIndex]: {
        capabilities: [SurfaceId.Explore],
        outputs: [PhysicalQuantityId.HeatIndex],
        complianceOutput: undefined,
      },
      [ModelId.Humidex]: {
        capabilities: [SurfaceId.Explore],
        outputs: [PhysicalQuantityId.Humidex],
        complianceOutput: undefined,
      },
      [ModelId.WindChill]: {
        capabilities: [SurfaceId.Explore],
        outputs: [PhysicalQuantityId.WindChillIndex],
        complianceOutput: undefined,
      },
      [ModelId.Phs2023]: {
        capabilities: [
          SurfaceId.Standard,
          SurfaceId.Explore,
          SurfaceId.TimeSeries,
        ],
        outputs: [
          PhysicalQuantityId.LimitingExposureTime,
          PhysicalQuantityId.RectalTemperature,
          PhysicalQuantityId.SweatLoss,
        ],
        complianceOutput: PhysicalQuantityId.LimitingExposureTime,
      },
    } as const;

    comfortModelOrder.forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      expect(config.surfaceCapabilities).toEqual(
        expected[modelId].capabilities,
      );
      expect(config.exploreOutputs.map((output) => output.key)).toEqual(
        expected[modelId].outputs,
      );
      expect(config.complianceProfile?.output).toBe(
        expected[modelId].complianceOutput,
      );
    });
  });

  it("derives Standard and Explore model collections from declarations", () => {
    expect(getModelsForStandard(StandardId.Ashrae55)).toEqual([
      ModelId.PmvAshrae,
      ModelId.AdaptiveAshrae,
    ]);
    expect(getModelsForStandard(StandardId.Iso7730)).toEqual([
      ModelId.PmvIso,
    ]);
    expect(getModelsForStandard(StandardId.En16798)).toEqual([
      ModelId.AdaptiveEn,
    ]);
    expect(getModelsForStandard(StandardId.Iso7933)).toEqual([
      ModelId.Phs2023,
    ]);
    expect(getModelsForSurface(SurfaceId.Explore)).toEqual([
      ModelId.PmvAshrae,
      ModelId.PmvIso,
      ModelId.Utci,
      ModelId.HeatIndex,
      ModelId.Humidex,
      ModelId.WindChill,
      ModelId.Phs2023,
    ]);

    expect(getModelsForSurface(SurfaceId.TimeSeries)).toEqual([
      ModelId.Phs2023,
    ]);

    for (const modelId of comfortModelOrder) {
      const config = getComfortModelConfig(modelId);
      expect(new Set(config.standardIds).size).toBe(config.standardIds.length);
      expect(config.standardIds.length > 0).toBe(
        supportsStandardSurface(config.surfaceCapabilities),
      );
    }
  });

  it("declares Results tables for every model and a Time-series slot only on PHS", () => {
    comfortModelOrder.forEach((modelId) => {
      const { tables } = getComfortModelConfig(modelId);
      expect(tables.results.length).toBeGreaterThan(0);
      if (modelId === ModelId.Phs2023) {
        expect(tables.timeSeries?.length).toBeGreaterThan(0);
      } else {
        expect(tables.timeSeries).toBeUndefined();
      }
    });
  });

  it("declares generic input-modifier availability per model", () => {
    const pmvModifiers = [
      ModifierId.MeasuredAirSpeed,
      ModifierId.MorningClothingEstimate,
      ModifierId.DynamicClothing,
      ModifierId.SolarGain,
    ];

    expect(
      getComfortModelConfig(ModelId.PmvAshrae).modifiers.map(
        ({ id }) => id,
      ),
    ).toEqual(pmvModifiers);
    expect(
      getComfortModelConfig(ModelId.PmvIso).modifiers.map(({ id }) => id),
    ).toEqual(pmvModifiers);

    comfortModelOrder
      .filter(
        (modelId) =>
          modelId !== ModelId.PmvAshrae && modelId !== ModelId.PmvIso,
      )
      .forEach((modelId) => {
        expect(getComfortModelConfig(modelId).modifiers).toEqual([]);
      });
  });

  it("derives Explore presets from the existing model zones", () => {
    expectZoneDerivedBands(ModelId.PmvAshrae, ashraeComplianceZonesList);
    expectZoneDerivedBands(ModelId.PmvIso, isoTsvZonesList);
    expectZoneDerivedBands(ModelId.Utci, utciZonesList);
    expectZoneDerivedBands(ModelId.HeatIndex, heatIndexZonesList);
    expectZoneDerivedBands(ModelId.Humidex, humidexZonesList);
    const windChillBands = getComfortModelConfig(ModelId.WindChill)
      .exploreOutputs[0].defaultBands;
    expect(windChillBands).toHaveLength(1);
    expect(windChillBands[0]?.min).toBe(-Infinity);
    expect(windChillBands[0]?.max).toBe(Infinity);
  });

  it("covers finite UTCI results with unbounded outer Explore bands", () => {
    const bands = getComfortModelConfig(ModelId.Utci).exploreOutputs[0]
      .defaultBands;
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

    expect(bands[0].min).toBe(-Infinity);
    expect(bands[0].label).toBe("extreme cold stress");
    const lastBand = bands[bands.length - 1];
    // JS digitize last edge is 1000 °C (not unbounded).
    expect(lastBand.max).toBe(1000);
    expect(lastBand.label).toBe("extreme heat stress");
    expect(coldResult.utci).toBeLessThan(-50);
    expect(coldResult.stressCategory).toBe("extreme cold stress");
    expect(findNumericBandIndexForValue(bands, coldResult.utci)).toBe(0);
    expect(hotResult.utci).toBeGreaterThan(55);
    expect(hotResult.stressCategory).toBe("extreme heat stress");
    expect(findNumericBandIndexForValue(bands, hotResult.utci)).toBe(
      bands.length - 1,
    );
    expect(findNumericBandIndexForValue(bands, -40)).toBe(0);
    expect(findNumericBandIndexForValue(bands, 26)).toBe(
      bands.findIndex((band) => band.label === "no thermal stress"),
    );
    expect(findNumericBandIndexForValue(bands, 46)).toBe(
      bands.findIndex((band) => band.label === "very strong heat stress"),
    );
  });

  it("declares independent PMV bands and assigns PMV/PPD edges half-open", () => {
    const ashrae = getComfortModelConfig(ModelId.PmvAshrae);
    const iso = getComfortModelConfig(ModelId.PmvIso);
    const pmvOutput = ashrae.exploreOutputs.find(
      (output) => output.key === PhysicalQuantityId.PredictedMeanVote,
    );
    const ppdOutput = ashrae.exploreOutputs.find(
      (output) => output.key === PhysicalQuantityId.PredictedPercentageOfDissatisfied,
    );
    const ppdBands = ppdOutput?.defaultBands;

    expect(pmvOutput?.legendTitle).toBe("PMV acceptability");
    expect(iso.exploreOutputs.find((output) => output.key === PhysicalQuantityId.PredictedMeanVote)
      ?.legendTitle).toBe("Thermal sensation");
    expect(ppdOutput?.legendTitle).toBe("PPD Bands");
    expect(ppdBands).toEqual([
      expect.objectContaining({ min: -Infinity, max: 10 }),
      expect.objectContaining({ min: 10, max: Infinity }),
    ]);
    expect(ppdBands?.[0].label).toBe("< 10");
    expect(ppdBands?.[1].label).toBe(">= 10");

    if (!ppdBands) {
      throw new Error("PMV must declare PPD Explore bands.");
    }

    expect(ashrae.complianceProfile).not.toBe(iso.complianceProfile);
    expect(ashrae.complianceProfile?.bands).not.toEqual(
      iso.complianceProfile?.bands,
    );
    expect(ashrae.complianceProfile?.bands).toHaveLength(3);
    expect(iso.complianceProfile?.bands.map(({ label }) => label)).toEqual([
      "Cold",
      "Cool",
      "Slightly Cool",
      "Neutral",
      "Slightly Warm",
      "Warm",
      "Hot",
    ]);
    const ashraePmvBands = pmvOutput!.defaultBands;
    const isoPmvBands = iso.exploreOutputs.find(
      (output) => output.key === PhysicalQuantityId.PredictedMeanVote,
    )!.defaultBands as readonly NumericBand[];
    expect(findNumericBandIndexForValue(ashraePmvBands, -0.5)).toBe(0);
    expect(findNumericBandIndexForValue(ashraePmvBands, 0.5)).toBe(2);
    expect(findNumericBandIndexForValue(isoPmvBands, -0.5)).toBe(
      isoPmvBands.findIndex((band) => band.label === "Neutral"),
    );
    expect(findNumericBandIndexForValue(isoPmvBands, 0.5)).toBe(
      isoPmvBands.findIndex((band) => band.label === "Slightly Warm"),
    );

    expect(findNumericBandIndexForValue(ppdBands, 10)).toBe(1);
  });

  it("evaluates Adaptive functional bands from the existing standard boundaries", () => {
    const inputsSi = createInputsSi(0.1);
    const xValueSi = 20;
    const ashraeBands = adaptiveAshraeDeclaration.complianceProfile.bands;
    const enBands = adaptiveEnDeclaration.complianceProfile.bands;

    expect(adaptiveAshraeDeclaration.surfaceCapabilities).toEqual([
      SurfaceId.Standard,
    ]);
    expect(adaptiveEnDeclaration.surfaceCapabilities).toEqual([
      SurfaceId.Standard,
    ]);
    expect(adaptiveAshraeDeclaration.exploreOutputs).toEqual([]);
    expect(adaptiveEnDeclaration.exploreOutputs).toEqual([]);
    expect(adaptiveAshraeDeclaration.complianceProfile.output).toBe(
      PhysicalQuantityId.OperativeTemperature,
    );
    expect(adaptiveEnDeclaration.complianceProfile.output).toBe(
      PhysicalQuantityId.OperativeTemperature,
    );
    const adaptiveChartInstance: Record<
      typeof ModelId.AdaptiveAshrae | typeof ModelId.AdaptiveEn,
      string
    > = {
      [ModelId.AdaptiveAshrae]: "adaptive",
      [ModelId.AdaptiveEn]: "adaptive",
    };
    [ModelId.AdaptiveAshrae, ModelId.AdaptiveEn].forEach(
      (modelId) => {
        const config = getComfortModelConfig(modelId);
        const chartInstanceId = adaptiveChartInstance[modelId];
        expect(
          config.chartInstances.entries.map(({ instanceId }) => instanceId),
        ).toEqual([chartInstanceId]);
        expect(config.chartInstances.defaultInstanceId).toBe(chartInstanceId);
        expect(config.dynamicAxisFields).toEqual([
          PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
          PhysicalQuantityId.OperativeTemperature,
        ]);
      },
    );
    expect(ashraeBands).not.toBe(enBands);
    expect(ashraeBands[0]).not.toBe(enBands[0]);
    expect(
      getComfortModelConfig(ModelId.AdaptiveAshrae).complianceProfile
        ?.bands,
    ).toEqual(ashraeBands);
    expect(
      getComfortModelConfig(ModelId.AdaptiveEn).complianceProfile?.bands,
    ).toEqual(enBands);

    expect(
      ashraeBands.map((band) => resolveBandEdge(band.max, xValueSi, inputsSi)),
    ).toEqual([20.5, 21.5, 26.5, 27.5, Infinity]);
    expect(ashraeBands.map((band) => band.label)).toEqual([
      adaptiveAshraeZonesList[0].label,
      adaptiveAshraeZonesList[1].label,
      adaptiveAshraeZonesList[2].label,
      adaptiveAshraeZonesList[1].label,
      adaptiveAshraeZonesList[3].label,
    ]);

    expect(
      enBands.map((band) => {
        const edge = resolveBandEdge(band.max, xValueSi, inputsSi);
        return Number.isFinite(edge) ? Number(edge.toFixed(6)) : edge;
      }),
    ).toEqual([20.4, 21.4, 22.4, 27.4, 28.4, 29.4, Infinity]);
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
        expect(resolveBandEdge(bands[index + 1].min, xValueSi, inputsSi)).toBe(
          boundaryValue,
        );
      });
    });
  });

  it("keeps body weight and height as Extra catalog quantities that only PHS selects", () => {
    const weight = getPhysicalQuantityMeta(PhysicalQuantityId.BodyWeight);
    const height = getPhysicalQuantityMeta(PhysicalQuantityId.Height);

    expect(primaryInputOrder).not.toContain(PhysicalQuantityId.BodyWeight);
    expect(primaryInputOrder).not.toContain(PhysicalQuantityId.Height);
    expect(weight).toMatchObject({
      id: PhysicalQuantityId.BodyWeight,
      defaultSi: defaultPhsPersonSettings[PhysicalQuantityId.BodyWeight],
    });
    expect(height).toMatchObject({
      id: PhysicalQuantityId.Height,
      defaultSi: defaultPhsPersonSettings[PhysicalQuantityId.Height],
    });
    expect(isAllowedExtraQuantityId(PhysicalQuantityId.BodyWeight)).toBe(true);
    expect(isAllowedExtraQuantityId(PhysicalQuantityId.Height)).toBe(true);
    expect(getComfortModelConfig(ModelId.Phs2023).extraQuantities).toEqual([
      PhysicalQuantityId.BodyWeight,
      PhysicalQuantityId.Height,
    ]);

    for (const modelId of comfortModelOrder) {
      if (modelId === ModelId.Phs2023) continue;
      expect(getComfortModelConfig(modelId).extraQuantities).toEqual([]);
    }
  });
});
