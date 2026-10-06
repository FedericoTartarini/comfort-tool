/**
 * What the root holds about the tab (ADR-0002 decision 63, rules 3, 6 and 8)
 * at the state seam: an address and its share link's text in, the open
 * session, the notice and the link waiting on the person's answer out, and
 * the one operation that replaces the session, run by Reset and by a link's
 * yes. Session storage is the test environment's; no router, no component.
 */
import { afterEach, describe, expect, it } from "vitest";
import { chartType } from "$lib/core/chartType";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { page, type Address } from "$lib/core/page";
import { quantities } from "$lib/core/quantities";
import { toDecodedSession, toText } from "$lib/core/shareLink";
import { unitSystem } from "$lib/core/unitSystem";
import { startingChartSettings, startingSession } from "$lib/core/writtenSession";
import { registeredModels } from "$lib/models";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { writeKeptText } from "./keptText";
import type { Session } from "./session.svelte";
import { addressOf, heldSlot, keptTextOf, linkSessionOf, openedOn, sessionComparingThreeSlots } from "./sessionTestReaders";
import { Tab } from "./tab.svelte";

const q = quantities;

/** The open session of `tab`, which the address has opened. */
function openSessionOf(tab: Tab): Session {
  const opened = tab.opened;
  if (!opened) {
    throw new Error("The address has not opened a session");
  }
  return opened.session;
}

/**
 * A session the tab kept: three slots compared on PMV (ASHRAE 55), IP, and a
 * chart type changed on PMV (ISO 7730), which it left and the link never
 * visits.
 */
function keptSession(): Session {
  const session = sessionComparingThreeSlots(pmvPpdIso);
  session.chart.type = chartType.dynamic;
  session.setModel(pmvPpdAshrae);
  heldSlot(session, 1).setEntered(q.tdb, 28);
  session.unitSystem = unitSystem.ip;
  return session;
}

/** The sender's session: Explore, PMV (ASHRAE 55), with a value and a Band label of its own. */
function senderSession(): Session {
  const session = sessionComparingThreeSlots(pmvPpdAshrae);
  session.setAddress({ page: page.explore, model: pmvPpdAshrae });
  heldSlot(session, 0).setEntered(q.tdb, 31);
  session.chart.setBandLabel(0, "Freezing");
  return session;
}

/** The link from `session` with slot 1's metabolic rate taken out, as a hand edit would: read, but not exactly. */
function filledLinkTextOf(session: Session): string {
  const written = linkSessionOf(session);
  const [first, ...others] = written.slots;
  const lacking = { ...first, values: new Map([...first.values].filter(([quantity]) => quantity !== q.met)) };
  const text = toText({ ...written, slots: [lacking, ...others] }, registeredModels);
  expect(toDecodedSession(text, registeredModels)?.exact).toBe(false);
  return text;
}

/** A tab that kept `kept`, opened at `address` through a link carrying `link`. */
function tabOpenedThroughLink(kept: Session, address: Address, link: string): Tab {
  writeKeptText(keptTextOf(kept));
  const tab = new Tab(registeredModels);
  tab.arrive(address, link);
  return tab;
}

function standardAddress(model: RegisteredModel): Address {
  return { page: page.standard, model };
}

afterEach(() => {
  sessionStorage.clear();
});

