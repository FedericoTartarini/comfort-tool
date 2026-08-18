export const WorkspaceId = {
  Standard: "standard",
  Explore: "explore",
  TimeSeries: "time-series",
} as const;

export type WorkspaceId = (typeof WorkspaceId)[keyof typeof WorkspaceId];

export const StandardId = {
  Ashrae55: "ashrae-55",
  Iso7730: "iso-7730",
  En16798: "en-16798-1",
  Iso7933: "iso-7933",
} as const;

export type StandardId = (typeof StandardId)[keyof typeof StandardId];

export const AppRouteId = {
  Ashrae55: "ashrae-55",
  Iso7730: "iso-7730",
  En16798: "en-16798-1",
  Iso7933: "iso-7933",
  Explore: "explore",
  TimeSeries: "time-series",
  NotFound: "not-found",
} as const;

export type AppRouteId = (typeof AppRouteId)[keyof typeof AppRouteId];
