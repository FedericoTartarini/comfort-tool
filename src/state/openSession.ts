import { createContext } from "svelte";
import type { Outputs } from "./compute.svelte";
import type { Session } from "./session.svelte";

/**
 * The app's one session and the outputs derived from it, created once above
 * the router and read by every page, so nothing of it is lost by a change of
 * page (ADR-0002 decision 57).
 */
export interface OpenSession {
  readonly session: Session;
  readonly outputs: Outputs;
}

const [readContext, writeContext] = createContext<() => OpenSession>();

/**
 * Offer the pages below the open session. Called by the app during its own
 * initialisation, which comes before the first address has opened one, so
 * what is offered is a way to read it, asked when a page is created.
 */
export function setOpenSession(read: () => OpenSession): void {
  writeContext(read);
}

/** The open session, read by a page during its initialisation. */
export function getOpenSession(): OpenSession {
  return readContext()();
}
