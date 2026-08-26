import type { Band, ModelOutput } from "../../../../models/modelCapabilities";
import type { ComplianceSpec } from "../../../../models/modelCapabilities";
import {
  ChartLegendKind,
  type ChartLegendViewModel,
} from "../chartBuildResult";
import {
  FieldChartProfileKind,
} from "../../../../models/output/fieldChartProfile";
import type { ChartBuildContext } from "../../../../models/modelCapabilities";

function selectLegendBands(
  bands: readonly Band[],
): Array<{ label: string; color: string }> {
  const selected: Array<{ label: string; color: string }> = [];
  for (const { label, color } of bands) {
    if (!selected.some((band) => band.label === label && band.color === color)) {
      selected.push({ label, color });
    }
  }
  return selected;
}

export function buildChartLegendFromContext(
  context: ChartBuildContext,
  options: {
    readonly showsLegend: boolean;
    readonly complianceProfile?: ComplianceSpec;
    readonly exploreOutputs: readonly ModelOutput[];
    readonly modelId: string;
  },
): ChartLegendViewModel | null {
  if (!options.showsLegend) {
    return null;
  }

  const { fieldChartConfig } = context;
  const items = selectLegendBands(fieldChartConfig.bands);
  let title = "";

  if (fieldChartConfig.profileKind === FieldChartProfileKind.Compliance) {
    if (!options.complianceProfile) {
      throw new Error(
        `Comfort model ${options.modelId} is missing its Compliance legend declaration.`,
      );
    }
    title = options.complianceProfile.legendTitle;
  } else {
    const output = options.exploreOutputs.find(
      ({ key }) => key === fieldChartConfig.zOutput,
    );
    if (!output) {
      throw new Error(
        `Comfort model ${options.modelId} does not declare Explore output ${fieldChartConfig.zOutput}.`,
      );
    }
    title = output.legendTitle ?? output.label;
  }

  return {
    kind: ChartLegendKind.Bands,
    title,
    items,
  };
}
