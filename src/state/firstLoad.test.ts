/**
 * The first address's load (ADR-0002 decision 63, rules 3 and 4) at the state
 * seam: a link's text or none, a kept text or none and an address in, the
 * session the page opens on, the notices and the link left waiting out, with
 * no browser, no router and no component. The expected session is the app's
 * own: a model's starting session, the narrowed session a link was written
 * from, or the live session the text was written from, moved to the address
 * as the back button moves it.
 */
import { describe, expect, it } from "vitest";
import { chartType } from "$lib/core/chartType";
import { airSpeedMode, clothingMode, humidityMode, temperatureMode } from "$lib/core/entryModes";
import { optionsOf, type RegisteredModel } from "$lib/core/modelDeclaration";
import { page, type Address } from "$lib/core/page";
import { quantities } from "$lib/core/quantities";
import { toDecodedSession, toText } from "$lib/core/shareLink";
import type { Slot } from "$lib/core/slot";
import { unitSystem } from "$lib/core/unitSystem";
import { startingChartSettings, startingSession } from "$lib/core/writtenSession";
import { registeredModels } from "$lib/models";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { firstLoadAt } from "./firstLoad";
import { Session } from "./session.svelte";
import {
  addressOf,
  editBands,
  expectEverySlotInSessionEntryModes,
  heldSlot,
  keptTextOf,
  lackingLinkTextOf,
  linkSessionOf,
  openedOn,
  sessionComparingThreeSlots,
} from "./sessionTestReaders";

const q = quantities;
/** A pressure inside the bound's 30 000 Pa and off the default. */
const PRESSURE_IN_RANGE = 90000;
/** A pressure below the bound's 30 000 Pa (ADR-0002 decision 49). */
const PRESSURE_OUT_OF_RANGE = 20000;
const [airSpeedControl] = optionsOf(pmvPpdAshrae);

/** The text of a link copied from `session` on its page. */
function linkTextOf(session: Session): string {
  return toText(linkSessionOf(session), registeredModels);
}

/**
 * A session on PMV (ASHRAE 55) comparing three slots of their own values with
 * slot 3 disabled, every entry group off its default mode, an option ticked,
 * a pressure off its default, IP, and edited chart settings on PMV (ISO 7730),
 * which it left, and on PMV (ASHRAE 55). Every value is within its bound.
 */
function editedSession(): Session {
  const session = sessionComparingThreeSlots(pmvPpdIso);
  session.chart.type = chartType.dynamic;
  session.chart.setAxes({ x: q.met });
  editBands(session, (draft) => draft.moveEdge(3, 0.4));
  session.setModel(pmvPpdAshrae);
  editBands(session, (draft) => draft.setLabel(0, "Freezing"));
  session.setTemperatureMode(temperatureMode.operative);
  session.setAirSpeedMode(airSpeedMode.corrected);
  session.setClothingMode(clothingMode.corrected);
  session.setHumidityMode(humidityMode.dewPoint);
  heldSlot(session, 1).setEntered(q.operative_tmp, 27);
  heldSlot(session, 1).setOption(airSpeedControl, true);
  heldSlot(session, 2).setEntered(q.operative_tmp, 22);
  session.setSlotEnabled(2, false);
  session.unitSystem = unitSystem.ip;
  session.atmosphericPressure = PRESSURE_IN_RANGE;
  return session;
}

function standardAddress(model: RegisteredModel): Address {
  return { page: page.standard, model };
}

