import { describe, expect, it } from "vitest";

import {
  adaptiveAshraeDeclaration,
  adaptiveAshraeZonesList,
} from "../../../comfortModels/adaptive/adaptiveAshrae";
import {
  adaptiveEnDeclaration,
  adaptiveEnZonesList,
} from "../../../comfortModels/adaptive/adaptiveEn";
import { heatIndexZonesList } from "../../../comfortModels/heatIndex";
import { humidexZonesList } from "../../../comfortModels/humidex";
import { pmvZonesList } from "../../../comfortModels/pmv/pmvCalculation";
import { calculateUtci, utciZonesList } from "../../../comfortModels/utci/utci";
import { windChillZonesList } from "../../../comfortModels/windChill";
import { ComfortStandard } from "../../../models/calculationMetadata";
import {
  ComfortModel,
  type ComfortModel as ComfortModelType,
} from "../../../models/comfortModels";
import { defaultPhsPersonSettings, PhsQuantityId } from "../../../models/phs";
import {
  PhysicalQuantityId,
  PhysicalQuantityScope,
  QuantityState,
  assembleQuantityCatalog,
  getPhysicalQuantityMeta,
  primaryInputOrder,
  systemQuantityMetaById,
} from "../../../models/physicalQuantities";
import { ModifierId } from "../../../models/inputModifiers";
import {
  WorkspaceCapability,
  supportsStandardWorkspace,
} from "../../../models/output/workspaceCapabilities";
import {
  findNumericBandIndexForValue,
  ModelOutputKey,
  resolveBandEdge,
  type BandInputsSi,
} from "../../../models/modelCapabilities";
import type { ThermalZone } from "../../../models/thermalZone";
import { StandardId, WorkspaceId } from "../../../models/workspaces";
import {
  ChartKind,
} from "../../../models/output/chartKinds";
import { TableType } from "../../../models/output/tableLayouts";
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

