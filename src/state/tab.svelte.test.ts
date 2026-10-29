/**
 * What the root holds about the tab (ADR-0002 decision 63, rules 3, 6 and 8)
 * at the state seam: an address and its share link's text in, the open
 * session, the notices raised and the link waiting on the person's answer
 * out, and the one operation that replaces the session, run by Reset and by
 * a link's yes. Session storage is the test environment's; no router, no component.
 */
import { afterEach, describe, expect, it } from "vitest";
import { chartType } from "$lib/core/chartType";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { page, type Address } from "$lib/core/page";
import { quantities } from "$lib/core/quantities";
import { toText } from "$lib/core/shareLink";
import { unitSystem } from "$lib/core/unitSystem";
import { startingChartSettings, startingSession } from "$lib/core/writtenSession";
import { registeredModels } from "$lib/models";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { writeKeptText } from "./keptText";
import type { Notice } from "./openSession";
import type { Session } from "./session.svelte";
import { addressOf, editBands, heldSlot, keptTextOf, lackingLinkTextOf, linkSessionOf, openedOn, outOfRangeRowsOf, sessionComparingThreeSlots } from "./sessionTestReaders";
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
  editBands(session, (draft) => draft.setLabel(0, "Freezing"));
  return session;
}

/** A tab, and the notices it raises, in order. */
interface RecordingTab {
  tab: Tab;
  raised: Notice[];
}

/** A tab on the registered models, recording the notices it raises. */
function recordingTab(): RecordingTab {
  const raised: Notice[] = [];
  return { tab: new Tab(registeredModels, (notice) => raised.push(notice)), raised };
}

/** A tab that kept `kept`, opened at `address` through a link carrying `link`, and the notices it raises. */
function tabOpenedThroughLink(kept: Session, address: Address, link: string): RecordingTab {
  writeKeptText(keptTextOf(kept));
  const opened = recordingTab();
  opened.tab.arrive(address, link);
  return opened;
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

    const { tab, raised } = tabOpenedThroughLink(kept, addressOf(sender), link);

    kept.setAddress(addressOf(sender));
    expect(openedOn(openSessionOf(tab))).toEqual(openedOn(kept));
    expect(tab.waitingLink).toBe(link);
    expect(raised).toEqual([]);
  });

  it("answered yes gives the link's session and nothing of the kept one, and no link waits", () => {
    const sender = senderSession();
    const { tab, raised } = tabOpenedThroughLink(keptSession(), addressOf(sender), toText(linkSessionOf(sender), registeredModels));
    const before = openSessionOf(tab);

    tab.acceptLink();

    const session = openSessionOf(tab);
    expect(session).not.toBe(before);
    expect(openedOn(session)).toEqual({ written: linkSessionOf(sender), page: page.explore, pendingSwitch: null });
    expect(tab.waitingLink).toBeNull();
    expect(raised).toEqual([]);
    // The kept session had been on PMV (ISO 7730) and the link had not: it is on its defaults.
    session.setAddress({ page: page.explore, model: pmvPpdIso });
    expect(session.chart.toChartSettings()).toEqual(startingChartSettings(pmvPpdIso));
  });

  it("answered no gives the kept session, unchanged but for having followed the address, and no link waits", () => {
    const kept = keptSession();
    const sender = senderSession();
    const { tab, raised } = tabOpenedThroughLink(kept, addressOf(sender), toText(linkSessionOf(sender), registeredModels));
    const before = openSessionOf(tab);

    tab.declineLink();

    kept.setAddress(addressOf(sender));
    expect(openSessionOf(tab)).toBe(before);
    expect(openedOn(openSessionOf(tab))).toEqual(openedOn(kept));
    expect(tab.waitingLink).toBeNull();
    expect(raised).toEqual([]);
  });

  it("to another model than the tab's, answered no, gives the kept session converted and cut as a typed address converts and cuts it, nothing asked, and the cut notice only then", () => {
    const kept = keptSession();
    // Past PMV (ISO 7730)'s 30 °C dry-bulb temperature, inside PMV (ASHRAE 55)'s: a switch in the app would ask.
    heldSlot(kept, 1).setEntered(q.tdb, 35);
    const sender = sessionComparingThreeSlots(pmvPpdIso);
    const { tab, raised } = tabOpenedThroughLink(kept, standardAddress(pmvPpdIso), toText(linkSessionOf(sender), registeredModels));
    expect(openSessionOf(tab).pendingSwitch).toBeNull();
    expect(raised).toEqual([]);

    tab.declineLink();

    kept.setAddress(standardAddress(pmvPpdIso));
    expect(openedOn(openSessionOf(tab))).toEqual(openedOn(kept));
    expect(openSessionOf(tab).model).toBe(pmvPpdIso);
    expect(heldSlot(openSessionOf(tab), 1).values.get(q.tdb)).toBe(30);
    expect(raised).toEqual(["valuesCut"]);
  });

  it("over a kept session the address cut, answered yes, gives only the link's notices", () => {
    const kept = keptSession();
    heldSlot(kept, 1).setEntered(q.tdb, 35);
    const sender = sessionComparingThreeSlots(pmvPpdIso);
    const { tab, raised } = tabOpenedThroughLink(kept, standardAddress(pmvPpdIso), toText(linkSessionOf(sender), registeredModels));

    tab.acceptLink();

    expect(raised).toEqual([]);
  });

  it("with a value out of range asks as one without does, and answered yes opens it cut, with the cut notice once", () => {
    const sender = senderSession();
    // Past PMV (ASHRAE 55)'s 40 °C dry-bulb temperature.
    heldSlot(sender, 0).setEntered(q.tdb, 45);
    const { tab, raised } = tabOpenedThroughLink(keptSession(), addressOf(sender), toText(linkSessionOf(sender), registeredModels));
    expect(tab.waitingLink).not.toBeNull();
    expect(raised).toEqual([]);

    tab.acceptLink();

    expect(heldSlot(openSessionOf(tab), 0).values.get(q.tdb)).toBe(40);
    expect(raised).toEqual(["valuesCut"]);
    expect(tab.waitingLink).toBeNull();
  });

  it("that lacks a value is refused (decision 88, rule 4): nothing waits, the kept session, and the notice", () => {
    const kept = keptSession();
    const sender = senderSession();
    const { tab, raised } = tabOpenedThroughLink(kept, addressOf(sender), lackingLinkTextOf(sender));

    kept.setAddress(addressOf(sender));
    expect(tab.waitingLink).toBeNull();
    expect(openedOn(openSessionOf(tab))).toEqual(openedOn(kept));
    expect(raised).toEqual(["linkRefused"]);
  });
});

