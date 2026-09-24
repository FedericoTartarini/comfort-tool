import type { PointActions, PointSessionBuckets } from "../sessionTypes";
import type { PointInternals } from "../pointInternals";
import { createChartActions } from "./chart";
import { createCompareActions } from "./compare";
import type { ScheduleCalculation } from "./context";
import { createModelActions } from "./model";
import { createQuantityActions } from "./quantities";
import { createShareActions } from "./share";

export type { ScheduleCalculation } from "./context";

export function createPointActions(
  session: PointSessionBuckets,
  internals: PointInternals,
  scheduleCalculation: ScheduleCalculation,
): PointActions {
  const ctx = { session, internals, scheduleCalculation };
  return {
    ...createModelActions(ctx),
    ...createChartActions(ctx),
    ...createCompareActions(ctx),
    ...createQuantityActions(ctx),
    ...createShareActions(ctx),
    scheduleCalculation,
  };
}
