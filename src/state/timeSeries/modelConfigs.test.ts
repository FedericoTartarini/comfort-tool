import { describe, expect, it } from "vitest";

import { ModelId } from "../../catalog/modelIds";
import { getComfortModelConfig } from "../modelRegistry";
import {
  getTimeSeriesModelConfig,
  timeSeriesModelOrder,
} from "./modelConfigs";

describe("Time-series model registry", () => {
  it("derives enabled models from PHS features.timeSeries rather than a second product list", () => {
    expect(timeSeriesModelOrder).toEqual([ModelId.Phs2023]);
    const phs = getComfortModelConfig(ModelId.Phs2023);
    expect(phs.timeSeries).toBeDefined();
    expect(phs.timeSeries?.rows.length).toBeGreaterThan(0);
    expect(getTimeSeriesModelConfig(ModelId.Phs2023).id).toBe(ModelId.Phs2023);
  });
});
