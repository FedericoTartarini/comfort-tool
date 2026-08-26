import { getContext, setContext } from "svelte";
import type { AnalysisController } from "../comfortTool/types";
import type { WorkspaceNavigationCoordinator } from "./createWorkspaceNavigation";
import type { TimeSeriesController } from "../timeSeries/types";

export interface WorkspaceContext {
  readonly toolState: AnalysisController;
  readonly navigation: WorkspaceNavigationCoordinator;
  readonly timeSeriesState: TimeSeriesController;
}

const workspaceContextKey = Symbol("comfort-tool-workspace");

export function provideWorkspaceContext(context: WorkspaceContext): WorkspaceContext {
  setContext(workspaceContextKey, context);
  return context;
}

export function getWorkspaceContext(): WorkspaceContext {
  const context = getContext<WorkspaceContext | undefined>(workspaceContextKey);
  if (!context) {
    throw new Error("Workspace context is unavailable outside the application shell.");
  }
  return context;
}
