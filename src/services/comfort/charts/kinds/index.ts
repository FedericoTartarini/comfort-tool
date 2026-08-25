import type { ComfortModel as ComfortModelType } from "../../../../models/comfortModels";
import type { ChartBuildResult } from "../../../../models/output/chartBuildResult";
import type { FieldChartProfile } from "../../../../models/output/fieldChartProfile";
import { FieldChartProfileKind } from "../../../../models/output/fieldChartProfile";
import type { InputId as InputIdType } from "../../../../models/inputSlots";
import type { ChartBuildContext } from "../../../../models/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../../../models/units";
import { ChartKind, isChartKind } from "../../../../models/output/chartKinds";
import {
  buildBandScalarChart,
  buildBoundaryRegionChart,
  buildCustomChart,
  buildDynamicFieldChart,
  buildParametricLineChart,
  buildTimeSeriesLineChart,
} from "./builders";
import type { PhysicalQuantityId as PhysicalQuantityIdType } from "../../../../models/physicalQuantities";
import {
  buildChartMemoKey,
  hashBands,
  hashModelInputs,
  readChartMemo,
  writeChartMemo,
} from "./memo";
import type {
  Band,
  ComplianceSpec,
  ModelOutput,
} from "../../../../models/modelCapabilities";
import { buildChartLegendFromContext } from "./legend";
import type { ChartKindRegistration } from "./types";

export interface ResolveChartBuildOptions<TResult, ChartSourceType> {
  readonly modelId: ComfortModelType;
  readonly registrations: readonly ChartKindRegistration<
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
      plotly: null,
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

  if (!isChartKind(registration.registration.kind)) {
    throw new Error(
      `Unknown chart engine "${String(registration.registration.kind)}". ChartEngine is a closed set.`,
    );
  }

  let result: ChartBuildResult;
  switch (registration.registration.kind) {
    case ChartKind.DynamicField:
      result = buildDynamicFieldChart(
        registration,
        options.chartSource,
        options.resultsByInput,
        context,
      );
      break;
    case ChartKind.Custom:
      result = buildCustomChart(
        registration,
        options.chartSource,
        options.resultsByInput,
        context,
      );
      break;
    case ChartKind.BandScalar:
      result = buildBandScalarChart(
        registration,
        options.chartSource,
        options.resultsByInput,
        context,
      );
      break;
    case ChartKind.BoundaryRegion:
      result = buildBoundaryRegionChart(
        registration,
        options.chartSource,
        options.resultsByInput,
        context,
      );
      break;
    case ChartKind.ParametricLine:
      result = buildParametricLineChart(
        registration,
        options.chartSource,
        options.resultsByInput,
        context,
      );
      break;
    case ChartKind.TimeSeriesLine:
      result = buildTimeSeriesLineChart(
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
