import type { TemperatureMode } from "$lib/core/entryModes";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import type { Slot } from "$lib/core/slot";
import type { SlotBadge } from "$lib/core/slotBadge";
import type { UnitSystem } from "$lib/core/unitSystem";

/**
 * One slot the chart is drawn of: its last valid inputs, and the name and hue
 * its position gives it.
 */
export interface ChartedSlot extends SlotBadge {
  readonly slot: Slot;
}

/**
 * What both spec builders are asked to draw (ADR-0002 decision 50): the slots,
 * in slot order, beside what they share. The selected axes are the dynamic
 * chart's alone. Kept apart from `chartSpec.ts`, which holds only what the
 * chart component reads.
 */
export interface ChartRequest {
  readonly model: RegisteredModel;
  readonly slots: readonly ChartedSlot[];
  readonly unitSystem: UnitSystem;
  /**
   * The session's temperature entry mode, which the axes are resolved from
   * (ADR-0002 decision 51). No slot decides it: a slot kept in another mode
   * is converted into it by `withTemperatureMode`, the entry-mode change's
   * own conversion.
   */
  readonly temperatureMode: TemperatureMode;
  /** The atmospheric pressure the slots are resolved at, in Pa (ADR-0002 decision 49). */
  readonly atmosphericPressure: number;
}
