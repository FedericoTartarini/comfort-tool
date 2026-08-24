import { describe, expect, it } from "vitest";

import { ComfortModel } from "../../models/comfortModels";
import { TableType } from "../../models/output/tableLayouts";
import { getComfortModelConfig } from "../comfortTool/modelConfigs";
import {
  getTimeSeriesModelConfig,
  timeSeriesModelOrder,
} from "./modelConfigs";

describe("Time-series model registry", () => {
  it("derives enabled models from PHS tables.timeSeries rather than a second product list", () => {
    expect(timeSeriesModelOrder).toEqual([ComfortModel.Phs2023]);
    const phs = getComfortModelConfig(ComfortModel.Phs2023);
    expect(phs.tables.timeSeries?.type).toBe(TableType.TimeSeries);
    expect(getTimeSeriesModelConfig(ComfortModel.Phs2023).id).toBe(ComfortModel.Phs2023);
  });
});
