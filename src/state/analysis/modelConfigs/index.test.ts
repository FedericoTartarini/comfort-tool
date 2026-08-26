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
import { ComfortStandard } from "../../../models/calculationMetadata";
import {
  ModelId,
  type ModelId as ModelIdType,
} from "../../../models/modelIds";
import { defaultPhsPersonSettings, PhsQuantityId } from "../../../models/phs";
import { SiUnit } from "../../../models/units";
import {
  PhysicalQuantityId,
  PhysicalQuantityScope,
  QuantityState,
  assembleQuantityCatalog,
  getPhysicalQuantityMeta,
  primaryInputOrder,
  systemQuantityMetaById,
} from "../../../models/quantities";
import { ModifierId } from "../../../models/inputModifiers";
import {
  findNumericBandIndexForValue,
  ModelOutputKey,
  resolveBandEdge,
  type BandInputsSi,
} from "../../../models/modelCapabilities";
import type { ThermalZone } from "../../../models/thermalZone";
import {
  StandardId,
  WorkspaceId,
  supportsStandardWorkspace,
} from "../../../models/workspaces";
import { ChartEngine } from "../../../models/chartEngines";
import { TableType } from "../../../models/tableTypes";
import {
  comfortModelConfigs,
  comfortModelOrder,
  collectRegisteredQuantityExtensions,
  getComfortModelConfig,
  getDeclaredChartInstanceIds,
  getModelsForWorkspace,
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
      [ModelId.HeatIndex]: "heat-index-ranges",
      [ModelId.Humidex]: "humidex-ranges",
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

  it("declares Heat Index and Humidex maps as DynamicField", () => {
    [ModelId.HeatIndex, ModelId.Humidex].forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      const [mapChart, dynamicChart] = config.chartInstances.entries;
      expect(mapChart.engine).toBe(ChartEngine.DynamicField);
      expect(mapChart.capabilities?.allowsAxisSelection).toBe(false);
      expect(dynamicChart.engine).toBe(ChartEngine.DynamicField);
      expect(dynamicChart.capabilities?.allowsAxisSelection).toBe(true);
    });
  });

  it("allows Custom only on PMV models, using declaration-owned instance ids", () => {
    const customCharts = comfortModelOrder.flatMap((modelId) =>
      getComfortModelConfig(modelId)
        .chartEngineRegistrations.filter(
          ({ registration }) => registration.engine === ChartEngine.Custom,
        )
        .map(({ instanceId }) => ({ modelId, instanceId })),
    );
    expect(new Set(customCharts.map(({ modelId }) => modelId))).toEqual(
      new Set([ModelId.PmvAshrae, ModelId.PmvIso]),
    );
    customCharts.forEach(({ modelId, instanceId }) => {
      const entry = getComfortModelConfig(modelId).chartInstances.entries.find(
        (chart) => chart.instanceId === instanceId,
      );
      expect(entry?.engine).toBe(ChartEngine.Custom);
      expect(entry?.name).toBe("Psychrometric");
    });
  });

  it("declares PMV Dynamic as DynamicField", () => {
    [ModelId.PmvAshrae, ModelId.PmvIso].forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      const dynamic = config.chartInstances.entries.find(
        ({ name }) => name === "Dynamic",
      );
      expect(dynamic?.engine).toBe(ChartEngine.DynamicField);
      const psychrometric = config.chartInstances.entries.find(
        ({ name }) => name === "Psychrometric",
      );
      expect(psychrometric?.engine).toBe(ChartEngine.Custom);
    });
  });

  it("registers ParametricLine heat-loss and SET instances on both PMV standards", () => {
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
        ({ name }) => name === "Heat Loss",
      );
      const set = config.chartInstances.entries.find(
        ({ name }) => name === "SET",
      );
      expect(heatLoss?.engine).toBe(ChartEngine.ParametricLine);
      expect(set?.engine).toBe(ChartEngine.ParametricLine);
      expect(heatLoss?.capabilities).toEqual(
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
    expect(history.engine).toBe(ChartEngine.TimeSeriesLine);
    expect(history.capabilities).toEqual(
      expect.objectContaining({
        allowsAxisSelection: false,
        allowsBaselineSelection: true,
      }),
    );
    expect(historyRegistration?.supportedExploreOutputs).toEqual([
      ModelOutputKey.PhsRectalTemperature,
    ]);
    expect(historyRegistration?.defaultExploreOutput).toBe(
      ModelOutputKey.PhsRectalTemperature,
    );
    expect(dynamic.instanceId).toBe("phs-dynamic-field");
    expect(dynamic.capabilities).toEqual(
      expect.objectContaining({
        allowsAxisSelection: true,
      }),
    );
    expect(dynamicRegistration?.supportedExploreOutputs).toEqual([
      ModelOutputKey.PhsLimitingExposureTime,
      ModelOutputKey.PhsRectalTemperature,
      ModelOutputKey.PhsWaterLoss,
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
        defaults: {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.RelativeHumidity,
        },
      },
      [ModelId.PmvIso]: {
        count: 42,
        defaults: {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.RelativeHumidity,
        },
      },
      [ModelId.Utci]: {
        count: 20,
        defaults: {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.RelativeHumidity,
        },
      },
      [ModelId.AdaptiveAshrae]: {
        count: 2,
        defaults: {
          xAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
          yAxis: PhysicalQuantityId.OperativeTemperature,
        },
      },
      [ModelId.AdaptiveEn]: {
        count: 2,
        defaults: {
          xAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
          yAxis: PhysicalQuantityId.OperativeTemperature,
        },
      },
      [ModelId.HeatIndex]: {
        count: 2,
        defaults: {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.RelativeHumidity,
        },
      },
      [ModelId.Humidex]: {
        count: 2,
        defaults: {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.RelativeHumidity,
        },
      },
      [ModelId.WindChill]: {
        count: 2,
        defaults: {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.WindSpeed,
        },
      },
      [ModelId.Phs2023]: {
        count: 30,
        defaults: {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.RelativeHumidity,
        },
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
      [ModelId.PmvAshrae]: {
        capabilities: [
          WorkspaceId.Standard,
          WorkspaceId.Explore,
        ],
        outputs: [ModelOutputKey.Pmv, ModelOutputKey.Ppd],
        complianceOutput: ModelOutputKey.Pmv,
      },
      [ModelId.PmvIso]: {
        capabilities: [
          WorkspaceId.Standard,
          WorkspaceId.Explore,
        ],
        outputs: [ModelOutputKey.Pmv, ModelOutputKey.Ppd],
        complianceOutput: ModelOutputKey.Pmv,
      },
      [ModelId.Utci]: {
        capabilities: [WorkspaceId.Explore],
        outputs: [ModelOutputKey.Utci],
        complianceOutput: undefined,
      },
      [ModelId.AdaptiveAshrae]: {
        capabilities: [WorkspaceId.Standard],
        outputs: [],
        complianceOutput: ModelOutputKey.OperativeTemperature,
      },
      [ModelId.AdaptiveEn]: {
        capabilities: [WorkspaceId.Standard],
        outputs: [],
        complianceOutput: ModelOutputKey.OperativeTemperature,
      },
      [ModelId.HeatIndex]: {
        capabilities: [WorkspaceId.Explore],
        outputs: [ModelOutputKey.HeatIndex],
        complianceOutput: undefined,
      },
      [ModelId.Humidex]: {
        capabilities: [WorkspaceId.Explore],
        outputs: [ModelOutputKey.Humidex],
        complianceOutput: undefined,
      },
      [ModelId.WindChill]: {
        capabilities: [WorkspaceId.Explore],
        outputs: [ModelOutputKey.WindChill],
        complianceOutput: undefined,
      },
      [ModelId.Phs2023]: {
        capabilities: [
          WorkspaceId.Standard,
          WorkspaceId.Explore,
          WorkspaceId.TimeSeries,
        ],
        outputs: [
          ModelOutputKey.PhsLimitingExposureTime,
          ModelOutputKey.PhsRectalTemperature,
          ModelOutputKey.PhsWaterLoss,
        ],
        complianceOutput: ModelOutputKey.PhsLimitingExposureTime,
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
    expect(getModelsForWorkspace(WorkspaceId.Explore)).toEqual([
      ModelId.PmvAshrae,
      ModelId.PmvIso,
      ModelId.Utci,
      ModelId.HeatIndex,
      ModelId.Humidex,
      ModelId.WindChill,
      ModelId.Phs2023,
    ]);

    expect(getModelsForWorkspace(WorkspaceId.TimeSeries)).toEqual([]);

    for (const modelId of comfortModelOrder) {
      const config = getComfortModelConfig(modelId);
      expect(new Set(config.standardIds).size).toBe(config.standardIds.length);
      expect(config.standardIds.length > 0).toBe(
        supportsStandardWorkspace(config.workspaceCapabilities),
      );
    }
  });

  it("declares Analysis tables for every model and a TimeSeries table only on PHS", () => {
    comfortModelOrder.forEach((modelId) => {
      const { tables } = getComfortModelConfig(modelId);
      expect(tables.analysis.type).toBe(TableType.Analysis);
      expect(tables.analysis.rows.length).toBeGreaterThan(0);
      if (modelId === ModelId.Phs2023) {
        expect(tables.timeSeries?.type).toBe(TableType.TimeSeries);
        expect(tables.timeSeries?.rows.length).toBeGreaterThan(0);
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
      (output) => output.key === ModelOutputKey.Pmv,
    );
    const ppdOutput = ashrae.exploreOutputs.find(
      (output) => output.key === ModelOutputKey.Ppd,
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
      WorkspaceId.Standard,
    ]);
    expect(adaptiveEnDeclaration.workspaceCapabilities).toEqual([
      WorkspaceId.Standard,
    ]);
    expect(adaptiveAshraeDeclaration.exploreOutputs).toEqual([]);
    expect(adaptiveEnDeclaration.exploreOutputs).toEqual([]);
    expect(adaptiveAshraeDeclaration.complianceProfile.output).toBe(
      ModelOutputKey.OperativeTemperature,
    );
    expect(adaptiveEnDeclaration.complianceProfile.output).toBe(
      ModelOutputKey.OperativeTemperature,
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

  it("assembles one quantity catalog from the system seed and declaration extensions", () => {
    const weight = getPhysicalQuantityMeta(PhsQuantityId.BodyWeight);
    const height = getPhysicalQuantityMeta(PhsQuantityId.Height);
    const phsExtensions = getComfortModelConfig(ModelId.Phs2023).quantities
      .extend;

    expect(systemQuantityMetaById).not.toHaveProperty(PhsQuantityId.BodyWeight);
    expect(systemQuantityMetaById).not.toHaveProperty(PhsQuantityId.Height);
    expect(primaryInputOrder).not.toContain(PhsQuantityId.BodyWeight);
    expect(primaryInputOrder).not.toContain(PhsQuantityId.Height);

    expect(phsExtensions.map((extension) => extension.id)).toEqual([
      PhsQuantityId.BodyWeight,
      PhsQuantityId.Height,
    ]);
    expect(weight).toMatchObject({
      id: PhsQuantityId.BodyWeight,
      scope: PhysicalQuantityScope.Model,
      state: QuantityState.Model,
      ownerModelId: ModelId.Phs2023,
      defaultSi: defaultPhsPersonSettings[PhsQuantityId.BodyWeight],
    });
    expect(height).toMatchObject({
      id: PhsQuantityId.Height,
      scope: PhysicalQuantityScope.Model,
      state: QuantityState.Model,
      ownerModelId: ModelId.Phs2023,
      defaultSi: defaultPhsPersonSettings[PhsQuantityId.Height],
    });

    for (const modelId of comfortModelOrder) {
      if (modelId === ModelId.Phs2023) continue;
      expect(getComfortModelConfig(modelId).quantities.extend).toEqual([]);
    }
  });

  it("fails registry quantity assemble when two declarations extend the same id", () => {
    const mass = {
      id: "audit.exampleMass",
      owner: ModelId.PmvAshrae,
      scope: PhysicalQuantityScope.Model,
      label: "Example mass",
      display: {
        units: { SI: SiUnit.Kilogram, IP: "lb" },
        displayUnits: { SI: "kg", IP: "lb" },
        step: 1,
        decimals: 0,
      },
      defaultSi: 70,
      minSi: 40,
      maxSi: 120,
    };

    expect(() =>
      assembleQuantityCatalog(
        collectRegisteredQuantityExtensions([
          { id: ModelId.PmvAshrae, quantities: { extend: [mass] } },
          {
            id: ModelId.PmvIso,
            quantities: { extend: [{ ...mass, owner: ModelId.PmvIso }] },
          },
        ]),
      ),
    ).toThrow(/Duplicate quantity id "audit.exampleMass"/);

    expect(getPhysicalQuantityMeta(PhsQuantityId.BodyWeight).ownerModelId).toBe(
      ModelId.Phs2023,
    );
  });
});
