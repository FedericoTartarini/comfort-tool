import type { RegisteredModel } from "$lib/core/modelDeclaration";
import type { Address } from "$lib/core/page";
import { Outputs } from "./compute.svelte";
import { firstLoadAt } from "./firstLoad";
import { clearKeptText, readKeptText } from "./keptText";
import type { Notice, OpenSession } from "./openSession";

/**
 * What the root holds about the tab beside its open session, and not in it
 * (ADR-0002 decision 63): the open session, what the notice line says, and a
 * share link waiting on the person's answer. It replaces the session one way,
 * which Reset and a link's yes both call (rule 8). Reads and clears what the
 * tab kept; writing it is the app's, at every change of the session.
 */
export class Tab {
  readonly #models: readonly RegisteredModel[];
  /** Set by the first address, and again by each replacement. Replaced whole, so `$state.raw`. */
  #opened = $state.raw<OpenSession>();
  #notice = $state<Notice | null>(null);
  #waitingLink = $state<string | null>(null);
  #replacements = $state(0);

  constructor(models: readonly RegisteredModel[]) {
    this.#models = models;
  }

  /** The open session and its outputs, or `undefined` until the first address opens them. */
  get opened(): OpenSession | undefined {
    return this.#opened;
  }

  /** What the notice line says, or `null` while it is closed. */
  get notice(): Notice | null {
    return this.#notice;
  }

  /**
   * A share link's text waiting on the person's yes, because the tab kept a
   * session it would replace (rule 8), or `null`. The question stands exactly
   * while there is one.
   */
  get waitingLink(): string | null {
    return this.#waitingLink;
  }

  /**
   * Counts the replacements of the session. A page reads the open session
   * once, when it is created, so a new one is not told to it: the router is
   * created again on each count, and the page with it (rule 8).
   */
  get replacements(): number {
    return this.#replacements;
  }

  /**
   * An address, and the share link's text it carried if any. The first opens
   * the session on its page and model, from its link or what the tab kept;
   * every one after it — a typed URL, the back button — moves the session
   * there. This is the address's path, and it never asks.
   */
  arrive(address: Address, link: string | undefined): void {
    if (this.#opened) {
      this.#opened.session.setAddress(address);
      return;
    }
    this.#openAt(address, link);
  }

  /** Replace the session with the defaults, once the person has said yes to Reset. */
  reset(): void {
    this.#replace(undefined);
  }

  /** The person said yes to the waiting link: the session is replaced by the link's. */
  acceptLink(): void {
    if (this.#waitingLink === null) {
      throw new Error("A link was accepted while none waited");
    }
    this.#replace(this.#waitingLink);
  }

  /** The person said no to the waiting link: it is dropped, and the session kept where the address moved it. */
  declineLink(): void {
    this.#waitingLink = null;
  }

  /** Say `notice`, in place of whatever the line said. */
  raiseNotice(notice: Notice): void {
    this.#notice = notice;
  }

  closeNotice(): void {
    this.#notice = null;
  }

  /**
   * Run the first address's load at `address`, with `link` and what the tab
   * kept: the session it opens, the notice it raises and the link it leaves
   * waiting, each in place of what was there.
   */
  #openAt(address: Address, link: string | undefined): void {
    const load = firstLoadAt(address, { link, kept: readKeptText() }, this.#models);
    this.#opened = { session: load.session, outputs: new Outputs(load.session) };
    this.#notice = load.notice;
    this.#waitingLink = load.waitingLink;
  }

  /**
   * Replace the tab's session (rule 8): forget what the tab kept and run the
   * first address's load again on the page and model the session is on, given
   * `link`. With nothing kept the load opens the link's session, or for
   * Reset's `undefined` the defaults, so neither caller holds a list of what
   * it replaces.
   */
  #replace(link: string | undefined): void {
    if (!this.#opened) {
      throw new Error("The session was replaced before the address opened it");
    }
    const { page, model } = this.#opened.session;
    clearKeptText();
    this.#openAt({ page, model }, link);
    this.#replacements += 1;
  }
}
