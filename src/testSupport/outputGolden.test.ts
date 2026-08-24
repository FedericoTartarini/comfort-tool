import { describe, expect, it } from "vitest";

import { ChartInstanceId } from "../models/output/chartInstances";
import { comfortModelOrder } from "../state/comfortTool/modelConfigs";
import {
  buildAllModelOutputGoldenSnapshots,
  buildModelOutputGoldenSnapshot,
} from "./outputGoldenFixtures";

const goldenSnapshots = buildAllModelOutputGoldenSnapshots();

describe("output golden — table snapshots", () => {
  for (const snapshot of goldenSnapshots) {
    it(`${snapshot.modelId} produces stable table output`, () => {
      expect(snapshot.table.sections.length).toBeGreaterThan(0);
      expect(snapshot).toMatchSnapshot();
    });
  }
});

describe("output golden — chart snapshots", () => {
  for (const snapshot of goldenSnapshots) {
    it(`${snapshot.modelId} produces at least one chart`, () => {
      expect(snapshot.charts.length).toBeGreaterThan(0);
    });

    for (const chart of snapshot.charts) {
      it(`${snapshot.modelId} ${chart.instanceId} (${chart.profileKind}) has traces and axes`, () => {
        expect(chart.traceCount).toBeGreaterThan(0);
        expect(chart.layoutTitle.length).toBeGreaterThan(0);
        expect(chart.xAxisTitle.length).toBeGreaterThan(0);
        if (chart.instanceId !== ChartInstanceId.Utci.StressBand) {
          expect(chart.yAxisTitle.length).toBeGreaterThan(0);
        }
      });
    }
  }
});

describe("output golden — reproducibility", () => {
  for (const modelId of comfortModelOrder) {
    it(`${modelId} rebuilds identical snapshots`, () => {
      const first = buildModelOutputGoldenSnapshot(modelId);
      const second = buildModelOutputGoldenSnapshot(modelId);
      expect(second).toEqual(first);
    });
  }
});
