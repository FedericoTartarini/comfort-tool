import { describe, expect, it } from "vitest";

import {
  adaptiveAshraeDeclaration,
  adaptiveAshraeZonesList,
} from "../../../declarations/adaptive/ashrae";
import {
  adaptiveEnDeclaration,
  adaptiveEnZonesList,
} from "../../../declarations/adaptive/en";
import { heatIndexZonesList } from "../../../declarations/heatIndex";
import { humidexZonesList } from "../../../declarations/humidex";
import { pmvZonesList } from "../../../declarations/pmv/calculation";
import { calculateUtci, utciZonesList } from "../../../declarations/utci/utci";
import { windChillZonesList } from "../../../declarations/windChill";
import { ComfortStandard } from "../../../catalog/calculationMetadata";
import {
  ModelId,
  type ModelId as ModelIdType,
} from "../../../catalog/modelIds";
import { defaultPhsPersonSettings } from "../../../catalog/phs";
import {
  PhysicalQuantityId,
  QuantityState,
  getPhysicalQuantityMeta,
  primaryInputOrder,
  resolveQuantityState,
} from "../../../catalog/quantities";
import { ModifierId } from "../../../catalog/inputModifiers";
import { findNumericBandIndexForValue, resolveBandEdge, type BandInputsSi } from "../../../catalog/modelCapabilities";
import type { ThermalZone } from "../../../catalog/thermalZone";
import {
  StandardId,
  SurfaceId,
  supportsStandardSurface,
} from "../../../catalog/surfaces";
import { ChartType, resolveChartCapabilities } from "../../../catalog/chartTypes";
import {
  comfortModelConfigs,
  comfortModelOrder,
  getComfortModelConfig,
  getDeclaredChartInstanceIds,
  getModelsForSurface,
  getModelsForStandard,
} from ".";

function createInputsSi(relativeAirSpeed: number): BandInputsSi {
  return { [PhysicalQuantityId.RelativeAirSpeed]: relativeAirSpeed };
}

