import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { NumericBand } from "../../catalog/modelCapabilities";
import type {
  ChartAxisQuantityId,
  PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../catalog/quantities";

export interface ChartControlCallbacks {
  onSelectBaseline: (inputId: InputIdType) => void;
  onSelectXAxis: (fieldKey: ChartAxisQuantityId) => void;
  onSelectYAxis: (fieldKey: ChartAxisQuantityId) => void;
  onSelectOutput: (outputKey: PhysicalQuantityIdType) => void;
  onApplyBands: (bands: readonly NumericBand[]) => boolean;
}