describe("a link reaching a tab that kept a session", () => {
  it("waits on the person's answer, the kept session open at the link's address meanwhile", () => {
    const kept = keptSession();
    const sender = senderSession();
    const link = toText(linkSessionOf(sender), registeredModels);

    const tab = tabOpenedThroughLink(kept, addressOf(sender), link);

    kept.setAddress(addressOf(sender));
    expect(openedOn(openSessionOf(tab))).toEqual(openedOn(kept));
    expect(tab.waitingLink).toBe(link);
    expect(tab.notice).toBeNull();
  });

  it("answered yes gives the link's session and nothing of the kept one, and no link waits", () => {
    const sender = senderSession();
    const tab = tabOpenedThroughLink(keptSession(), addressOf(sender), toText(linkSessionOf(sender), registeredModels));
    const before = openSessionOf(tab);

    tab.acceptLink();

    const session = openSessionOf(tab);
    expect(session).not.toBe(before);
    expect(openedOn(session)).toEqual({ written: linkSessionOf(sender), page: page.explore, pendingSwitch: null });
    expect(tab.waitingLink).toBeNull();
    expect(tab.notice).toBeNull();
    // The kept session had been on PMV (ISO 7730) and the link had not: it is on its defaults.
    session.setAddress({ page: page.explore, model: pmvPpdIso });
    expect(session.chart.toChartSettings()).toEqual(startingChartSettings(pmvPpdIso));
  });

  it("answered no gives the kept session, unchanged but for having followed the address, and no link waits", () => {
    const kept = keptSession();
    const sender = senderSession();
    const tab = tabOpenedThroughLink(kept, addressOf(sender), toText(linkSessionOf(sender), registeredModels));
    const before = openSessionOf(tab);

    tab.declineLink();

    kept.setAddress(addressOf(sender));
    expect(openSessionOf(tab)).toBe(before);
    expect(openedOn(openSessionOf(tab))).toEqual(openedOn(kept));
    expect(tab.waitingLink).toBeNull();
    expect(tab.notice).toBeNull();
  });

  it("to another model than the tab's, answered no, gives the kept session converted to it as a typed address converts it, nothing asked", () => {
    const kept = keptSession();
    // Past PMV (ISO 7730)'s 30 °C dry-bulb temperature, inside PMV (ASHRAE 55)'s: a switch in the app would ask.
    heldSlot(kept, 1).setEntered(q.tdb, 35);
    const sender = sessionComparingThreeSlots(pmvPpdIso);
    const tab = tabOpenedThroughLink(kept, standardAddress(pmvPpdIso), toText(linkSessionOf(sender), registeredModels));
    expect(openSessionOf(tab).pendingSwitch).toBeNull();

    tab.declineLink();

    kept.setAddress(standardAddress(pmvPpdIso));
    expect(openedOn(openSessionOf(tab))).toEqual(openedOn(kept));
    expect(openSessionOf(tab).model).toBe(pmvPpdIso);
    expect(heldSlot(openSessionOf(tab), 1).values.get(q.tdb)).toBe(35);
  });

  it("that needed something filled: answered yes, the link's session filled and the notice that says so", () => {
    const sender = senderSession();
    const tab = tabOpenedThroughLink(keptSession(), addressOf(sender), filledLinkTextOf(sender));
    expect(tab.notice).toBeNull();

    tab.acceptLink();

    const [starting] = startingSession(pmvPpdAshrae).slots;
    expect(heldSlot(openSessionOf(tab), 0).values.get(q.met)).toBe(starting.values.get(q.met));
    expect(heldSlot(openSessionOf(tab), 0).values.get(q.tdb)).toBe(31);
    expect(tab.notice).toBe("linkFilled");
    expect(tab.waitingLink).toBeNull();
  });

  it("that needed something filled: answered no, the kept session and no notice", () => {
    const kept = keptSession();
    const sender = senderSession();
    const tab = tabOpenedThroughLink(kept, addressOf(sender), filledLinkTextOf(sender));

    tab.declineLink();

    kept.setAddress(addressOf(sender));
    expect(openedOn(openSessionOf(tab))).toEqual(openedOn(kept));
    expect(tab.notice).toBeNull();
    expect(tab.waitingLink).toBeNull();
  });
});

describe("Reset (ADR-0002 decision 63, rule 8)", () => {
  it("is the address's model on its defaults, whatever the session before held, and no link waits", () => {
    const onExplore = keptSession();
    onExplore.setAddress({ page: page.explore, model: heatIndexRothfusz });

    for (const before of [keptSession(), onExplore]) {
      writeKeptText(keptTextOf(before));
      const tab = new Tab(registeredModels);
      tab.arrive(standardAddress(pmvPpdAshrae), undefined);
      openSessionOf(tab).setAddress(addressOf(before));
      const replaced = openSessionOf(tab);

      tab.reset();

      const address = addressOf(before);
      expect(openSessionOf(tab)).not.toBe(replaced);
      expect(openedOn(openSessionOf(tab)), `${address.model.info.label} on ${address.page.title}`).toEqual({
        written: startingSession(address.model),
        page: address.page,
        pendingSwitch: null,
      });
      expect(tab.waitingLink).toBeNull();
      expect(tab.notice).toBeNull();
    }
  });
});
