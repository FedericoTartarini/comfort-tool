import { v_relative } from "jsthermalcomfort";

/**
 * Relative air speed from measured air speed and metabolic rate.
 * Delegates to jsthermalcomfort `v_relative` (matches pythermalcomfort).
 */
export function deriveRelativeAirSpeedFromMeasured(v: number, met: number): number {
  return v_relative(v, met);
}
