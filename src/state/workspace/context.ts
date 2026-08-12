import { getContext, setContext } from "svelte";
import type { ComfortToolController } from "../comfortTool/types";
import type { WorkspaceNavigationCoordinator } from "./createWorkspaceNavigation";

export interface WorkspaceContext {
  readonly toolState: ComfortToolController;
  readonly navigation: WorkspaceNavigationCoordinator;
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
