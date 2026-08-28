export const SurfaceId = {
  Standard: "standard",
  Explore: "explore",
  TimeSeries: "time-series",
} as const;

export type SurfaceId = (typeof SurfaceId)[keyof typeof SurfaceId];

export function supportsSurface(
  capabilities: readonly SurfaceId[],
  surface: SurfaceId,
): boolean {
  return capabilities.includes(surface);
}

export function supportsStandardSurface(
  capabilities: readonly SurfaceId[],
): boolean {
  return supportsSurface(capabilities, SurfaceId.Standard);
}

export function supportsExploreSurface(
  capabilities: readonly SurfaceId[],
): boolean {
  return supportsSurface(capabilities, SurfaceId.Explore);
}

export function supportsTimeSeriesSurface(
  capabilities: readonly SurfaceId[],
): boolean {
  return supportsSurface(capabilities, SurfaceId.TimeSeries);
}

export const StandardId = {
  Ashrae55: "ashrae-55",
  Iso7730: "iso-7730",
  En16798: "en-16798-1",
  Iso7933: "iso-7933",
} as const;

export type StandardId = (typeof StandardId)[keyof typeof StandardId];

/** Product routes: four Standard ids plus Explore and Time-series surfaces. */
export type AppRouteId = StandardId | typeof SurfaceId.Explore | typeof SurfaceId.TimeSeries | "not-found";
