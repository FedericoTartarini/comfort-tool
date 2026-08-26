
/**
 * Calculates the relative air speed (vr) from the measured air speed (v) and metabolic rate (met).
 * vr is the sum of the average air speed measured by the sensor plus the activity-generated air speed.
 * Formula: vr = v + 0.3 * (met - 1) if met > 1, else v.
 */
export function deriveRelativeAirSpeedFromMeasured(v: number, met: number): number {
  let vr = v;
  if (met > 1) {
    vr = v + 0.3 * (met - 1);
  }
  // Match pythermalcomfort np.around(..., 3) for the SI calculation
  return Math.round(vr * 1000) / 1000;
}
