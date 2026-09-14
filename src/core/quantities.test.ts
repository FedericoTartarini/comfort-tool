import { describe, expect, it } from "vitest";
import * as mainRepo from "jsthermalcomfort-main";
import { HEAT_INDEX_ROTHFUSZ_INFO, PMV_PPD_ISO_INFO } from "jsthermalcomfort-main";
import type { ModelInfo } from "jsthermalcomfort-main";
import { quantities } from "./quantities";

/**
 * Quantities an entry mode or a derivation names without a matching `_INFO`
 * key — the temperature and humidity representations the app converts to the
 * library's own inputs before calling it (ADR-0002 decision 2, C1 direction 2).
 */
const appOwnedQuantities = new Set(["v", "operative_tmp", "hr", "dew_point_tmp", "wet_bulb_tmp"]);

function variableKeys(info: ModelInfo): string[] {
  return [...Object.keys(info.inputs), ...Object.keys(info.outputs), ...Object.keys(info.derived ?? {})];
}

const tableKeys = Object.keys(quantities);

describe("quantities table drift", () => {
  // Ticket 05 gives every registered model an `info` field the registry can be
  // walked for; until then this direction reads the one `_INFO` beside the
  // declaration directly (PMV_PPD_ISO_INFO is the only registered model so far).
  it("direction 1: has a row for every input, output and derived key a registered model's info names", () => {
    for (const key of variableKeys(PMV_PPD_ISO_INFO)) {
      expect(tableKeys).toContain(key);
    }
  });

  it("direction 2: every table key names a package `_INFO` variable or an app entry mode/derivation", () => {
    const infoExports = Object.entries(mainRepo).filter(([name]) => name.endsWith("_INFO"));
    const infoNamedKeys = new Set(infoExports.flatMap(([, info]) => variableKeys(info as ModelInfo)));
    for (const key of tableKeys) {
      expect(infoNamedKeys.has(key) || appOwnedQuantities.has(key)).toBe(true);
    }
  });

  it("hi and stress_category, unregistered so far, are named by HEAT_INDEX_ROTHFUSZ_INFO", () => {
    expect(variableKeys(HEAT_INDEX_ROTHFUSZ_INFO)).toEqual(expect.arrayContaining(["hi", "stress_category"]));
  });
});
