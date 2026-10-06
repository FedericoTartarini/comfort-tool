/**
 * The first address's load (ADR-0002 decision 63, rules 3 and 4) at the state
 * seam: a kept text or none and an address in, the session the page opens on
 * out, with no browser, no router and no component. The expected session is
 * the app's own: a model's starting session, or the live session the text was
 * written from, moved to the address as the back button moves it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { chartType } from "$lib/core/chartType";
import { airSpeedMode, clothingMode, humidityMode, temperatureMode } from "$lib/core/entryModes";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { page, type Address } from "$lib/core/page";
import { quantities } from "$lib/core/quantities";
import { toDecodedSession, toText } from "$lib/core/shareLink";
import type { Slot } from "$lib/core/slot";
import { unitSystem } from "$lib/core/unitSystem";
import { startingSession } from "$lib/core/writtenSession";
import { registeredModels } from "$lib/models";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { firstLoadAt } from "./firstLoad";
import { clearKeptText, readKeptText, writeKeptText } from "./keptText";
import type { Session } from "./session.svelte";
import { expectEverySlotInSessionEntryModes, heldSlot, sessionComparingThreeSlots } from "./sessionTestReaders";

const q = quantities;
/** A pressure below the bound's 30 000 Pa (ADR-0002 decision 49). */
const PRESSURE_OUT_OF_RANGE = 20000;
const [airSpeedControl] = pmvPpdAshrae.options;

/** What the page would open on: the session written out, the page it is on, and the question it holds. */
function openedOn(session: Session) {
  return { written: session.toWrittenSession(), page: session.page, pendingSwitch: session.pendingSwitch };
}

/** `session` as the tab would keep it. */
function keptTextOf(session: Session): string {
  return toText(session.toWrittenSession(), registeredModels);
}

/**
 * A session on PMV (ASHRAE 55) comparing three slots of their own values with
 * slot 3 disabled, every entry group off its default mode, an option ticked,
 * a value and the pressure out of range, IP, and edited chart settings on PMV
 * (ISO 7730), which it left, and on PMV (ASHRAE 55).
 */
function editedSession(): Session {
  const session = sessionComparingThreeSlots(pmvPpdIso);
  session.chart.type = chartType.dynamic;
  session.chart.setAxes({ x: q.met });
  session.chart.moveBandEdge(3, 0.4);
  session.setModel(pmvPpdAshrae);
  session.chart.setBandLabel(0, "Freezing");
  session.setTemperatureMode(temperatureMode.operative);
  session.setAirSpeedMode(airSpeedMode.corrected);
  session.setClothingMode(clothingMode.corrected);
  session.setHumidityMode(humidityMode.dewPoint);
  heldSlot(session, 1).setEntered(q.operative_tmp, 27);
  heldSlot(session, 1).setOption(airSpeedControl, true);
  // Past PMV (ASHRAE 55)'s 30 °C operative temperature: the gate closes on slot 3.
  heldSlot(session, 2).setEntered(q.operative_tmp, 60);
  session.setSlotEnabled(2, false);
  session.unitSystem = unitSystem.ip;
  session.atmosphericPressure = PRESSURE_OUT_OF_RANGE;
  return session;
}

function standardAddress(model: RegisteredModel): Address {
  return { page: page.standard, model };
}

/** The address `session` is on. */
function addressOf(session: Session): Address {
  return { page: session.page, model: session.model };
}

afterEach(() => {
  sessionStorage.clear();
});

