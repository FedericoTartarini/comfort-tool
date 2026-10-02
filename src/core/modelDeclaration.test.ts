/**
 * What a declaration says about itself: the name its model info gives it,
 * unique across the registry; the standard edition it picks, checked against
 * that model info for every registered model; the table columns it lists;
 * the charts it offers; and the axis range a chart reads off it. What its
 * `run` does is the sibling `modelDeclarationRun.test.ts`'s.
 */
import { describe, expect, it } from "vitest";
import { PMV_THERMAL_SENSATION_VOTE_BINS_ISO, Standard } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { chartType } from "./chartType";
import { clothingCorrectionFor } from "./clothingCorrection";
import {
  axisRangeFor,
  clothingCorrectionOf,
  dynamicChartOf,
  hasClothingGroup,
  psychrometricChartOf,
  requireAxisRange,
  takesRelativeAirSpeed,
  type DeclaredChart,
  type RegisteredModel,
  type ZonePolygon,
} from "./modelDeclaration";
import { quantities } from "./quantities";
import { defaultEntryModes, dynamicClothingOf, startingSlot, valueEntryGroups } from "./slot";

const q = quantities;

describe("name", () => {
  it("is unique across the registry, so a share link can name a model without naming its standard", () => {
    const names = registeredModels.map((model) => model.info.name);
    expect(new Set(names).size, names.join(", ")).toBe(names.length);
  });
});

describe("standard", () => {
  it("is one of the editions the model's library function accepts, for every registered model", () => {
    for (const model of registeredModels) {
      if (model.standard === undefined) continue;
      expect(model.info.standards, model.info.label).toContain(model.standard);
    }
  });

  it("pins ISO 7730:2025 for PMV (ISO 7730)", () => {
    expect(pmvPpdIso.standard).toBe(Standard.iso_7730_2025);
  });
});

describe("table", () => {
  it("names no output its model info classifies, for every registered model", () => {
    // A category is never shown in a cell (`formatResultCell`); the Compliance
    // column reads it, so a table column for it would be a dash on every run.
    for (const model of registeredModels) {
      const classified = model.table.filter((column) => model.info.outputs[column.key]?.classifier);
      expect(classified.map((column) => column.label), model.info.label).toEqual([]);
    }
  });
});

/** Every model has a dynamic chart (ADR §4.4); only the chart state's throw at session start would otherwise say so. */
function expectADynamicChart(model: RegisteredModel): void {
  expect(dynamicChartOf(model), model.info.label).toBeDefined();
}

/**
 * v1 has one chart per chart type (ADR-0002 decision 31's note): the chart
 * lookups return the first entry of a type, and the chart picker keys its
 * entries by type.
 */
function expectEachChartTypeOnce(model: RegisteredModel): void {
  const types = model.charts.map((chart) => chart.type);
  expect(new Set(types).size, model.info.label).toBe(types.length);
}

/**
 * The psychrometric chart declares nothing but its type, so what it paints on
 * Standard is the model's scan's Comfort zones: a model without them would
 * draw the chart with nothing on it (ADR-0002 decision 61).
 */
function expectZonesUnderAPsychrometricChart(model: RegisteredModel): void {
  if (!psychrometricChartOf(model)) return;
  expect(model.scan?.comfortZones, `${model.info.label} declares a psychrometric chart and no Comfort zones in its scan`).toBeDefined();
}

describe("charts", () => {
  it("include a dynamic chart, for every registered model", () => {
    for (const model of registeredModels) {
      expectADynamicChart(model);
    }
  });

  it("name each chart type once, for every registered model", () => {
    for (const model of registeredModels) {
      expectEachChartTypeOnce(model);
    }
  });

  it("include a psychrometric chart only where the model's scan has Comfort zones, for every registered model", () => {
    for (const model of registeredModels) {
      expectZonesUnderAPsychrometricChart(model);
    }
  });

  it("that include a psychrometric chart on a model whose scan has no Comfort zones fail the check", () => {
    const noZones: RegisteredModel = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture scanning without Comfort zones" },
      scan: { output: pmvPpdIso.scan.output, classifier: pmvPpdIso.scan.classifier },
    };
    expect(() => expectZonesUnderAPsychrometricChart(noZones)).toThrow(noZones.info.label);
  });

  it("that leave out the dynamic chart fail the check", () => {
    const psychrometric = psychrometricChartOf(pmvPpdIso);
    if (!psychrometric) throw new Error("PMV (ISO 7730) declares a psychrometric chart");
    const noDynamicChart: RegisteredModel = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture without a dynamic chart" },
      charts: [psychrometric],
    };
    expect(() => expectADynamicChart(noDynamicChart)).toThrow(noDynamicChart.info.label);
  });

  it("that name the dynamic chart twice fail the check", () => {
    const dynamic = dynamicChartOf(pmvPpdIso);
    if (!dynamic) throw new Error("PMV (ISO 7730) declares a dynamic chart");
    const twoDynamicCharts: RegisteredModel = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture with two dynamic charts" },
      charts: [...pmvPpdIso.charts, dynamic],
    };
    expect(() => expectEachChartTypeOnce(twoDynamicCharts)).toThrow(twoDynamicCharts.info.label);
  });
});

