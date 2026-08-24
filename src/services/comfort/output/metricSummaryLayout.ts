import type {
  MetricSummaryGroupViewModel,
  MetricSummaryItemViewModel,
} from "../../../models/output/tableLayouts";

export interface MetricSummaryLayoutViewModel {
  readonly overview: readonly MetricSummaryItemViewModel[];
  readonly groups: readonly MetricSummaryGroupViewModel[];
}

export function layoutMetricSummaryItems(
  items: readonly MetricSummaryItemViewModel[],
): MetricSummaryLayoutViewModel {
  const overview: MetricSummaryItemViewModel[] = [];
  const grouped = new Map<string, MetricSummaryItemViewModel[]>();

  for (const item of items) {
    const groupKey = item.group?.trim();
    if (!groupKey) {
      overview.push(item);
      continue;
    }

    const bucket = grouped.get(groupKey);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(groupKey, [item]);
    }
  }

  return {
    overview,
    groups: Array.from(grouped.entries()).map(([id, groupItems]) => ({
      id,
      title: id,
      items: groupItems,
    })),
  };
}

export function layoutMetricSummaryGroups(
  groups: readonly MetricSummaryGroupViewModel[],
): MetricSummaryLayoutViewModel {
  if (groups.length === 0) {
    return { overview: [], groups: [] };
  }

  if (groups.length === 1) {
    return layoutMetricSummaryItems(groups[0].items);
  }

  const [first, ...rest] = groups;
  return {
    overview: [...first.items],
    groups: rest,
  };
}