describe("an arrival at a tab with nothing kept (ADR-0002 decision 84, rule 4)", () => {
  it("through a link with a value out of range opens it cut, with the cut notice once", () => {
    const sender = senderSession();
    // Past PMV (ASHRAE 55)'s 40 °C dry-bulb temperature.
    heldSlot(sender, 0).setEntered(q.tdb, 45);
    const { tab, raised } = recordingTab();

    tab.arrive(addressOf(sender), toText(linkSessionOf(sender), registeredModels));

    expect(heldSlot(openSessionOf(tab), 0).values.get(q.tdb)).toBe(40);
    expect(raised).toEqual(["valuesCut"]);
  });

  it("through a link with none raises nothing", () => {
    const sender = senderSession();
    const { tab, raised } = recordingTab();

    tab.arrive(addressOf(sender), toText(linkSessionOf(sender), registeredModels));

    expect(raised).toEqual([]);
  });

  it("after the first, at a model under which a held value is out of range, cuts it and raises the cut notice; one with none raises nothing", () => {
    const { tab, raised } = recordingTab();
    tab.arrive(standardAddress(pmvPpdAshrae), undefined);
    // Past PMV (ISO 7730)'s 30 °C dry-bulb temperature, inside PMV (ASHRAE 55)'s.
    openSessionOf(tab).slots[0].setEntered(q.tdb, 35);

    tab.arrive({ page: page.explore, model: pmvPpdAshrae }, undefined);
    expect(raised).toEqual([]);
    tab.arrive(standardAddress(pmvPpdIso), undefined);

    expect(openSessionOf(tab).slots[0].values.get(q.tdb)).toBe(30);
    expect(raised).toEqual(["valuesCut"]);
  });
});

describe("Reset (ADR-0002 decision 63, rule 8)", () => {
  it("is the address's model on its defaults, whatever the session before held, and no link waits", () => {
    const onExplore = keptSession();
    onExplore.setAddress({ page: page.explore, model: heatIndexRothfusz });

    for (const before of [keptSession(), onExplore]) {
      writeKeptText(keptTextOf(before));
      const { tab, raised } = recordingTab();
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
      expect(raised).toEqual([]);
    }
  });

  it("leaves no entry out of range, on every registered model (ADR-0002 decision 84, rule 5)", () => {
    for (const model of registeredModels) {
      writeKeptText(keptTextOf(keptSession()));
      const { tab } = recordingTab();
      tab.arrive(standardAddress(model), undefined);

      tab.reset();

      expect(outOfRangeRowsOf(openSessionOf(tab)), model.info.label).toEqual([]);
    }
  });
});