function expectZoneDerivedBands(
  modelId: ModelIdType,
  zones: readonly ThermalZone[],
) {
  const output = getComfortModelConfig(modelId).exploreOutputs[0];
  expect(output.defaultBands).toEqual(
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
      [ModelId.PmvAshrae]: "pmv-ashrae-psychrometric",
      [ModelId.PmvIso]: "pmv-iso-psychrometric",
      [ModelId.Utci]: "utci-stress-band",
      [ModelId.AdaptiveAshrae]: "adaptive-ashrae-boundary",
      [ModelId.AdaptiveEn]: "adaptive-en-boundary",
      [ModelId.HeatIndex]: "heat-index-dynamic-field",
      [ModelId.Humidex]: "humidex-dynamic-field",
      [ModelId.WindChill]: "wind-chill-dynamic-field",
      [ModelId.Phs2023]: "phs-exposure-history",
    };

    comfortModelOrder.forEach((modelId) => {
      expect(
        getComfortModelConfig(modelId).chartInstances.defaultInstanceId,
      ).toBe(expectedDefaultCharts[modelId]);
    });
  });

  it("derives non-empty unique chart instance ids from declarations", () => {
    const globalIds: string[] = [];

    comfortModelOrder.forEach((modelId) => {
      const instanceIds = getDeclaredChartInstanceIds(modelId);
      expect(instanceIds.length).toBeGreaterThan(0);
      expect(new Set(instanceIds).size).toBe(instanceIds.length);
      globalIds.push(...instanceIds);
    });

    expect(new Set(globalIds).size).toBe(globalIds.length);
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
      "pmv-ashrae-psychrometric",
      "pmv-ashrae-dynamic-field",
      "pmv-ashrae-heat-loss",
      "pmv-ashrae-set",
    ]);
    expect(getDeclaredChartInstanceIds(ModelId.PmvIso)).toEqual([
      "pmv-iso-psychrometric",
      "pmv-iso-dynamic-field",
      "pmv-iso-heat-loss",
      "pmv-iso-set",
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
      ({ instanceId }) => instanceId === "phs-exposure-history",
    );
    const dynamicRegistration = config.chartEngineRegistrations.find(
      ({ instanceId }) => instanceId === "phs-dynamic-field",
    );

    expect(config.chartInstances.defaultInstanceId).toBe("phs-exposure-history");
    expect(history.instanceId).toBe("phs-exposure-history");
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
      PhysicalQuantityId.PhsRectalTemperature,
    ]);
    expect(historyRegistration?.defaultExploreOutput).toBe(
      PhysicalQuantityId.PhsRectalTemperature,
    );
    expect(dynamic.instanceId).toBe("phs-dynamic-field");
    expect(
      resolveChartCapabilities(dynamic.type, dynamic.capabilities)
        .allowsAxisSelection,
    ).toBe(true);
    expect(dynamicRegistration?.supportedExploreOutputs).toEqual([
      PhysicalQuantityId.PhsLimitingExposureTime,
      PhysicalQuantityId.PhsRectalTemperature,
      PhysicalQuantityId.PhsWaterLoss,
    ]);
  });

  it("identifies the ISO declaration and result metadata as ISO 7730 Category B", () => {
    const isoMeta = getComfortModelConfig(ModelId.PmvIso);

    expect(isoMeta.label).toContain("ISO 7730 Category B");
    expect(isoMeta.description).toContain("ISO 7730 Category B");
    expect(ComfortStandard.Iso7730PmvPpd).toContain("ISO 7730 Category B");
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
          SurfaceId.Standard, SurfaceId.Explore, ], outputs: [PhysicalQuantityId.Pmv, PhysicalQuantityId.Ppd], complianceOutput: PhysicalQuantityId.Pmv },
      [ModelId.PmvIso]: { capabilities: [
          SurfaceId.Standard, SurfaceId.Explore, ], outputs: [PhysicalQuantityId.Pmv, PhysicalQuantityId.Ppd], complianceOutput: PhysicalQuantityId.Pmv },
      [ModelId.Utci]: {
        capabilities: [SurfaceId.Explore],
        outputs: [PhysicalQuantityId.Utci],
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
        outputs: [PhysicalQuantityId.WindChill],
        complianceOutput: undefined,
      },
      [ModelId.Phs2023]: {
        capabilities: [
          SurfaceId.Standard,
          SurfaceId.Explore,
          SurfaceId.TimeSeries,
        ],
        outputs: [
          PhysicalQuantityId.PhsLimitingExposureTime,
          PhysicalQuantityId.PhsRectalTemperature,
          PhysicalQuantityId.PhsWaterLoss,
        ],
        complianceOutput: PhysicalQuantityId.PhsLimitingExposureTime,
      },
    } as const;

    comfortModelOrder.forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      expect(config.workspaceCapabilities).toEqual(
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
        supportsStandardSurface(config.workspaceCapabilities),
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
    expectZoneDerivedBands(ModelId.PmvAshrae, pmvZonesList);
    expectZoneDerivedBands(ModelId.PmvIso, pmvZonesList);
    expectZoneDerivedBands(ModelId.Utci, utciZonesList);
    expectZoneDerivedBands(ModelId.HeatIndex, heatIndexZonesList);
    expectZoneDerivedBands(ModelId.Humidex, humidexZonesList);
    expectZoneDerivedBands(ModelId.WindChill, windChillZonesList);
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

    expect(bands[0]).toEqual(
      expect.objectContaining({ min: -Infinity, max: -40 }),
    );
    const lastBand = bands[bands.length - 1];
    expect(lastBand).toEqual(
      expect.objectContaining({ min: 46, max: Infinity }),
    );
    expect(coldResult.utci).toBeLessThan(-50);
    expect(coldResult.stressCategory).toBe("extreme cold stress");
    expect(findNumericBandIndexForValue(bands, coldResult.utci)).toBe(0);
    expect(hotResult.utci).toBeGreaterThan(55);
    expect(hotResult.stressCategory).toBe("extreme heat stress");
    expect(findNumericBandIndexForValue(bands, hotResult.utci)).toBe(
      bands.length - 1,
    );
    expect(findNumericBandIndexForValue(bands, -40)).toBe(1);
    expect(findNumericBandIndexForValue(bands, 46)).toBe(bands.length - 1);
  });

  it("declares independent PMV bands and assigns PMV/PPD edges half-open", () => {
    const ashrae = getComfortModelConfig(ModelId.PmvAshrae);
    const iso = getComfortModelConfig(ModelId.PmvIso);
    const pmvOutput = ashrae.exploreOutputs.find(
      (output) => output.key === PhysicalQuantityId.Pmv,
    );
    const ppdOutput = ashrae.exploreOutputs.find(
      (output) => output.key === PhysicalQuantityId.Ppd,
    );
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

    expect(ashrae.complianceProfile).not.toBe(iso.complianceProfile);
    expect(ashrae.complianceProfile?.bands).not.toBe(
      iso.complianceProfile?.bands,
    );
    expect(ashrae.complianceProfile?.bands[1]).not.toBe(
      iso.complianceProfile?.bands[1],
    );
    expect(ashrae.complianceProfile?.bands).toEqual(
      iso.complianceProfile?.bands,
    );

    [ashrae, iso].forEach((config) => {
      const bands = config.complianceProfile!.bands;
      expect(bands[1]).toEqual(
        expect.objectContaining({
          min: -0.5,
          max: 0.5,
        }),
      );
    });

    expect(findNumericBandIndexForValue(ppdBands, 10)).toBe(1);
  });

  it("evaluates Adaptive functional bands from the existing standard boundaries", () => {
    const inputsSi = createInputsSi(0.1);
    const xValueSi = 20;
    const ashraeBands = adaptiveAshraeDeclaration.complianceProfile.bands;
    const enBands = adaptiveEnDeclaration.complianceProfile.bands;

    expect(adaptiveAshraeDeclaration.workspaceCapabilities).toEqual([
      SurfaceId.Standard,
    ]);
    expect(adaptiveEnDeclaration.workspaceCapabilities).toEqual([
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
      [ModelId.AdaptiveAshrae]: "adaptive-ashrae-boundary",
      [ModelId.AdaptiveEn]: "adaptive-en-boundary",
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
    expect(resolveQuantityState(PhysicalQuantityId.BodyWeight)).toBe(QuantityState.Extra);
    expect(resolveQuantityState(PhysicalQuantityId.Height)).toBe(QuantityState.Extra);
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
