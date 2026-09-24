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
    session.input.compareEnabled = enabled;

    if (enabled) {
      session.input.compareInputIds = normalizeCompareInputIds(session.input.compareInputIds);
      if (session.input.compareInputIds.length < 2) {
        session.input.compareInputIds = createDefaultCompareInputIds();
      }
      if (!session.input.compareInputIds.includes(session.input.activeInputId)) {
        session.input.activeInputId = session.input.compareInputIds[0] ?? InputId.Input1;
      }
    } else {
      session.input.activeInputId = InputId.Input1;
    }

    internals.invalidateAllModels();
    scheduleCalculation({ immediate: true });
  }

  function setActiveInputId(nextInputId: InputIdType) {
    session.input.activeInputId = nextInputId;
  }

  function toggleCompareInputVisibility(inputId: InputIdType) {
    if (!session.input.compareEnabled || inputId === InputId.Input1) {
      return;
    }

    if (session.input.compareInputIds.includes(inputId)) {
      session.input.compareInputIds = session.input.compareInputIds.filter((visibleInputId) => visibleInputId !== inputId);
      if (session.input.activeInputId === inputId) {
        session.input.activeInputId = session.input.compareInputIds[0] ?? InputId.Input1;
      }
    } else {
      session.input.compareInputIds = normalizeCompareInputIds([...session.input.compareInputIds, inputId]);
    }

    internals.invalidateAllModels();
    scheduleCalculation({ immediate: true });
  }

  function toggleUnitSystem() {
    session.input.unitSystem = session.input.unitSystem === UnitSystem.SI ? UnitSystem.IP : UnitSystem.SI;
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
