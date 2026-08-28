import { createContext } from "svelte";
import type { AnalysisController } from "../analysis/types";
import type { WorkspaceNavigationCoordinator } from "./createWorkspaceNavigation";
import type { TimeSeriesController } from "../timeSeries/types";

export interface WorkspaceContext {
  readonly toolState: AnalysisController;
  readonly navigation: WorkspaceNavigationCoordinator;
  readonly timeSeriesState: TimeSeriesController;
}

export const [getWorkspaceContext, provideWorkspaceContext] =
  createContext<WorkspaceContext>();
