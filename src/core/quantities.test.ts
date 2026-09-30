import { describe, expect, it } from "vitest";
import * as jsthermalcomfort from "jsthermalcomfort";
import { ADAPTIVE_ASHRAE_INFO, HEAT_INDEX_ROTHFUSZ_INFO, PMV_PPD_ASHRAE_INFO } from "jsthermalcomfort";
import type { ModelInfo } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { DEFAULT_ATMOSPHERIC_PRESSURE, kindBounds, quantities } from "./quantities";
import { displayUnitFor } from "./units";
import { unitSystem } from "./unitSystem";

/**
 * Quantities no `_INFO` key names. An entry mode or a derivation names the
 * temperature and humidity representations the app converts to the library's
 * own inputs before calling it (ADR-0002 decisions 2 and 15); `p_atm` is the
 * session's atmospheric pressure, named by the library's functions that take
 * it and by no model info (ADR-0002 decision 49); `clo_dynamic` is the
 * clothing insulation entered already corrected, where a model info names
 * `clo` alone (ADR-0002 decision 54).
 */
const appOwnedQuantities = new Set(["operative_tmp", "hr", "dew_point_tmp", "wet_bulb_tmp", "p_atm", "clo_dynamic"]);

function variableKeys(info: ModelInfo): string[] {
  return [...Object.keys(info.inputs), ...Object.keys(info.outputs), ...Object.keys(info.derived ?? {})];
}

const tableKeys = Object.keys(quantities);

describe("quantities table drift", () => {
  it("direction 1: has a row for every input, output and derived key a registered model's info names", () => {
    for (const model of registeredModels) {
      for (const key of variableKeys(model.info)) {
        expect(tableKeys).toContain(key);
      }
    }
  });

  it("direction 2: every table key names a package `_INFO` variable or an app-owned quantity", () => {
    const infoExports = Object.entries(jsthermalcomfort).filter(([name]) => name.endsWith("_INFO"));
    const infoNamedKeys = new Set(infoExports.flatMap(([, info]) => variableKeys(info as ModelInfo)));
    for (const key of tableKeys) {
      expect(infoNamedKeys.has(key) || appOwnedQuantities.has(key)).toBe(true);
    }
    // The check above cannot fail on an exemption a model info has since named.
    for (const key of appOwnedQuantities) {
      expect(infoNamedKeys.has(key), key).toBe(false);
    }
  });

  it("hi and stress_category are named by HEAT_INDEX_ROTHFUSZ_INFO", () => {
    expect(variableKeys(HEAT_INDEX_ROTHFUSZ_INFO)).toEqual(expect.arrayContaining(["hi", "stress_category"]));
  });

  it("Adaptive's eight keys are named by ADAPTIVE_ASHRAE_INFO", () => {
    const adaptiveKeys = [
      "t_running_mean",
      "tmp_cmf",
      "tmp_cmf_80_low",
      "tmp_cmf_80_up",
      "tmp_cmf_90_low",
      "tmp_cmf_90_up",
      "acceptability_80",
      "acceptability_90",
    ];
    expect(tableKeys).toEqual(expect.arrayContaining(adaptiveKeys));
    expect(variableKeys(ADAPTIVE_ASHRAE_INFO)).toEqual(expect.arrayContaining(adaptiveKeys));
  });

  it("compliance is named by PMV_PPD_ASHRAE_INFO", () => {
    expect(tableKeys).toContain("compliance");
    expect(variableKeys(PMV_PPD_ASHRAE_INFO)).toContain("compliance");
  });
});

describe("quantity labels", () => {
  it("labels stress_category 'Thermal stress category', which reads for UTCI's cold-to-heat range too", () => {
    expect(quantities.stress_category.label).toBe("Thermal stress category");
  });
});

describe("dynamic clothing insulation", () => {
  it("is clo_dynamic, of the clothing insulation's kind and units, named apart from it", () => {
    const dynamic = quantities.clo_dynamic;
    expect(dynamic.key).toBe("clo_dynamic");
    expect(dynamic.kind).toBe(quantities.clo.kind);
    expect(dynamic.label).toBe("Dynamic clothing insulation");
    for (const system of Object.values(unitSystem)) {
      expect(displayUnitFor(dynamic, system)).toBe(displayUnitFor(quantities.clo, system));
    }
  });
});

describe("atmospheric pressure", () => {
  it("is p_atm, of its own kind, in Pa and inHg, stepped by 100 Pa and 0.01 inHg, bounded 30 000 to 110 000 Pa", () => {
    const pressure = quantities.p_atm;
    expect(pressure.key).toBe("p_atm");
    expect(pressure.kind).toBe("atmosphericPressure");
    const pascals = displayUnitFor(pressure, unitSystem.si);
    const inchesOfMercury = displayUnitFor(pressure, unitSystem.ip);
    expect([pascals.symbol, pascals.step]).toEqual(["Pa", 100]);
    expect([inchesOfMercury.symbol, inchesOfMercury.step]).toEqual(["inHg", 0.01]);
    expect(kindBounds[pressure.kind]).toEqual({ min: 30000, max: 110000 });
  });

  it("defaults to 101 325 Pa", () => {
    expect(DEFAULT_ATMOSPHERIC_PRESSURE).toBe(101325);
  });

  it("leaves the pressure kind to vapour pressure, in kPa", () => {
    expect(quantities.pa.kind).toBe("pressure");
    expect(displayUnitFor(quantities.pa, unitSystem.si).symbol).toBe("kPa");
  });
});
