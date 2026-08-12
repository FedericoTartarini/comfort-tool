import type { ModelChartDefinition } from "../../models/chartOptions";
import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";
import { inputDisplayMetaById } from "../../models/inputSlotPresentation";
import { InputId, type InputId as InputIdType } from "../../models/inputSlots";
import {
  ChartMode,
  type Band,
  type ModelOutputKey,
  type NumericBand,
} from "../../models/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../models/units";
import { getDynamicAxisOptions } from "./dynamicAxes";
import {
  buildFieldChartConfig,
  getDeclaredExploreOutput,
} from "./fieldChartState";
import type { RuntimeComfortModelDefinition } from "./modelConfigs/definition";
import type {
  ChartControlsViewModel,
  ModelCalculationCache,
  ModelChartSettings,
} from "./types";

export function getEffectiveChartBaselineInputId(
  settings: ModelChartSettings,
  compareEnabled: boolean,
  visibleInputIds: readonly InputIdType[],
): InputIdType {
  return compareEnabled && visibleInputIds.includes(settings.baselineInputId)
    ? settings.baselineInputId
    : InputId.Input1;
}

function getExploreOutputs(
  config: RuntimeComfortModelDefinition,
) {
  return config.modes.includes(ChartMode.Explore) ? config.chartableOutputs : [];
}

function getExploreDefaultBands(
  config: RuntimeComfortModelDefinition,
  settings: ModelChartSettings,
): readonly NumericBand[] {
  if (!settings.explore) {
    throw new Error(
      `Comfort model ${config.id} is missing its Explore state declaration.`,
    );
  }
  const output = getDeclaredExploreOutput(config, settings.explore.zOutput);
  if (!output) {
    throw new Error(
      `Comfort model ${config.id} does not declare Explore output ${settings.explore.zOutput}.`,
    );
  }
  return output.defaultBands;
}

interface ChartPresentationCallbacks {
  onSelectBaseline: (inputId: InputIdType) => void;
  onSelectXAxis: (field: FieldKeyType) => void;
  onSelectYAxis: (field: FieldKeyType) => void;
  onSelectOutput: (outputKey: ModelOutputKey) => void;
  onApplyBands: (bands: readonly NumericBand[]) => boolean;
}

interface BuildChartControlsOptions {
  config: RuntimeComfortModelDefinition;
  settings: ModelChartSettings;
  chartDefinition: ModelChartDefinition;
  cache: ModelCalculationCache<unknown, unknown>;
  visibleInputIds: InputIdType[];
  compareEnabled: boolean;
  unitSystem: UnitSystemType;
  callbacks: ChartPresentationCallbacks;
}

export function buildChartControlsViewModel({
  config,
  settings,
  chartDefinition,
  cache,
  visibleInputIds,
  compareEnabled,
  unitSystem,
  callbacks,
}: BuildChartControlsOptions): ChartControlsViewModel {
  const fieldChartConfig = buildFieldChartConfig(config, settings);
  const outputs = getExploreOutputs(config);
  const baselineInputId = getEffectiveChartBaselineInputId(
    settings,
    compareEnabled,
    visibleInputIds,
  );
  const complianceSpec = settings.mode === ChartMode.Compliance
    ? config.complianceSpec
    : undefined;
  if (settings.mode === ChartMode.Compliance && !complianceSpec) {
    throw new Error(
      `Comfort model ${config.id} declares Compliance mode without a compliance specification.`,
    );
  }
  const selectedOutput = settings.mode === ChartMode.Explore
    ? getDeclaredExploreOutput(config, fieldChartConfig.zOutput)
    : undefined;
  if (settings.mode === ChartMode.Explore && !selectedOutput) {
    throw new Error(
      `Comfort model ${config.id} does not declare Explore output ${fieldChartConfig.zOutput}.`,
    );
  }

  const caption = complianceSpec
    ? complianceSpec.caption
    : chartDefinition.allowsAxisSelection
      ? `Showing ${selectedOutput!.label} over the selected axes with editable thresholds.`
      : `Showing ${selectedOutput!.label} on this chart's fixed axes with editable thresholds.`;
  const baselineResult = cache.status === "ready"
    ? cache.resultsByInput[baselineInputId]
    : null;
  const feedback = complianceSpec && baselineResult !== null
    ? {
        ...complianceSpec.getFeedback(baselineResult),
        ...(compareEnabled
          ? { inputLabel: inputDisplayMetaById[baselineInputId].label }
          : {}),
      }
    : null;

  return {
    mode: {
      selectedMode: settings.mode,
      caption,
      feedback,
    },
    baseline: compareEnabled
      ? {
          selectedInputId: baselineInputId,
          visibleInputIds,
          onSelect: callbacks.onSelectBaseline,
        }
      : null,
    axes: chartDefinition.allowsAxisSelection
      ? {
          x: {
            selectedField: settings.xAxis,
            options: getDynamicAxisOptions(config, settings, "x"),
            locked: false,
            onSelect: callbacks.onSelectXAxis,
          },
          y: {
            selectedField: settings.yAxis,
            options: getDynamicAxisOptions(config, settings, "y"),
            locked: chartDefinition.locksYAxis,
            onSelect: callbacks.onSelectYAxis,
          },
        }
      : null,
    explore: fieldChartConfig.mode === ChartMode.Explore && outputs.length > 0
      ? {
          config: fieldChartConfig,
          outputs,
          defaultBands: getExploreDefaultBands(config, settings),
          unitSystem,
          onSelectOutput: callbacks.onSelectOutput,
          onApplyBands: callbacks.onApplyBands,
        }
      : null,
  };
}

function selectLegendBands(
  bands: readonly Band[],
): Array<Pick<Band, "label" | "color">> {
  const selected: Array<Pick<Band, "label" | "color">> = [];
  for (const { label, color } of bands) {
    if (!selected.some((band) => band.label === label && band.color === color)) {
      selected.push({ label, color });
    }
  }
  return selected;
}

export function getChartLegendZones(
  config: RuntimeComfortModelDefinition,
  settings: ModelChartSettings,
  chartDefinition: ModelChartDefinition,
): Array<Pick<Band, "label" | "color">> | null {
  return chartDefinition.showsLegend
    ? selectLegendBands(buildFieldChartConfig(config, settings).bands)
    : null;
}

export function getChartLegendTitle(
  config: RuntimeComfortModelDefinition,
  settings: ModelChartSettings,
  chartDefinition: ModelChartDefinition,
): string {
  if (!chartDefinition.showsLegend) return "";
  const fieldChartConfig = buildFieldChartConfig(config, settings);
  if (fieldChartConfig.mode === ChartMode.Compliance) {
    if (!config.complianceSpec) {
      throw new Error(
        `Comfort model ${config.id} is missing its Compliance legend declaration.`,
      );
    }
    return config.complianceSpec.legendTitle;
  }
  const output = getDeclaredExploreOutput(config, fieldChartConfig.zOutput);
  if (!output) {
    throw new Error(
      `Comfort model ${config.id} does not declare Explore output ${fieldChartConfig.zOutput}.`,
    );
  }
  return output.legendTitle ?? output.label;
}