/** `vr` is derived as `v_relative(v, met)`, so a model that takes it must be entered both. */
function expectVAndMetUnderRelativeAirSpeed(model: RegisteredModel): void {
  if (!takesRelativeAirSpeed(model)) return;
  const entered = model.inputs.map((entry) => entry.quantity);
  expect(entered, model.info.label).toEqual(expect.arrayContaining([q.v, q.met]));
}

describe("takesRelativeAirSpeed", () => {
  it("answers whether the model info's inputs name vr", () => {
    expect(pmvPpdIso.info.inputs[q.vr.key]).toBeDefined();
    expect(takesRelativeAirSpeed(pmvPpdIso)).toBe(true);

    const inputs = Object.fromEntries(Object.entries(pmvPpdIso.info.inputs).filter(([key]) => key !== q.vr.key));
    expect(takesRelativeAirSpeed({ ...pmvPpdIso, info: { ...pmvPpdIso.info, inputs } })).toBe(false);
  });
});

describe("inputs", () => {
  it("enter v and met wherever the model takes vr, for every registered model", () => {
    for (const model of registeredModels) {
      expectVAndMetUnderRelativeAirSpeed(model);
    }
  });

  it("that leave out met where the model takes vr fail the check", () => {
    const noMet: RegisteredModel = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture taking vr without met" },
      inputs: pmvPpdIso.inputs.filter((entry) => entry.quantity !== q.met),
    };
    expect(() => expectVAndMetUnderRelativeAirSpeed(noMet)).toThrow(noMet.info.label);
  });
});

/** Whether the model's info names the clothing insulation and its standard has a clothing correction. */
function takesClothingUnderACorrectingStandard(model: RegisteredModel): boolean {
  return model.info.inputs[q.clo.key] !== undefined && clothingCorrectionFor(model.standard) !== undefined;
}

/**
 * The clothing is corrected at the slot's own values, so a model with the
 * clothing group must be entered what its standard's rule takes: the
 * metabolic rate, and the air speed where the rule reads one. Correcting the
 * model's own starting slot reads exactly those.
 */
function expectWhatTheClothingCorrectionTakes(model: RegisteredModel): void {
  if (!hasClothingGroup(model)) return;
  expect(model.inputs.map((entry) => entry.quantity), model.info.label).toContain(q.met);
  let corrected: number;
  try {
    corrected = dynamicClothingOf(startingSlot(model), model);
  } catch (error) {
    throw new Error(`${model.info.label}: ${String(error)}`);
  }
  expect(Number.isFinite(corrected), model.info.label).toBe(true);
}

describe("the clothing entry group", () => {
  it("is on every model that names the clothing insulation under a standard with a correction, and on no other, for every registered model", () => {
    for (const model of registeredModels) {
      expect(hasClothingGroup(model), model.info.label).toBe(takesClothingUnderACorrectingStandard(model));
    }
    expect(registeredModels.filter(hasClothingGroup)).toEqual(expect.arrayContaining([pmvPpdIso, pmvPpdAshrae]));
    expect(hasClothingGroup(adaptiveAshrae)).toBe(false);
  });

  it("is not on a model whose standard has no correction, which is given the clothing as entered", () => {
    expect(clothingCorrectionOf({ ...pmvPpdIso, standard: undefined })).toBeUndefined();
    expect(hasClothingGroup({ ...pmvPpdIso, standard: Standard.iso_7933_2023 })).toBe(false);
  });

  it("enters met, and v where its standard's correction takes it, for every registered model", () => {
    for (const model of registeredModels) {
      expectWhatTheClothingCorrectionTakes(model);
    }
  });

  it("that leaves out met fails the check", () => {
    const noMet: RegisteredModel = {
      ...pmvPpdAshrae,
      info: { ...pmvPpdAshrae.info, label: "Fixture correcting clothing without met" },
      inputs: pmvPpdAshrae.inputs.filter((entry) => entry.quantity !== q.met),
    };
    expect(() => expectWhatTheClothingCorrectionTakes(noMet)).toThrow(noMet.info.label);
  });

  it("that leaves out v under ISO 7730, whose correction takes the air speed, fails the check", () => {
    const noAirSpeed: RegisteredModel = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture correcting clothing by ISO 7730 without v" },
      inputs: pmvPpdIso.inputs.filter((entry) => entry.quantity !== q.v),
    };
    expect(() => expectWhatTheClothingCorrectionTakes(noAirSpeed)).toThrow(noAirSpeed.info.label);
  });

  it("that leaves out v under ASHRAE 55, whose correction takes none, passes the check", () => {
    const noAirSpeed: RegisteredModel = {
      ...pmvPpdAshrae,
      inputs: pmvPpdAshrae.inputs.filter((entry) => entry.quantity !== q.v),
    };
    expect(() => expectWhatTheClothingCorrectionTakes(noAirSpeed)).not.toThrow();
  });
});

