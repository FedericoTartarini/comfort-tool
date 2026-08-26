import { describe, expect, it } from "vitest";

import { ModelId } from "../../models/modelIds";
import { TableType } from "../../models/tableTypes";
import { getComfortModelConfig } from "../analysis/modelConfigs";
import {
  getTimeSeriesModelConfig,
  timeSeriesModelOrder,
} from "./modelConfigs";

describe("Time-series model registry", () => {
  it("derives enabled models from PHS tables.timeSeries rather than a second product list", () => {
    expect(timeSeriesModelOrder).toEqual([ModelId.Phs2023]);
    const phs = getComfortModelConfig(ModelId.Phs2023);
    expect(phs.tables.timeSeries?.type).toBe(TableType.TimeSeries);
    expect(getTimeSeriesModelConfig(ModelId.Phs2023).id).toBe(ModelId.Phs2023);
  });
});
