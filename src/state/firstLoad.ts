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
  /** The notices the load raises, in order; none for a load that has nothing to say. */
  readonly notices: readonly Notice[];
  /**
   * A link's text left waiting on the person's yes, because the tab kept a
   * session it would replace (rule 8), or `null`. Its notice waits with it:
   * a yes runs this load again with the text and nothing kept.
   */
  readonly waitingLink: string | null;
  /**
   * The notices a no to the waiting link raises: the cut's, where the address
   * cut the kept session it keeps (decision 84, rule 4, and the user's ruling
   * on `.scratch/input-gate/` ticket 06); none while no link waits.
   */
  readonly declineNotices: readonly Notice[];
}

/**
 * The session a document load opens at `address` (ADR-0002 decision 63, rule
 * 3), and what it raises:
 *
 * - a link and nothing kept: the link's session, and the notice where it
 *   needed something filled or dropped;
 * - a link over a kept session: the kept session, the link waiting, and
 *   nothing raised: a yes runs the load again, and a no raises the kept
 *   session's cut;
 * - a link refused: the kept session, else the address's model on its
 *   defaults, and the notice;
 * - no link: the kept session, else the defaults, and nothing raised, since
 *   the person typed no text; a kept text refused or filled raises nothing.
 *
 * Whichever session opens is built under the model its text names and then
 * follows the address as at any arrival, converted and seeded and never asked
 * (rule 4, decision 32), and cut to its bounds; a cut is one more notice,
 * after the link's (decision 84, rule 4, as noted 2026-10-28).
 *
 * Touches no browser: the texts are read by the caller and handed in, so this
 * is the whole decision and is tested without one.
 */
export function firstLoadAt(address: Address, texts: LoadTexts, models: readonly RegisteredModel[]): FirstLoad {
  const kept = texts.kept === undefined ? undefined : toDecodedSession(texts.kept, models);
  if (texts.link === undefined) {
    return loadAt(address, kept?.session, []);
  }
  const link = toDecodedSession(texts.link, models);
  if (!link) {
    return loadAt(address, kept?.session, ["linkRefused"]);
  }
  if (kept) {
    const load = loadAt(address, kept.session, []);
    return { ...load, notices: [], waitingLink: texts.link, declineNotices: load.notices };
  }
  return loadAt(address, link.session, link.exact ? [] : ["linkFilled"]);
}

/**
 * The load of a session built from `written`, else the address's model on
 * its defaults, moved to `address`, with nothing waiting: `notices`, and the
 * cut's after them where the move cut a value.
 */
function loadAt(address: Address, written: WrittenSession | undefined, notices: readonly Notice[]): FirstLoad {
  const session = new Session(written ?? address.model);
  const cut = session.setAddress(address);
  return { session, notices: cut ? [...notices, "valuesCut"] : notices, waitingLink: null, declineNotices: [] };
}