describe("the first address's load", () => {
  it("with nothing kept is the address's model on its defaults, on the address's page, for every registered model", () => {
    for (const model of registeredModels) {
      for (const onPage of [page.standard, page.explore]) {
        const { session } = firstLoadAt({ page: onPage, model }, { link: undefined, kept: undefined }, registeredModels);

        expect(openedOn(session), `${model.info.label} on ${onPage.title}`).toEqual({
          written: startingSession(model),
          page: onPage,
          pendingSwitch: null,
        });
      }
    }
  });

  it("with a kept text is that session: its slots, flags, entry modes, and every model's chart settings, and no notice", () => {
    const kept = editedSession();

    const { session, notices } = firstLoadAt(standardAddress(pmvPpdAshrae), { link: undefined, kept: keptTextOf(kept) }, registeredModels);

    expect(openedOn(session)).toEqual(openedOn(kept));
    expectEverySlotInSessionEntryModes(session);
    expect(notices).toEqual([]);
  });

  it("with a kept text holding a value out of range is that session cut to its bounds, and the cut notice once", () => {
    const kept = editedSession();
    // Past PMV (ASHRAE 55)'s 30 °C operative temperature, in slot 3, which is not compared.
    heldSlot(kept, 2).setEntered(q.operative_tmp, 60);
    const text = keptTextOf(kept);

    const { session, notices } = firstLoadAt(standardAddress(pmvPpdAshrae), { link: undefined, kept: text }, registeredModels);

    expect(kept.setAddress(standardAddress(pmvPpdAshrae))).toBe(true);
    expect(openedOn(session)).toEqual(openedOn(kept));
    expect(heldSlot(session, 2).values.get(q.operative_tmp)).toBeLessThan(60);
    expect(notices).toEqual(["valuesCut"]);
  });

  it("with a kept text on Explore opens on Explore, the session unchanged", () => {
    const kept = editedSession();

    const { session } = firstLoadAt({ page: page.explore, model: pmvPpdAshrae }, { link: undefined, kept: keptTextOf(kept) }, registeredModels);

    expect(openedOn(session)).toEqual({ ...openedOn(kept), page: page.explore });
  });

  it("with a kept text it refuses is the address's model on its defaults, and raises nothing", () => {
    for (const text of ["", "not a text", "v1.not-base64-json", "v2.e30"]) {
      expect(toDecodedSession(text, registeredModels), text).toBeUndefined();

      const { session, notices } = firstLoadAt(standardAddress(pmvPpdIso), { link: undefined, kept: text }, registeredModels);

      expect(openedOn(session), text).toEqual({ written: startingSession(pmvPpdIso), page: page.standard, pendingSwitch: null });
      expect(notices, text).toEqual([]);
    }
  });

  it("with a kept text that lacks a value and an option is refused, as one that does not read back as written (decision 88, rule 4): the defaults, and nothing raised", () => {
    const kept = editedSession();
    const written = kept.toWrittenSession();
    const [first, ...others] = written.slots;
    const lacking: Slot = {
      ...first,
      values: new Map([...first.values].filter(([quantity]) => quantity !== q.met)),
      options: new Map([...first.options].filter(([option]) => option !== airSpeedControl)),
    };
    const text = toText({ ...written, slots: [lacking, ...others] }, registeredModels);

    const { session, notices } = firstLoadAt(standardAddress(pmvPpdAshrae), { link: undefined, kept: text }, registeredModels);

    expect(openedOn(session)).toEqual({ written: startingSession(pmvPpdAshrae), page: page.standard, pendingSwitch: null });
    expect(notices).toEqual([]);
  });

  it("with a kept text written under another model follows the address as the back button does: converted, seeded and cut, nothing asked, and the cut notice", () => {
    const kept = sessionComparingThreeSlots(pmvPpdAshrae);
    // Past PMV (ISO 7730)'s 30 °C dry-bulb temperature, inside PMV (ASHRAE 55)'s: a switch in the app would ask.
    heldSlot(kept, 1).setEntered(q.tdb, 35);
    const text = keptTextOf(kept);
    kept.requestModel(pmvPpdIso);
    expect(kept.pendingSwitch).not.toBeNull();

    const { session, notices } = firstLoadAt(standardAddress(pmvPpdIso), { link: undefined, kept: text }, registeredModels);

    kept.setAddress(standardAddress(pmvPpdIso));
    expect(openedOn(session)).toEqual(openedOn(kept));
    expect(session.pendingSwitch).toBeNull();
    expect(heldSlot(session, 1).values.get(q.tdb)).toBe(30);
    expect(notices).toEqual(["valuesCut"]);
  });

  it("with a kept text written under a model without an entry group follows the address to one with it, seeded", () => {
    const kept = editedSession();
    kept.setAddress(standardAddress(adaptiveAshrae));
    const text = keptTextOf(kept);

    const { session } = firstLoadAt({ page: page.explore, model: pmvPpdIso }, { link: undefined, kept: text }, registeredModels);

    kept.setAddress({ page: page.explore, model: pmvPpdIso });
    expect(openedOn(session)).toEqual(openedOn(kept));
    expectEverySlotInSessionEntryModes(session);
  });
});