describe("axisRangeFor", () => {
  it("returns the declared range when the model has one", () => {
    const declared = pmvPpdIso.axisRanges.find((range) => range.quantity === q.tdb);
    if (!declared) throw new Error("PMV (ISO 7730) declares a tdb range");
    // A declared range equal to the applicability bound could not tell the two sources apart.
    const bound = pmvPpdIso.info.inputs.tdb?.applicability;
    expect([declared.min, declared.max]).not.toEqual([bound?.min, bound?.max]);
    expect(axisRangeFor(pmvPpdIso, q.tdb)).toEqual({ min: declared.min, max: declared.max });
  });

  it("falls back to the applicability bound when none is declared, but both a min and a max exist", () => {
    const noDeclaredRange = { ...pmvPpdIso, axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.clo) };
    const bound = pmvPpdIso.info.inputs.clo?.applicability;
    expect(bound?.min).toBeDefined();
    expect(bound?.max).toBeDefined();
    expect(axisRangeFor(noDeclaredRange, q.clo)).toEqual({ min: bound?.min, max: bound?.max });
  });

  it("returns undefined when neither a declared range nor a complete applicability bound exists", () => {
    const noDeclaredRange = { ...pmvPpdIso, axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.rh) };
    expect(axisRangeFor(noDeclaredRange, q.rh)).toBeUndefined();
  });
});

/**
 * A model that declares how far an entry group's default-mode axis is drawn
 * declares it for every mode's axis of that group: an undeclared one would be
 * drawn to the applicability bound, a chart clipped at the entry-mode switch
 * (ADR-0002 decision 5). One direction only: a model may declare another
 * mode's and leave the default's to the fallback, as Adaptive (ASHRAE 55) does.
 */
function expectEveryModeAxisRangeBesideTheDefaultModes(model: RegisteredModel): void {
  const declared = model.axisRanges.map((range) => range.quantity);
  for (const group of valueEntryGroups) {
    if (!group.appliesTo(model) || !declared.includes(group.modeOf(defaultEntryModes).axis)) continue;
    expect(declared, model.info.label).toEqual(expect.arrayContaining(group.modes.map((mode) => mode.axis)));
  }
}

describe("axisRanges", () => {
  it("name every mode's axis of an entry group whose default-mode axis they name, for every registered model", () => {
    for (const model of registeredModels) {
      expectEveryModeAxisRangeBesideTheDefaultModes(model);
    }
  });

  it("that name the air speed and not the relative air speed fail the check", () => {
    const noRelativeAirSpeedRange: RegisteredModel = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture without a relative air speed range" },
      axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.vr),
    };
    expect(() => expectEveryModeAxisRangeBesideTheDefaultModes(noRelativeAirSpeedRange)).toThrow(noRelativeAirSpeedRange.info.label);
  });

  it("that name the clothing insulation and not the dynamic one fail the check", () => {
    const noDynamicClothingRange: RegisteredModel = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture without a dynamic clothing range" },
      axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.clo_dynamic),
    };
    expect(() => expectEveryModeAxisRangeBesideTheDefaultModes(noDynamicClothingRange)).toThrow(noDynamicClothingRange.info.label);
  });

  // No model info names the dynamic clothing insulation, so without a declared
  // range it could carry no axis at all (ADR-0002 decision 5).
  it("draw the dynamic clothing insulation as far as the clothing insulation, for both PMV models", () => {
    for (const model of [pmvPpdIso, pmvPpdAshrae]) {
      expect(axisRangeFor(model, q.clo_dynamic), model.info.label).toEqual(axisRangeFor(model, q.clo));
      expect(axisRangeFor({ ...model, axisRanges: [] }, q.clo_dynamic), model.info.label).toBeUndefined();
    }
  });

  it("that name only another mode's axis pass the check, as Adaptive (ASHRAE 55) names the operative temperature and not the dry-bulb one", () => {
    const declared = adaptiveAshrae.axisRanges.map((range) => range.quantity);
    expect(declared).toContain(q.operative_tmp);
    expect(declared).not.toContain(q.tdb);
    expect(() => expectEveryModeAxisRangeBesideTheDefaultModes(adaptiveAshrae)).not.toThrow();
  });

  it("draw PMV (ISO 7730)'s relative air speed as far as its air speed, from the declaration and not the applicability bound", () => {
    // A declared range equal to the applicability bound could not tell the two sources apart.
    const bound = pmvPpdIso.info.inputs.vr?.applicability;
    expect(bound?.min).toBeDefined();
    expect(bound?.max).toBeDefined();
    expect(axisRangeFor(pmvPpdIso, q.vr)).not.toEqual({ min: bound?.min, max: bound?.max });
    expect(axisRangeFor(pmvPpdIso, q.vr)).toEqual(axisRangeFor(pmvPpdIso, q.v));
  });
});

