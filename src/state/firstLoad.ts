import type { RegisteredModel } from "$lib/core/modelDeclaration";
import type { Address } from "$lib/core/page";
import { toDecodedSession } from "$lib/core/shareLink";
import type { WrittenSession } from "$lib/core/writtenSession";
import type { Notice } from "./openSession";
import { Session } from "./session.svelte";

/** The texts a document load finds: the address's share link, and the one the tab kept; either may be absent. */
export interface LoadTexts {
  readonly link: string | undefined;
  readonly kept: string | undefined;
}

/** What the page opens on after a document load. */
export interface FirstLoad {
  readonly session: Session;
  /** What the notice line says once the page opens, or `null`. */
  readonly notice: Notice | null;
  /**
   * A link's text left waiting on the person's yes, because the tab kept a
   * session it would replace (rule 8), or `null`. Its notice waits with it:
   * a yes runs this load again with the text and nothing kept.
   */
  readonly waitingLink: string | null;
}

/**
 * The session a document load opens at `address` (ADR-0002 decision 63, rule
 * 3), and what it raises:
 *
 * - a link and nothing kept: the link's session, and the notice where it
 *   needed something filled or dropped;
 * - a link over a kept session: the kept session, the link waiting;
 * - a link refused: the kept session, else the address's model on its
 *   defaults, and the notice;
 * - no link: the kept session, else the defaults, and nothing raised, since
 *   the person typed no text; a kept text refused or filled raises nothing.
 *
 * Whichever session opens is built under the model its text names and then
 * follows the address as at any arrival, converted and seeded and never asked
 * (rule 4, decision 32).
 *
 * Touches no browser: the texts are read by the caller and handed in, so this
 * is the whole decision and is tested without one.
 */
export function firstLoadAt(address: Address, texts: LoadTexts, models: readonly RegisteredModel[]): FirstLoad {
  const kept = texts.kept === undefined ? undefined : toDecodedSession(texts.kept, models);
  if (texts.link === undefined) {
    return { session: openedAt(address, kept?.session), notice: null, waitingLink: null };
  }
  const link = toDecodedSession(texts.link, models);
  if (!link) {
    return { session: openedAt(address, kept?.session), notice: "linkRefused", waitingLink: null };
  }
  if (kept) {
    return { session: openedAt(address, kept.session), notice: null, waitingLink: texts.link };
  }
  return { session: openedAt(address, link.session), notice: link.exact ? null : "linkFilled", waitingLink: null };
}

/** A session built from `written`, else the address's model on its defaults, moved to `address`. */
function openedAt(address: Address, written: WrittenSession | undefined): Session {
  const session = new Session(written ?? address.model);
  session.setAddress(address);
  return session;
}
