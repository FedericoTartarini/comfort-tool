import { createContext } from "svelte";
import type { PointSession } from "../pointSession/types";
import type { AppNavigationCoordinator } from "./createAppNavigation";
import type { TimeSeriesSession } from "../timeSeries/types";

export interface AppContext {
  readonly pointSession: PointSession;
  readonly navigation: AppNavigationCoordinator;
  readonly timeSeriesSession: TimeSeriesSession;
}

export const [getAppContext, provideAppContext] =
  createContext<AppContext>();
