import type { PointInternals } from "../pointInternals";
import type { PointSessionBuckets } from "../sessionTypes";

export type ScheduleCalculation = (
  options?: { immediate?: boolean; force?: boolean },
) => void;

export type PointActionContext = {
  session: PointSessionBuckets;
  internals: PointInternals;
  scheduleCalculation: ScheduleCalculation;
};
