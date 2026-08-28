import {
  applyShareSnapshotToState,
  createShareStateSnapshot,
  type ShareStateSnapshot,
} from "../share/snapshot";
import { buildShareUrl } from "../share/url";
import type { PointActions } from "../sessionTypes";
import type { PointActionContext } from "./context";

export function createShareActions({
  session,
  internals,
  scheduleCalculation,
}: PointActionContext): Pick<
  PointActions,
  "exportShareSnapshot" | "exportShareUrl" | "applyShareSnapshot"
> {
  return {
    exportShareSnapshot: () => createShareStateSnapshot(session),
    exportShareUrl: (locationSource: URL | Location | string) =>
      buildShareUrl(createShareStateSnapshot(session), locationSource),
    applyShareSnapshot: (
      snapshot: ShareStateSnapshot,
      options?: { schedule?: boolean },
    ) => {
      applyShareSnapshotToState(session, snapshot);
      internals.invalidateAllModels();
      if (options?.schedule !== false) {
        scheduleCalculation({ immediate: true, force: true });
      }
    },
  };
}
