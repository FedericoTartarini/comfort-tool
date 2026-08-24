import { describe, expect, it } from "vitest";

import { layoutMetricSummaryItems } from "./metricSummaryLayout";

describe("layoutMetricSummaryItems", () => {
  it("splits ungrouped metrics into the overview row and groups the rest", () => {
    const layout = layoutMetricSummaryItems([
      { id: "overall", label: "Overall", value: "42" },
      { id: "a", label: "A", value: "1", group: "Group 1" },
      { id: "b", label: "B", value: "2", group: "Group 1" },
    ]);

    expect(layout.overview).toEqual([
      { id: "overall", label: "Overall", value: "42" },
    ]);
    expect(layout.groups).toEqual([
      {
        id: "Group 1",
        title: "Group 1",
        items: [
          { id: "a", label: "A", value: "1", group: "Group 1" },
          { id: "b", label: "B", value: "2", group: "Group 1" },
        ],
      },
    ]);
  });
});
