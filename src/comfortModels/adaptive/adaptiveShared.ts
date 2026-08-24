import type {
  CalculationSource,
  ComfortStandard,
} from "../../models/calculationMetadata";
import type { ModelChartSourceDto } from "../../models/comfortDtos";
import {
  ComfortModel,
  type JsThermalComfortStandard,
} from "../../models/comfortModels";
import { PhysicalQuantityId } from "../../models/physicalQuantities";
import { InputControlId } from "../../models/inputControls";
import type { InputPresetKey as InputPresetKeyType } from "../../services/comfort/controls/inputControlPresets";
import {
  defaultAdaptiveOptions,
  OptionKey,
  TemperatureMode,
} from "../../models/inputModes";
import type { InputModifier } from "../../models/inputModifiers";
import {
  type Band,
  type ChartBuildContext,
  type ComplianceSpec,
  type ModelOutput,
} from "../../models/modelCapabilities";
import type { ThermalZone } from "../../models/thermalZone";
import type { StandardId as StandardIdType } from "../../models/workspaces";
import { TableLayout, type TableRowSpec } from "../../models/output/tableLayouts";
import {
  createTemperatureModeOptionHandler,
} from "../../services/comfort/controls/temperatureControl";
import {
  ComfortModelBuilder,
  type OutputChartDeclarationInput,
} from "../../state/comfortTool/modelConfigs/builder";
import { ChartKind } from "../../models/output/chartKinds";
import type { WorkspaceCapability as WorkspaceCapabilityType } from "../../models/output/workspaceCapabilities";
import {
  buildAdaptiveResultRows,
  calculateAdaptiveModel,
  parseAdaptiveOptions,
} from "./adaptiveCalculation";
import { buildAdaptiveChart } from "./adaptiveCharts";

export interface AdaptiveRequestDto {
  tdb: number;
  tr: number;
  trm: number;
  v: number;
}

export interface AdaptiveLevelDefinition {
  id: string;
  label: string;
  coolOffset: number;
  warmOffset: number;
}

export interface AdaptiveLevelResult {
  id: string;
  label: string;
  accepted: boolean;
  status: string | null;
  lower: number | null;
  upper: number | null;
}

export interface AdaptiveResponseDto {
  tCmf: number;
  operativeTemperature: number;
  levels: AdaptiveLevelResult[];
  isApplicable: boolean;
  standard: ComfortStandard;
  source: CalculationSource;
}

export interface AdaptiveBoundaryDefinition {
  bandSequence: readonly ThermalZone[];
  levels: readonly AdaptiveLevelDefinition[];
  coefficients: { slope: number; intercept: number };
}

export interface AdaptiveModelDeclaration extends AdaptiveBoundaryDefinition {
  modelId: typeof ComfortModel.AdaptiveAshrae | typeof ComfortModel.AdaptiveEn;
  label: string;
  description: string;
  standardIds: readonly StandardIdType[];
  workspaceCapabilities: readonly WorkspaceCapabilityType[];
  exploreOutputs: readonly ModelOutput[];
  modifiers: readonly InputModifier[];
  boundaryInstanceId: string;
  complianceProfile: ComplianceSpec<Band, AdaptiveResponseDto>;
  resultStandard: ComfortStandard;
  operativeTemperatureStandard: JsThermalComfortStandard;
  hoverLevelIds: readonly string[];
  complianceLevelId: string;
  outdoorTemperatureRangeSi: { min: number; max: number };
  outdoorTemperatureLabel: string;
  airSpeedPresetKey: InputPresetKeyType;
  colorByStatus: Readonly<Record<string, string>>;
  complianceColors: { compliant: string; nonCompliant: string };
  evaluateApplicability: (request: AdaptiveRequestDto) => number;
}

function buildAdaptiveTableRows(
  declaration: AdaptiveModelDeclaration,
): TableRowSpec<AdaptiveResponseDto>[] {
  const rowMeta = [
    { id: "compliance", label: "Compliance" },
    ...declaration.levels.map((level) => ({ id: level.id, label: level.label })),
  ];
  return rowMeta.map((meta, index) => ({
    id: meta.id,
    label: meta.label,
    format: (result, unitSystem) => (
      buildAdaptiveResultRows(declaration, unitSystem)[index].formatter(result)
    ),
  }));
}

export function createAdaptiveModelConfig(
  declaration: AdaptiveModelDeclaration,
) {
  const builder = new ComfortModelBuilder<
    AdaptiveResponseDto,
    ModelChartSourceDto<AdaptiveRequestDto>,
    Band
  >(declaration.modelId);

  builder
    .setLabel(declaration.label)
    .setDescription(declaration.description)
    .setStandardIds(declaration.standardIds)
    .setWorkspaceCapabilities([...declaration.workspaceCapabilities])
    .setExploreOutputs(declaration.exploreOutputs)
    .setModifiers(declaration.modifiers)
    .setComplianceProfile(declaration.complianceProfile)
    .setInputFields([
      { kind: "operativeTemperature" },
      {
        kind: "radiantTemperature",
        hideWhen: "air",
        label: "Mean radiant temperature",
      },
      {
        kind: "numeric",
        controlId: InputControlId.PrevailingMeanOutdoorTemperature,
        fieldKey: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
        label: declaration.outdoorTemperatureLabel,
      },
      {
        kind: "preset",
        presetKey: declaration.airSpeedPresetKey,
        controlId: InputControlId.AirSpeed,
        fieldKey: PhysicalQuantityId.RelativeAirSpeed,
        label: "Air speed",
      },
    ])
    .addOptionHandler(
      OptionKey.TemperatureMode,
      createTemperatureModeOptionHandler(),
    )
    .setDefaultOptions({
      ...defaultAdaptiveOptions,
      [OptionKey.TemperatureMode]: TemperatureMode.Operative,
    })
    .setOptionParser(parseAdaptiveOptions)
    .setDynamicAxisFields([
      PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      PhysicalQuantityId.OperativeTemperature,
    ])
    .setDefaultDynamicAxes({
      xAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      yAxis: PhysicalQuantityId.OperativeTemperature,
    })
    .setCalculator((context, visibleInputIds) => (
      calculateAdaptiveModel(context, visibleInputIds, declaration)
    ))
    .setOutputTable({
      layout: TableLayout.CompareMatrix,
      rows: buildAdaptiveTableRows(declaration),
    });

  const boundaryChart: OutputChartDeclarationInput = {
    instanceId: declaration.boundaryInstanceId,
    kind: ChartKind.BoundaryRegion,
    name: "Adaptive",
    emptyMessage: "No adaptive chart yet.",
    capabilities: {
      allowsAxisSelection: true,
      locksYAxis: false,
      allowsOutputSelection: false,
      allowsBandEditing: false,
      allowsBaselineSelection: true,
      showsZoneToggle: false,
      showsLegend: true,
      showsExport: true,
    },
    spec: {
      build: (
        chartSource: ModelChartSourceDto<AdaptiveRequestDto> | null,
        resultsByInput: Partial<Record<import("../../models/inputSlots").InputId, AdaptiveResponseDto | null>>,
        context: ChartBuildContext<Band>,
      ) => {
        if (!chartSource) return null;
        return buildAdaptiveChart(
          declaration,
          chartSource,
          resultsByInput,
          context,
        );
      },
    },
  };

  builder.setOutputCharts([boundaryChart], {
    defaultInstanceId: declaration.boundaryInstanceId,
  });

  return builder.build();
}