describe("the first address's load with a link", () => {
  /** A session on Explore, PMV (ASHRAE 55), where a link carries the Band list. */
  function onExplore(): Session {
    const session = editedSession();
    session.setAddress({ page: page.explore, model: pmvPpdAshrae });
    return session;
  }

  it("and nothing kept is the link's session, with no notice and nothing waiting", () => {
    const sender = onExplore();

    const { session, notices, waitingLink } = firstLoadAt(addressOf(sender), { link: linkTextOf(sender), kept: undefined }, registeredModels);

    expect(openedOn(session)).toEqual({ written: linkSessionOf(sender), page: page.explore, pendingSwitch: null });
    expect(notices).toEqual([]);
    expect(waitingLink).toBeNull();
  });

  it("with a value out of range and nothing kept is refused, not cut (decision 88, rule 5): the address's model on its defaults, and the refusal's notice alone", () => {
    const sender = onExplore();
    // Past PMV (ASHRAE 55)'s 30 °C operative temperature, in slot 1, which Explore compares.
    heldSlot(sender, 0).setEntered(q.operative_tmp, 60);

    const { session, notices, waitingLink } = firstLoadAt(addressOf(sender), { link: linkTextOf(sender), kept: undefined }, registeredModels);

    expect(openedOn(session)).toEqual({ written: startingSession(pmvPpdAshrae), page: page.explore, pendingSwitch: null });
    expect(notices).toEqual(["linkRefused"]);
    expect(waitingLink).toBeNull();
  });

  it("with the pressure out of range and nothing kept is refused the same way", () => {
    const sender = onExplore();
    sender.atmosphericPressure = PRESSURE_OUT_OF_RANGE;

    const { session, notices, waitingLink } = firstLoadAt(addressOf(sender), { link: linkTextOf(sender), kept: undefined }, registeredModels);

    expect(openedOn(session)).toEqual({ written: startingSession(pmvPpdAshrae), page: page.explore, pendingSwitch: null });
    expect(notices).toEqual(["linkRefused"]);
    expect(waitingLink).toBeNull();
  });

  it("copied on the Standard page and nothing kept is the link's session, the model on its classifier's Band list", () => {
    const sender = editedSession();
    const link = linkSessionOf(sender);
    expect(link.charts.get(pmvPpdAshrae)?.bands).toBeNull();

    const { session, notices } = firstLoadAt(addressOf(sender), { link: linkTextOf(sender), kept: undefined }, registeredModels);

    const chart = link.charts.get(pmvPpdAshrae);
    const bands = startingChartSettings(pmvPpdAshrae).bands;
    expect(openedOn(session)).toEqual({
      written: { ...link, charts: new Map([[pmvPpdAshrae, { ...chart, bands }]]) },
      page: page.standard,
      pendingSwitch: null,
    });
    expect(heldSlot(session, 1).values.get(q.operative_tmp)).toBe(sender.slots[1]?.values.get(q.operative_tmp));
    expect(notices).toEqual([]);
  });

  it("that lacks a value and nothing kept is refused (decision 88, rule 4): the address's model on its defaults, and the notice", () => {
    const sender = onExplore();

    const { session, notices, waitingLink } = firstLoadAt(addressOf(sender), { link: lackingLinkTextOf(sender), kept: undefined }, registeredModels);

    expect(openedOn(session)).toEqual({ written: startingSession(pmvPpdAshrae), page: page.explore, pendingSwitch: null });
    expect(notices).toEqual(["linkRefused"]);
    expect(waitingLink).toBeNull();
  });

  it("that lacks a value over a kept session is refused with nothing asked: the kept session, and the notice", () => {
    const kept = editedSession();

    const { session, notices, waitingLink } = firstLoadAt(addressOf(kept), { link: lackingLinkTextOf(onExplore()), kept: keptTextOf(kept) }, registeredModels);

    expect(openedOn(session)).toEqual(openedOn(kept));
    expect(notices).toEqual(["linkRefused"]);
    expect(waitingLink).toBeNull();
  });

  it("refused and nothing kept is the address's model on its defaults, and the notice", () => {
    for (const text of ["", "v1.not-base64-json", "v2.e30", linkTextOf(onExplore()).slice(0, -12)]) {
      const { session, notices, waitingLink } = firstLoadAt(standardAddress(pmvPpdIso), { link: text, kept: undefined }, registeredModels);

      expect(openedOn(session), text).toEqual({ written: startingSession(pmvPpdIso), page: page.standard, pendingSwitch: null });
      expect(notices, text).toEqual(["linkRefused"]);
      expect(waitingLink, text).toBeNull();
    }
  });

  it("refused over a kept session is the kept session, and the notice", () => {
    const kept = editedSession();

    const { session, notices, waitingLink } = firstLoadAt(addressOf(kept), { link: "v1.not-base64-json", kept: keptTextOf(kept) }, registeredModels);

    expect(openedOn(session)).toEqual(openedOn(kept));
    expect(notices).toEqual(["linkRefused"]);
    expect(waitingLink).toBeNull();
  });

  it("over a kept text that is refused is the link's session, with nothing waiting and no notice", () => {
    const sender = onExplore();

    const { session, notices, waitingLink } = firstLoadAt(addressOf(sender), { link: linkTextOf(sender), kept: "v1.not-base64-json" }, registeredModels);

    expect(openedOn(session)).toEqual({ written: linkSessionOf(sender), page: page.explore, pendingSwitch: null });
    expect(notices).toEqual([]);
    expect(waitingLink).toBeNull();
  });

  it("over a kept session is the kept session, the link waiting and no notice", () => {
    const kept = editedSession();
    const link = linkTextOf(onExplore());

    const { session, notices, declineNotices, waitingLink } = firstLoadAt(addressOf(kept), { link, kept: keptTextOf(kept) }, registeredModels);

    expect(openedOn(session)).toEqual(openedOn(kept));
    expect(notices).toEqual([]);
    expect(declineNotices).toEqual([]);
    expect(waitingLink).toBe(link);
  });

  it("over a kept session the address cuts is that session cut, the link waiting, no notice, and the cut notice held for a no", () => {
    const kept = editedSession();
    heldSlot(kept, 2).setEntered(q.operative_tmp, 60);
    const link = linkTextOf(onExplore());

    const { session, notices, declineNotices, waitingLink } = firstLoadAt(addressOf(kept), { link, kept: keptTextOf(kept) }, registeredModels);

    expect(kept.setAddress(addressOf(kept))).toBe(true);
    expect(openedOn(session)).toEqual(openedOn(kept));
    expect(notices).toEqual([]);
    expect(declineNotices).toEqual(["valuesCut"]);
    expect(waitingLink).toBe(link);
  });

  it("with a value out of range over a kept session is refused with nothing asked: the kept session, and the refusal's notice alone", () => {
    const kept = editedSession();
    const sender = onExplore();
    heldSlot(sender, 0).setEntered(q.operative_tmp, 60);

    const { session, notices, declineNotices, waitingLink } = firstLoadAt(addressOf(kept), { link: linkTextOf(sender), kept: keptTextOf(kept) }, registeredModels);

    expect(openedOn(session)).toEqual(openedOn(kept));
    expect(notices).toEqual(["linkRefused"]);
    expect(declineNotices).toEqual([]);
    expect(waitingLink).toBeNull();
  });

  it("whose text names one model at an address naming another is converted and seeded for the address's model, nothing asked, and no notice", () => {
    const sender = sessionComparingThreeSlots(pmvPpdAshrae);
    // Inside both PMV (ASHRAE 55)'s and PMV (ISO 7730)'s dry-bulb temperature bounds.
    heldSlot(sender, 1).setEntered(q.tdb, 29);
    const text = linkTextOf(sender);

    const { session, notices } = firstLoadAt(standardAddress(pmvPpdIso), { link: text, kept: undefined }, registeredModels);

    // A link copied on the Standard page carries no Band list and opens on the classifier's, the sender's unedited one.
    expect(sender.chart.bands).toEqual(startingChartSettings(pmvPpdAshrae).bands);
    const expected = new Session({ ...linkSessionOf(sender), charts: new Map([[pmvPpdAshrae, sender.chart.toChartSettings()]]) });
    expect(expected.setAddress(standardAddress(pmvPpdIso))).toBe(false);
    expect(openedOn(session)).toEqual(openedOn(expected));
    expect(session.model).toBe(pmvPpdIso);
    expect(session.pendingSwitch).toBeNull();
    expect(notices).toEqual([]);
  });

  it("whose text names one model at an address naming another, where the switch would cut, is refused: the address's model on its defaults, and the refusal's notice alone", () => {
    const sender = sessionComparingThreeSlots(pmvPpdAshrae);
    // Past PMV (ISO 7730)'s 30 °C dry-bulb temperature, inside PMV (ASHRAE 55)'s: a switch in the app would ask.
    heldSlot(sender, 1).setEntered(q.tdb, 35);

    const { session, notices } = firstLoadAt(standardAddress(pmvPpdIso), { link: linkTextOf(sender), kept: undefined }, registeredModels);

    expect(openedOn(session)).toEqual({ written: startingSession(pmvPpdIso), page: page.standard, pendingSwitch: null });
    expect(notices).toEqual(["linkRefused"]);
  });
});
