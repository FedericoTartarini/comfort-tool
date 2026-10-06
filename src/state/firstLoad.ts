import type { RegisteredModel } from "$lib/core/modelDeclaration";
import type { Address } from "$lib/core/page";
import { toDecodedSession } from "$lib/core/shareLink";
import { Session } from "./session.svelte";

/** The texts a document load finds: the one the tab kept, or none. */
export interface LoadTexts {
  readonly kept: string | undefined;
}

/** What the page opens on after a document load. */
export interface FirstLoad {
  readonly session: Session;
}

/**
 * The session a document load opens at `address` (ADR-0002 decision 63, rule
 * 3): the one the tab kept, else the address's model on its defaults as
 * before. A kept text refused gives the defaults, and one that needed
 * something filled or dropped gives its session, filled; neither raises
 * anything, since the person typed no text. Whichever session opens is built
 * under the model its text names and then follows the address as at any
 * arrival, converted and seeded and never asked (rule 4, decision 32).
 *
 * Touches no browser: the texts are read by the caller and handed in, so this
 * is the whole decision and is tested without one.
 */
export function firstLoadAt(address: Address, texts: LoadTexts, models: readonly RegisteredModel[]): FirstLoad {
  const kept = texts.kept === undefined ? undefined : toDecodedSession(texts.kept, models);
  const session = new Session(kept?.session ?? address.model);
  session.setAddress(address);
  return { session };
}