function expectZoneDerivedBands(modelId: ComfortModelType, zones: readonly ThermalZone[]) {
  const output = getComfortModelConfig(modelId).exploreOutputs[0];
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
      ComfortModel.Phs2023,
    ]);
    expect(comfortModelOrder).toEqual(Object.values(ComfortModel));

    comfortModelOrder.forEach((modelId) => {
      expect(comfortModelConfigs[modelId].id).toBe(modelId);
    });
  });

  it("declares the current fixed-first default chart matrix", () => {
    const expectedDefaultCharts: Record<ComfortModelType, string> = {
      [ComfortModel.PmvAshrae]: "pmv-ashrae-psychrometric",
      [ComfortModel.PmvIso]: "pmv-iso-psychrometric",
      [ComfortModel.Utci]: "utci-stress-band",
      [ComfortModel.AdaptiveAshrae]: "adaptive-ashrae-boundary",
      [ComfortModel.AdaptiveEn]: "adaptive-en-boundary",
      [ComfortModel.HeatIndex]: "heat-index-ranges",
      [ComfortModel.Humidex]: "humidex-ranges",
      [ComfortModel.WindChill]: "wind-chill-dynamic-field",
      [ComfortModel.Phs2023]: "phs-exposure-history",
    };

    comfortModelOrder.forEach((modelId) => {
      expect(getComfortModelConfig(modelId).outputCharts.defaultInstanceId)
        .toBe(expectedDefaultCharts[modelId]);
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
    [ComfortModel.HeatIndex, ComfortModel.Humidex].forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      const [mapChart, dynamicChart] = config.outputCharts.entries;
      expect(mapChart.kind).toBe(ChartKind.DynamicField);
      expect(mapChart.capabilities?.allowsAxisSelection).toBe(false);
      expect(dynamicChart.kind).toBe(ChartKind.DynamicField);
      expect(dynamicChart.capabilities?.allowsAxisSelection).toBe(true);
    });
  });

  it("allows Custom only on PMV models, using declaration-owned instance ids", () => {
    const customCharts = comfortModelOrder.flatMap((modelId) => (
      getComfortModelConfig(modelId).chartKindRegistrations
        .filter(({ registration }) => registration.kind === ChartKind.Custom)
        .map(({ instanceId }) => ({ modelId, instanceId }))
    ));
    expect(new Set(customCharts.map(({ modelId }) => modelId))).toEqual(new Set([
      ComfortModel.PmvAshrae,
      ComfortModel.PmvIso,
    ]));
    customCharts.forEach(({ modelId, instanceId }) => {
      const entry = getComfortModelConfig(modelId).outputCharts.entries.find(
        (chart) => chart.instanceId === instanceId,
      );
      expect(entry?.kind).toBe(ChartKind.Custom);
      expect(entry?.name).toBe("Psychrometric");
    });
  });

  it("declares PMV Dynamic as DynamicField", () => {
    [ComfortModel.PmvAshrae, ComfortModel.PmvIso].forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      const dynamic = config.outputCharts.entries.find(({ name }) => name === "Dynamic");
      expect(dynamic?.kind).toBe(ChartKind.DynamicField);
      const psychrometric = config.outputCharts.entries.find(({ name }) => name === "Psychrometric");
      expect(psychrometric?.kind).toBe(ChartKind.Custom);
    });
  });

  it("declares both PHS charts and their chart-specific Explore capabilities", () => {
    const config = getComfortModelConfig(ComfortModel.Phs2023);
    const [history, dynamic] = config.outputCharts.entries;
    const historyRegistration = config.chartKindRegistrations.find(
      ({ instanceId }) => instanceId === "phs-exposure-history",
    );
    const dynamicRegistration = config.chartKindRegistrations.find(
      ({ instanceId }) => instanceId === "phs-dynamic-field",
    );

    expect(config.outputCharts.defaultInstanceId).toBe("phs-exposure-history");
    expect(history.instanceId).toBe("phs-exposure-history");
    expect(history.kind).toBe(ChartKind.TimeSeriesLine);
    expect(history.capabilities).toEqual(expect.objectContaining({
      allowsAxisSelection: false,
      allowsBaselineSelection: true,
    }));
    expect(historyRegistration?.supportedExploreOutputs).toEqual([
      ModelOutputKey.PhsRectalTemperature,
    ]);
    expect(historyRegistration?.defaultExploreOutput)
      .toBe(ModelOutputKey.PhsRectalTemperature);
    expect(dynamic.instanceId).toBe("phs-dynamic-field");
    expect(dynamic.capabilities).toEqual(expect.objectContaining({
      allowsAxisSelection: true,
    }));
    expect(dynamicRegistration?.supportedExploreOutputs).toEqual([
      ModelOutputKey.PhsLimitingExposureTime,
      ModelOutputKey.PhsRectalTemperature,
      ModelOutputKey.PhsWaterLoss,
    ]);
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
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.RelativeHumidity,
        },
      },
      [ComfortModel.PmvIso]: {
        count: 42,
        defaults: {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.RelativeHumidity,
        },
      },
      [ComfortModel.Utci]: {
        count: 20,
        defaults: {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.RelativeHumidity,
        },
      },
      [ComfortModel.AdaptiveAshrae]: {
        count: 2,
        defaults: {
          xAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
          yAxis: PhysicalQuantityId.OperativeTemperature,
        },
      },
      [ComfortModel.AdaptiveEn]: {
        count: 2,
        defaults: {
          xAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
          yAxis: PhysicalQuantityId.OperativeTemperature,
        },
      },
      [ComfortModel.HeatIndex]: {
        count: 2,
        defaults: {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.RelativeHumidity,
        },
      },
      [ComfortModel.Humidex]: {
        count: 2,
        defaults: {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.RelativeHumidity,
        },
      },
      [ComfortModel.WindChill]: {
        count: 2,
        defaults: {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.WindSpeed,
        },
      },
      [ComfortModel.Phs2023]: {
        count: 30,
        defaults: {
          xAxis: PhysicalQuantityId.DryBulbTemperature,
          yAxis: PhysicalQuantityId.RelativeHumidity,
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
        capabilities: [WorkspaceCapability.Standard, WorkspaceCapability.Explore],
        outputs: [ModelOutputKey.Pmv, ModelOutputKey.Ppd],
        complianceOutput: ModelOutputKey.Pmv,
      },
      [ComfortModel.PmvIso]: {
        capabilities: [WorkspaceCapability.Standard, WorkspaceCapability.Explore],
        outputs: [ModelOutputKey.Pmv, ModelOutputKey.Ppd],
        complianceOutput: ModelOutputKey.Pmv,
      },
      [ComfortModel.Utci]: {
        capabilities: [WorkspaceCapability.Explore],
        outputs: [ModelOutputKey.Utci],
        complianceOutput: undefined,
      },
      [ComfortModel.AdaptiveAshrae]: {
        capabilities: [WorkspaceCapability.Standard],
        outputs: [],
        complianceOutput: ModelOutputKey.OperativeTemperature,
      },
      [ComfortModel.AdaptiveEn]: {
        capabilities: [WorkspaceCapability.Standard],
        outputs: [],
        complianceOutput: ModelOutputKey.OperativeTemperature,
      },
      [ComfortModel.HeatIndex]: {
        capabilities: [WorkspaceCapability.Explore],
        outputs: [ModelOutputKey.HeatIndex],
        complianceOutput: undefined,
      },
      [ComfortModel.Humidex]: {
        capabilities: [WorkspaceCapability.Explore],
        outputs: [ModelOutputKey.Humidex],
        complianceOutput: undefined,
      },
      [ComfortModel.WindChill]: {
        capabilities: [WorkspaceCapability.Explore],
        outputs: [ModelOutputKey.WindChill],
        complianceOutput: undefined,
      },
      [ComfortModel.Phs2023]: {
        capabilities: [
          WorkspaceCapability.Standard,
          WorkspaceCapability.Explore,
          WorkspaceCapability.TimeSeries,
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
      expect(config.workspaceCapabilities).toEqual(expected[modelId].capabilities);
      expect(config.exploreOutputs.map((output) => output.key)).toEqual(expected[modelId].outputs);
      expect(config.complianceProfile?.output).toBe(expected[modelId].complianceOutput);
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
    expect(getModelsForStandard(StandardId.Iso7933)).toEqual([
      ComfortModel.Phs2023,
    ]);
    expect(getModelsForWorkspace(WorkspaceId.Explore)).toEqual([
      ComfortModel.PmvAshrae,
      ComfortModel.PmvIso,
      ComfortModel.Utci,
      ComfortModel.HeatIndex,
      ComfortModel.Humidex,
      ComfortModel.WindChill,
      ComfortModel.Phs2023,
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
      if (modelId === ComfortModel.Phs2023) {
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
    const bands = getComfortModelConfig(ComfortModel.Utci).exploreOutputs[0].defaultBands;
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
    const pmvOutput = ashrae.exploreOutputs.find((output) => output.key === ModelOutputKey.Pmv);
    const ppdOutput = ashrae.exploreOutputs.find((output) => output.key === ModelOutputKey.Ppd);
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
    expect(ashrae.complianceProfile?.bands).not.toBe(iso.complianceProfile?.bands);
    expect(ashrae.complianceProfile?.bands[1]).not.toBe(iso.complianceProfile?.bands[1]);
    expect(ashrae.complianceProfile?.bands).toEqual(iso.complianceProfile?.bands);

    [ashrae, iso].forEach((config) => {
      const bands = config.complianceProfile!.bands;
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
    const ashraeBands = adaptiveAshraeDeclaration.complianceProfile.bands;
    const enBands = adaptiveEnDeclaration.complianceProfile.bands;

    expect(adaptiveAshraeDeclaration.workspaceCapabilities).toEqual([WorkspaceCapability.Standard]);
    expect(adaptiveEnDeclaration.workspaceCapabilities).toEqual([WorkspaceCapability.Standard]);
    expect(adaptiveAshraeDeclaration.exploreOutputs).toEqual([]);
    expect(adaptiveEnDeclaration.exploreOutputs).toEqual([]);
    expect(adaptiveAshraeDeclaration.complianceProfile.output)
      .toBe(ModelOutputKey.OperativeTemperature);
    expect(adaptiveEnDeclaration.complianceProfile.output)
      .toBe(ModelOutputKey.OperativeTemperature);
    const adaptiveChartInstance: Record<typeof ComfortModel.AdaptiveAshrae | typeof ComfortModel.AdaptiveEn, string> = {
      [ComfortModel.AdaptiveAshrae]: "adaptive-ashrae-boundary",
      [ComfortModel.AdaptiveEn]: "adaptive-en-boundary",
    };
    [ComfortModel.AdaptiveAshrae, ComfortModel.AdaptiveEn].forEach((modelId) => {
      const config = getComfortModelConfig(modelId);
      const chartInstanceId = adaptiveChartInstance[modelId];
      expect(config.outputCharts.entries.map(({ instanceId }) => instanceId)).toEqual([chartInstanceId]);
      expect(config.outputCharts.defaultInstanceId).toBe(chartInstanceId);
      expect(config.dynamicAxisFields).toEqual([
        PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
        PhysicalQuantityId.OperativeTemperature,
      ]);
    });
    expect(ashraeBands).not.toBe(enBands);
    expect(ashraeBands[0]).not.toBe(enBands[0]);
    expect(getComfortModelConfig(ComfortModel.AdaptiveAshrae).complianceProfile?.bands)
      .toEqual(ashraeBands);
    expect(getComfortModelConfig(ComfortModel.AdaptiveEn).complianceProfile?.bands)
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

  it("assembles one quantity catalog from the system seed and declaration extensions", () => {
    const weight = getPhysicalQuantityMeta(PhsQuantityId.BodyWeight);
    const height = getPhysicalQuantityMeta(PhsQuantityId.Height);
    const phsExtensions = getComfortModelConfig(ComfortModel.Phs2023).quantities.extend;

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
      ownerModelId: ComfortModel.Phs2023,
      defaultSi: defaultPhsPersonSettings[PhsQuantityId.BodyWeight],
    });
    expect(height).toMatchObject({
      id: PhsQuantityId.Height,
      scope: PhysicalQuantityScope.Model,
      state: QuantityState.Model,
      ownerModelId: ComfortModel.Phs2023,
      defaultSi: defaultPhsPersonSettings[PhsQuantityId.Height],
    });

    for (const modelId of comfortModelOrder) {
      if (modelId === ComfortModel.Phs2023) continue;
      expect(getComfortModelConfig(modelId).quantities.extend).toEqual([]);
    }
  });

  it("fails registry quantity assemble when two declarations extend the same id", () => {
    const mass = {
      id: "audit.exampleMass",
      owner: ComfortModel.PmvAshrae,
      scope: PhysicalQuantityScope.Model,
      label: "Example mass",
      display: {
        units: { SI: "kg", IP: "lb" },
        displayUnits: { SI: "kg", IP: "lb" },
        step: 1,
        decimals: 0,
      },
      defaultSi: 70,
      minSi: 40,
      maxSi: 120,
    };

    expect(() => assembleQuantityCatalog(collectRegisteredQuantityExtensions([
      { id: ComfortModel.PmvAshrae, quantities: { extend: [mass] } },
      {
        id: ComfortModel.PmvIso,
        quantities: { extend: [{ ...mass, owner: ComfortModel.PmvIso }] },
      },
    ]))).toThrow(/Duplicate quantity id "audit.exampleMass"/);

    expect(getPhysicalQuantityMeta(PhsQuantityId.BodyWeight).ownerModelId)
      .toBe(ComfortModel.Phs2023);
  });
});
