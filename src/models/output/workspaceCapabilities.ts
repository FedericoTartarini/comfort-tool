import { WorkspaceId, type WorkspaceId as WorkspaceIdType } from "../workspaces";

export const WorkspaceCapability = {
  Standard: WorkspaceId.Standard,
  Explore: WorkspaceId.Explore,
  TimeSeries: WorkspaceId.TimeSeries,
} as const;

export type WorkspaceCapability = (typeof WorkspaceCapability)[keyof typeof WorkspaceCapability];

export function supportsWorkspace(
  capabilities: readonly WorkspaceCapability[],
  workspace: WorkspaceIdType,
): boolean {
  return capabilities.includes(workspace as WorkspaceCapability);
}

export function supportsStandardWorkspace(
  capabilities: readonly WorkspaceCapability[],
): boolean {
  return supportsWorkspace(capabilities, WorkspaceId.Standard);
}

export function supportsExploreWorkspace(
  capabilities: readonly WorkspaceCapability[],
): boolean {
  return supportsWorkspace(capabilities, WorkspaceId.Explore);
}

export function supportsTimeSeriesWorkspace(
  capabilities: readonly WorkspaceCapability[],
): boolean {
  return supportsWorkspace(capabilities, WorkspaceId.TimeSeries);
}
