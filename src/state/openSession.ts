import { createContext } from "svelte";
import type { Outputs } from "./compute.svelte";
import type { Session } from "./session.svelte";

/**
 * A notice the app gives, as a toast at the top right (ADR-0002 decision 84,
 * rule 7): a link that could not be read, a link that needed something filled
 * or dropped, a clipboard that refused the link (decision 63, rule 6); an
 * Image that could not be made (decision 64, rule 8); and an arrival that cut
 * values to their bounds (decision 84, rule 4, as noted 2026-10-28).
 */
export type Notice = "linkRefused" | "linkFilled" | "copyRefused" | "imageFailed" | "valuesCut";

/**
 * The app's one session and the outputs derived from it, created once above
 * the router and read by every page, so nothing of it is lost by a change of
 * page (ADR-0002 decision 57). Reset, or a share link the person says yes
 * to, replaces both, and the pages are built
 * again on the new ones (decision 63, rule 8).
 */
export interface OpenSession {
  readonly session: Session;
  readonly outputs: Outputs;
}

/**
 * What the root holds about the tab beside its open session and offers the
 * pages (ADR-0002 decision 63, rules 7 and 8): Reset and the share link to
 * the page. Not the session's: none of it is kept or carried. Plain
 * functions, handed on to the controls as they are.
 */
export interface TabControls {
  /** Replace the tab's session with the defaults, once the person has said yes. */
  readonly reset: () => void;
  /** The share link to the page the open session is on now. */
  readonly link: () => string;
}

const [readContext, writeContext] = createContext<() => OpenSession>();
const [readTab, writeTab] = createContext<TabControls>();

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

/** Offer the pages below the tab's controls: the app's, since Reset replaces the open session the pages read. */
export function setTabControls(tab: TabControls): void {
  writeTab(tab);
}

/** The tab's controls, read by a page during its initialisation. */
export function getTabControls(): TabControls {
  return readTab();
}
