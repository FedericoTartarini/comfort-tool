import type { Address } from "$lib/core/page";
import type { Session } from "$lib/state/session.svelte";
import { addressFromRoute, navigateTo } from "./navigation";

/** The app's own ways to an address: a navigation link and the model select follow one, the dialog's yes accepts. */
export interface InAppSwitch {
  follow(target: Address): void;
  accept(): void;
}

/**
 * Switching from inside the app: the session is asked first and the address
 * is told after, which is the order ADR-0002 decision 32 needs. Navigating
 * first would make the address the thing that switches the model, leaving no
 * moment at which the session could ask about the switch. No effect follows
 * the session with the address, because the handlers that switch can say
 * both things themselves.
 *
 * The session asks as the page the person is on compares (ADR-0002 decision
 * 57), and the page asked for is held here until the question is answered: a
 * standard's link followed from Explore may ask, and its yes lands on the
 * Standard page.
 */
export function inAppSwitch(session: Session): InAppSwitch {
  let targetPage = session.page;

  /**
   * The address follows the session, never the other way round. A request the
   * session holds a question about changed no model, so there is nothing to
   * tell the address until the question has been answered with a yes; and an
   * address already where the session is is not pushed again, so a link to
   * where the person is does nothing.
   */
  function tellAddress() {
    if (session.pendingSwitch) {
      return;
    }
    const target = { page: targetPage, model: session.model };
    const current = addressFromRoute();
    if (target.page !== current?.page || target.model !== current.model) {
      navigateTo(target);
    }
  }

  return {
    follow(target) {
      targetPage = target.page;
      session.requestModel(target.model);
      tellAddress();
    },
    accept() {
      session.acceptSwitch();
      tellAddress();
    },
  };
}
