import { createContext } from "svelte";
import type { Outputs } from "./compute.svelte";
import type { Session } from "./session.svelte";

/**
 * The app's one session and the outputs derived from it, created once above
 * the router and read by every page, so nothing of it is lost by a change of
 * page (ADR-0002 decision 57). Reset replaces both, and the pages are built
 * again on the new ones (decision 63, rule 8).
 */
export interface OpenSession {
  readonly session: Session;
  readonly outputs: Outputs;
}

const [readContext, writeContext] = createContext<() => OpenSession>();
const [readReset, writeReset] = createContext<() => void>();

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

/**
 * Offer the pages below the way to Reset the tab's session (ADR-0002 decision
 * 63, rule 8): the app's, since it replaces the open session the pages read.
 */
export function setSessionReset(reset: () => void): void {
  writeReset(reset);
}

/** The way to Reset the tab's session, read by a page during its initialisation. */
export function getSessionReset(): () => void {
  return readReset();
}
