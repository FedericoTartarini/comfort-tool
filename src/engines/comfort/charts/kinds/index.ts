import type { ModelId as ModelIdType } from "../../../../catalog/modelIds";
import type { ChartBuildResult } from "../chartBuildResult";
import type { FieldChartProfile } from "../../../../catalog/output/fieldChartProfile";
import { FieldChartProfileKind } from "../../../../catalog/output/fieldChartProfile";
import type { InputId as InputIdType } from "../../../../catalog/inputSlots";
import type { ChartBuildContext } from "../../../../catalog/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../../../catalog/units";
import { ChartType, isChartType } from "../../../../catalog/chartTypes";
import {
  buildAdaptiveChartKind,
  buildBodyTemperatureChart,
  buildDynamicFieldChart,
  buildParametricChart,
  buildPsychrometricChart,
  buildUtciChart,
} from "./builders";
import type { PhysicalQuantityId as PhysicalQuantityIdType } from "../../../../catalog/quantities";
import {
  buildChartMemoKey,
  hashBands,
  hashChartSourceMemo,
  hashModelInputs,
  readChartMemo,
  writeChartMemo,
} from "./memo";
import type {
  Band,
  ComplianceSpec,
  ModelOutput,
} from "../../../../catalog/modelCapabilities";
import { buildChartLegendFromContext } from "./legend";
import type { ChartEngineRegistration } from "./types";

export interface ResolveChartBuildOptions<TResult, ChartSourceType> {
  readonly modelId: ModelIdType;
  readonly registrations: readonly ChartEngineRegistration<
    TResult,
    ChartSourceType
  >[];
  readonly instanceId: string;
  readonly chartSource: ChartSourceType | null;
  readonly resultsByInput: Record<InputIdType, TResult | null>;
  readonly profile: FieldChartProfile;
  readonly unitSystem: UnitSystemType;
  readonly baselineInputId: InputIdType;
  readonly chartSourceVersion: number;
  readonly modelInputs: Readonly<
    Partial<Record<PhysicalQuantityIdType, number>>
  >;
  readonly useMemo?: boolean;
  readonly showsLegend: boolean;
  readonly complianceProfile?: ComplianceSpec<Band, unknown>;
  readonly exploreOutputs: readonly ModelOutput[];
}

function toChartBuildContext(
  options: ResolveChartBuildOptions<unknown, unknown>,
): ChartBuildContext {
  const { profile } = options;
  if (profile.kind === FieldChartProfileKind.Compliance) {
    return {
      unitSystem: options.unitSystem,
      baselineInputId: options.baselineInputId,
      modelInputs: options.modelInputs,
      fieldChartConfig: {
        profileKind: FieldChartProfileKind.Compliance,
        xField: profile.xField,
        yField: profile.yField,
        zOutput: profile.zOutput,
        bands: profile.bands,
      },
    };
  }

  return {
    unitSystem: options.unitSystem,
    baselineInputId: options.baselineInputId,
    modelInputs: options.modelInputs,
    fieldChartConfig: {
      profileKind: FieldChartProfileKind.Explore,
      xField: profile.xField,
      yField: profile.yField,
      zOutput: profile.zOutput,
      bands: profile.bands,
    },
  };
}

export function resolveChartBuildResult<TResult, ChartSourceType>(
  options: ResolveChartBuildOptions<TResult, ChartSourceType>,
): ChartBuildResult {
  const registration = options.registrations.find(
    ({ instanceId }) => instanceId === options.instanceId,
  );
  if (!registration) {
    return {
      payload: null,
      legend: null,
      readiness: "empty",
      emptyMessage: "Chart not found.",
    };
  }

  const memoKey = buildChartMemoKey({
    modelId: options.modelId,
    instanceId: options.instanceId,
    unitSystem: options.unitSystem,
    xAxis: options.profile.xField,
    yAxis: options.profile.yField,
    zOutput: options.profile.zOutput,
    bandsHash: hashBands(
      options.profile.bands as readonly {
        min: number;
        max: number;
        label: string;
      }[],
    ),
    baselineInputId: options.baselineInputId,
    chartSourceVersion: options.chartSourceVersion,
    profileKind: options.profile.kind,
    modelInputsHash: hashModelInputs(options.modelInputs),
    sourceHash: hashChartSourceMemo(options.chartSource),
  });

  const context = toChartBuildContext(
    options as ResolveChartBuildOptions<unknown, unknown>,
  );

  if (options.useMemo !== false) {
    const cached = readChartMemo(memoKey);
    if (cached) {
      if (
        cached.readiness === "ready" &&
        options.showsLegend &&
        !cached.legend
      ) {
        const legend = buildChartLegendFromContext(context, {
          showsLegend: options.showsLegend,
          complianceProfile: options.complianceProfile,
          exploreOutputs: options.exploreOutputs,
          modelId: options.modelId,
        });
        return legend ? { ...cached, legend } : cached;
      }
      return cached;
    }
  }

  if (!isChartType(registration.registration.type)) {
    throw new Error(
      `Unknown chart type "${String(registration.registration.type)}".`,
    );
  }

  let result: ChartBuildResult;
  switch (registration.registration.type) {
    case ChartType.Dynamic:
      result = buildDynamicFieldChart(
        registration,
        options.chartSource,
        options.resultsByInput,
        context,
      );
      break;
    case ChartType.Psychrometric:
      result = buildPsychrometricChart(
        registration,
        options.chartSource,
        options.resultsByInput,
        context,
      );
      break;
    case ChartType.Utci:
      result = buildUtciChart(
        registration,
        options.chartSource,
        options.resultsByInput,
        context,
      );
      break;
    case ChartType.Adaptive:
      result = buildAdaptiveChartKind(
        registration,
        options.chartSource,
        options.resultsByInput,
        context,
      );
      break;
    case ChartType.HeatLoss:
    case ChartType.Set:
      result = buildParametricChart(
        registration,
        options.chartSource,
        options.resultsByInput,
        context,
      );
      break;
    case ChartType.BodyTemperature:
    case ChartType.WaterLoss:
      result = buildBodyTemperatureChart(
        registration,
        options.chartSource,
        options.resultsByInput,
        context,
      );
      break;
  }

  if (result.readiness === "ready" && options.showsLegend) {
    const legend = buildChartLegendFromContext(context, {
      showsLegend: options.showsLegend,
      complianceProfile: options.complianceProfile,
      exploreOutputs: options.exploreOutputs,
      modelId: options.modelId,
    });
    result = legend ? { ...result, legend } : result;
  }

  if (options.useMemo !== false && result.readiness === "ready") {
    writeChartMemo(memoKey, result);
  }
  return result;
}

export { resolveSimulationChartBuild } from "./simulation";