describe("the first address's load", () => {
  it("with nothing kept is the address's model on its defaults, on the address's page, for every registered model", () => {
    for (const model of registeredModels) {
      for (const onPage of [page.standard, page.explore]) {
        const { session } = firstLoadAt({ page: onPage, model }, { kept: undefined }, registeredModels);

        expect(openedOn(session), `${model.info.label} on ${onPage.title}`).toEqual({
          written: startingSession(model),
          page: onPage,
          pendingSwitch: null,
        });
      }
    }
  });

  it("with a kept text is that session: its slots, flags, entry modes, and every model's chart settings", () => {
    const kept = editedSession();

    const { session } = firstLoadAt(standardAddress(pmvPpdAshrae), { kept: keptTextOf(kept) }, registeredModels);

    expect(openedOn(session)).toEqual(openedOn(kept));
    expectEverySlotInSessionEntryModes(session);
  });

  it("with a kept text on Explore opens on Explore, the session unchanged", () => {
    const kept = editedSession();

    const { session } = firstLoadAt({ page: page.explore, model: pmvPpdAshrae }, { kept: keptTextOf(kept) }, registeredModels);

    expect(openedOn(session)).toEqual({ ...openedOn(kept), page: page.explore });
  });

  it("with a kept text it refuses is the address's model on its defaults, and raises nothing", () => {
    for (const text of ["", "not a text", "v1.not-base64-json", "v2.e30"]) {
      expect(toDecodedSession(text, registeredModels), text).toBeUndefined();

      const { session } = firstLoadAt(standardAddress(pmvPpdIso), { kept: text }, registeredModels);

      expect(openedOn(session), text).toEqual({ written: startingSession(pmvPpdIso), page: page.standard, pendingSwitch: null });
    }
  });

  it("with a kept text that lacks a value and an option is that session with both at their defaults (rule 6 as amended)", () => {
    const kept = editedSession();
    const written = kept.toWrittenSession();
    const [first, ...others] = written.slots;
    const lacking: Slot = {
      ...first,
      values: new Map([...first.values].filter(([quantity]) => quantity !== q.met)),
      options: new Map([...first.options].filter(([option]) => option !== airSpeedControl)),
    };
    const text = toText({ ...written, slots: [lacking, ...others] }, registeredModels);
    expect(toDecodedSession(text, registeredModels)?.exact).toBe(false);

    const { session } = firstLoadAt(standardAddress(pmvPpdAshrae), { kept: text }, registeredModels);

    // Slot 1's metabolic rate and option were never edited, so the session filled is the one kept.
    const [starting] = startingSession(pmvPpdAshrae).slots;
    expect(heldSlot(session, 0).values.get(q.met)).toBe(starting.values.get(q.met));
    expect(heldSlot(session, 0).options.get(airSpeedControl)).toBe(starting.options.get(airSpeedControl));
    expect(openedOn(session)).toEqual(openedOn(kept));
  });

  it("with a kept text written under another model follows the address as the back button does: converted and seeded, nothing adjusted, nothing asked", () => {
    const kept = sessionComparingThreeSlots(pmvPpdAshrae);
    // Past PMV (ISO 7730)'s 30 °C dry-bulb temperature, inside PMV (ASHRAE 55)'s: a switch in the app would ask.
    heldSlot(kept, 1).setEntered(q.tdb, 35);
    const text = keptTextOf(kept);
    kept.requestModel(pmvPpdIso);
    expect(kept.pendingSwitch).not.toBeNull();

    const { session } = firstLoadAt(standardAddress(pmvPpdIso), { kept: text }, registeredModels);

    kept.setAddress(standardAddress(pmvPpdIso));
    expect(openedOn(session)).toEqual(openedOn(kept));
    expect(session.pendingSwitch).toBeNull();
    expect(heldSlot(session, 1).values.get(q.tdb)).toBe(35);
  });

  it("with a kept text written under a model without an entry group follows the address to one with it, seeded", () => {
    const kept = editedSession();
    kept.setAddress(standardAddress(adaptiveAshrae));
    const text = keptTextOf(kept);

    const { session } = firstLoadAt({ page: page.explore, model: pmvPpdIso }, { kept: text }, registeredModels);

    kept.setAddress({ page: page.explore, model: pmvPpdIso });
    expect(openedOn(session)).toEqual(openedOn(kept));
    expectEverySlotInSessionEntryModes(session);
  });
});

describe("the first address's load run again (Reset, ADR-0002 decision 63, rule 8)", () => {
  it("with the kept text cleared is the address's model on its defaults, whatever the session before held", () => {
    const onExplore = editedSession();
    onExplore.setAddress({ page: page.explore, model: heatIndexRothfusz });

    for (const before of [editedSession(), onExplore]) {
      writeKeptText(keptTextOf(before));
      const address = addressOf(before);

      clearKeptText();
      const { session } = firstLoadAt(address, { kept: readKeptText() }, registeredModels);

      expect(openedOn(session), `${address.model.info.label} on ${address.page.title}`).toEqual({
        written: startingSession(address.model),
        page: address.page,
        pendingSwitch: null,
      });
    }
  });
});