describe("requireAxisRange", () => {
  it("returns the same range as axisRangeFor when one exists", () => {
    expect(requireAxisRange(pmvPpdIso, q.tdb)).toEqual(axisRangeFor(pmvPpdIso, q.tdb));
  });

  it("throws naming the model and the quantity when no range can be found", () => {
    const noDeclaredRange = { ...pmvPpdIso, axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.rh) };
    expect(() => requireAxisRange(noDeclaredRange, q.rh)).toThrow(
      `${pmvPpdIso.info.label} declares no axis range for ${q.rh.label}, so it cannot carry an axis`,
    );
  });
});

/**
 * Type-level proof of the declaration's shapes (ADR-0002 decisions 37 and 61),
 * compiled by `npm run check` and never called: each `@ts-expect-error` fails
 * the build the day the compiler stops refusing that literal. What the model
 * scans is its own, so no chart names an output or a classifier, the
 * psychrometric chart names nothing but its type, and a scanned dynamic chart
 * needs a model with a scan. Exported only because `noUnusedLocals` would
 * otherwise flag it.
 */
export function chartShapesTypeProof(polygons: readonly ZonePolygon[]): DeclaredChart[] {
  const axes = { x: q.v, y: q.operative_tmp };
  const classifier = PMV_THERMAL_SENSATION_VOTE_BINS_ISO;
  const zone = { label: "Zone", limit: 0.5, inclusive: false };
  return [
    { type: chartType.psychrometric },
    { type: chartType.dynamic, axes },
    { type: chartType.dynamic, axes, comfortZones: () => polygons },
    // @ts-expect-error an output on a chart, which is the model's scan's
    { type: chartType.dynamic, axes, output: q.pmv },
    // @ts-expect-error a classifier on a chart, which is the model's scan's
    { type: chartType.dynamic, axes, classifier },
    // @ts-expect-error a psychrometric chart with axes, which its temperature entry mode fixes
    { type: chartType.psychrometric, axes },
    // @ts-expect-error a psychrometric chart with Comfort zones, which are the model's scan's
    { type: chartType.psychrometric, comfortZones: [zone] },
    // @ts-expect-error a polygons chart with an output it does not scan
    { type: chartType.dynamic, axes, comfortZones: () => polygons, output: q.pmv },
  ];
}

/** The same, for which charts a model may declare with and without a scan. */
export function scanShapesTypeProof(polygons: readonly ZonePolygon[]): RegisteredModel[] {
  const { charts: _charts, ...unscanned } = adaptiveAshrae;
  const scan = { output: q.pmv, classifier: PMV_THERMAL_SENSATION_VOTE_BINS_ISO };
  const axes = { x: q.v, y: q.operative_tmp };
  return [
    { ...unscanned, scan, charts: [{ type: chartType.dynamic, axes }] },
    { ...unscanned, scan, charts: [{ type: chartType.psychrometric }, { type: chartType.dynamic, axes }] },
    { ...unscanned, charts: [{ type: chartType.dynamic, axes, comfortZones: () => polygons }] },
    // @ts-expect-error a scanned dynamic chart on a model that declares no scan
    { ...unscanned, charts: [{ type: chartType.dynamic, axes }] },
    // @ts-expect-error a psychrometric chart on a model that declares no scan
    { ...unscanned, charts: [{ type: chartType.psychrometric }, { type: chartType.dynamic, axes, comfortZones: () => polygons }] },
  ];
}
