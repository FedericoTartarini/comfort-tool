import { InputId, type InputId as InputIdType } from "../../../catalog/inputSlots";
import type { SurfaceId as SurfaceIdType } from "../../../catalog/surfaces";
import type { ModelId as ModelIdType } from "../../../catalog/modelIds";
import { UnitSystem } from "../../../catalog/units";
import { normalizeCompareInputIds } from "../compareState";
import { createDefaultCompareInputIds } from "../initialPointSessionState";
import type { PointActions } from "../sessionTypes";
import type { PointActionContext } from "./context";

export function createCompareActions({
  session,
  internals,
  scheduleCalculation,
}: PointActionContext): Pick<
  PointActions,
  | "setCompareEnabled"
  | "setActiveInputId"
  | "toggleCompareInputVisibility"
  | "toggleUnitSystem"
  | "setActiveSurface"
  | "setAllowedModelIds"
> {
  function setCompareEnabled(enabled: boolean) {
    session.setting.compareEnabled = enabled;

    if (enabled) {
      session.setting.compareInputIds = normalizeCompareInputIds(session.setting.compareInputIds);
      if (session.setting.compareInputIds.length < 2) {
        session.setting.compareInputIds = createDefaultCompareInputIds();
      }
      if (!session.setting.compareInputIds.includes(session.setting.activeInputId)) {
        session.setting.activeInputId = session.setting.compareInputIds[0] ?? InputId.Input1;
      }
    } else {
      session.setting.activeInputId = InputId.Input1;
    }

    internals.invalidateAllModels();
    scheduleCalculation({ immediate: true });
  }

  function setActiveInputId(nextInputId: InputIdType) {
    session.setting.activeInputId = nextInputId;
  }

  function toggleCompareInputVisibility(inputId: InputIdType) {
    if (!session.setting.compareEnabled || inputId === InputId.Input1) {
      return;
    }

    if (session.setting.compareInputIds.includes(inputId)) {
      session.setting.compareInputIds = session.setting.compareInputIds.filter((visibleInputId) => visibleInputId !== inputId);
      if (session.setting.activeInputId === inputId) {
        session.setting.activeInputId = session.setting.compareInputIds[0] ?? InputId.Input1;
      }
    } else {
      session.setting.compareInputIds = normalizeCompareInputIds([...session.setting.compareInputIds, inputId]);
    }

    internals.invalidateAllModels();
    scheduleCalculation({ immediate: true });
  }

  function toggleUnitSystem() {
    session.setting.unitSystem = session.setting.unitSystem === UnitSystem.SI ? UnitSystem.IP : UnitSystem.SI;
  }

  function setActiveSurface(workspace: SurfaceIdType) {
    session.setting.activeSurface = workspace;
  }

  function setAllowedModelIds(modelIds: readonly ModelIdType[]) {
    session.setting.allowedModelIds = modelIds;
  }

  return {
    setCompareEnabled,
    setActiveInputId,
    toggleCompareInputVisibility,
    toggleUnitSystem,
    setActiveSurface,
    setAllowedModelIds,
  };
}
