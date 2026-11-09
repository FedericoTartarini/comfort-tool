/**
 * What a declaration says about itself: the name its model info gives it,
 * unique across the registry; the standard that model info lists first, for
 * every registered model; the table columns it lists;
 * the charts it offers; the input calculators its rows offer; the axis
 * range a chart reads off it. What its `run` does is the sibling
 * `modelDeclarationRun.test.ts`'s.
 */
import { describe, expect, it } from "vitest";
import { Standard } from "jsthermalcomfort";
import type { Bound } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { clothingFromOutdoorTemperature, customEnsemble, solarGainOnOccupants, type Calculator } from "./calculators";
import { chartType } from "./chartType";
import { clothingCorrectionFor } from "./clothingCorrection";
import { categoryZones } from "./comfortZones";
import {
  adaptiveChartOf,
  axisRangeFor,
  classifierOf,
  clothingCorrectionOf,
  declaredQuantitiesOf,
  dynamicChartOf,
  hasAirSpeedGroup,
  hasClothingGroup,
  optionsOf,
  psychrometricChartOf,
  requireAxisRange,
  standardOf,
  type DeclaredChart,
  type ModelDeclaration,
  type ZoneLimits,
} from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";
import { defaultEntryModes, dynamicClothingInsulationOf, defaultSlot, valueEntryGroups } from "./slot";
import { defaultChartSettings } from "./writtenSession";

const q = quantities;

describe("name", () => {
  it("is unique across the registry, so a share link can name a model without naming its standard", () => {
    const names = registeredModels.map((model) => model.info.name);
    expect(new Set(names).size, names.join(", ")).toBe(names.length);
  });
});

describe("standard", () => {
  it("is the first its model info lists, the library's default, or none when it lists none, for every registered model", () => {
    for (const model of registeredModels) {
      const [first] = model.info.standards;
      expect(standardOf(model), model.info.label).toBe(first);
    }
    expect(standardOf(heatIndexRothfusz)).toBeUndefined();
  });

  it("is ISO 7730:2025 for PMV (ISO 7730), whose comfort zones are its info's category classifier's, that edition's bins", () => {
    expect(standardOf(pmvPpdIso)).toBe(Standard.iso_7730_2025);
    const classifier = classifierOf(pmvPpdIso.info, q.category);
    // ISO 7730:2025's categories (ADR-0002 decision 80 rule 1): I to IV at
    // |PMV| 0.2, 0.5, 0.7 and 1.0, strict at both ends, "none" beyond.
    expect(classifier.labels).toEqual(["I", "II", "III", "IV", "none"]);
    expect(classifier.edges.slice(0, 4)).toEqual([0.2, 0.5, 0.7, 1]);
    expect(classifier.right).toBe(false);
    expect(pmvPpdIso.scan.comfortZones).toEqual(categoryZones(classifier));
  });
});

describe("scan", () => {
  it("that names an output its model info does not classify throws when the model is loaded, naming the model and the output", () => {
    const unclassified: ModelDeclaration = { ...pmvPpdIso, scan: { ...pmvPpdIso.scan, bands: q.pmv } };
    expect(() => defaultChartSettings(unclassified)).toThrow(
      `${pmvPpdIso.info.label} gives its output ${q.pmv.label} no classifier`,
    );
  });
});

describe("table", () => {
  it("names every output its model info classifies, those columns first, for every registered model", () => {
    // A classified output is a column of its own, first in the table
    // (ADR-0002 decision 85, rule 1): one left out would be lost from the page.
    for (const model of registeredModels) {
      const classifiedKeys = Object.entries(model.info.outputs).flatMap(([key, field]) => (field.classifier ? [key] : []));
      const leading = model.table.slice(0, classifiedKeys.length).map((column) => column.key);
      expect(leading, model.info.label).toEqual(classifiedKeys);
    }
  });
});

/**
 * v1 has one chart per chart type (ADR-0002 decision 31's note): the chart
 * lookups return the first entry of a type, and the chart picker keys its
 * entries by type.
 */
function expectEachChartTypeOnce(model: ModelDeclaration): void {
  const types = model.charts.map((chart) => chart.type);
  expect(new Set(types).size, model.info.label).toBe(types.length);
}

/**
 * The psychrometric chart declares nothing but its type, so what it paints on
 * Standard is the model's scan's Comfort zones: a model without them would
 * draw the chart with nothing on it (ADR-0002 decision 61).
 */
function expectZonesUnderAPsychrometricChart(model: ModelDeclaration): void {
  if (!psychrometricChartOf(model)) return;
  expect(model.scan?.comfortZones, `${model.info.label} declares a psychrometric chart and no Comfort zones in its scan`).toBeDefined();
}

describe("charts", () => {
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
    const noZones: ModelDeclaration = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture scanning without Comfort zones" },
      scan: { output: pmvPpdIso.scan.output, bands: pmvPpdIso.scan.bands },
    };
    expect(() => expectZonesUnderAPsychrometricChart(noZones)).toThrow(noZones.info.label);
  });

  it("that name the dynamic chart twice fail the check", () => {
    const dynamic = dynamicChartOf(pmvPpdIso);
    if (!dynamic) throw new Error("PMV (ISO 7730) declares a dynamic chart");
    const twoDynamicCharts: ModelDeclaration = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture with two dynamic charts" },
      charts: [...pmvPpdIso.charts, dynamic],
    };
    expect(() => expectEachChartTypeOnce(twoDynamicCharts)).toThrow(twoDynamicCharts.info.label);
  });

  it("are the adaptive chart alone for Adaptive, which scans nothing", () => {
    expect(adaptiveAshrae.charts.map((chart) => chart.type)).toEqual([chartType.adaptive]);
    expect(adaptiveChartOf(adaptiveAshrae)).toBe(adaptiveAshrae.charts[0]);
    expect(dynamicChartOf(adaptiveAshrae)).toBeUndefined();
  });
});

/** `vr` is derived as `v_relative(v, met)`, so a model that takes it must be entered both. */
function expectAirSpeedAndMetabolicRateUnderRelativeAirSpeed(model: ModelDeclaration): void {
  if (!hasAirSpeedGroup(model)) return;
  const entered = declaredQuantitiesOf(model).map((entry) => entry.quantity);
  expect(entered, model.info.label).toEqual(expect.arrayContaining([q.v, q.met]));
}

describe("hasAirSpeedGroup", () => {
  it("answers whether the model info's inputs name vr", () => {
    expect(pmvPpdIso.info.inputs[q.vr.key]).toBeDefined();
    expect(hasAirSpeedGroup(pmvPpdIso)).toBe(true);

    const inputs = Object.fromEntries(Object.entries(pmvPpdIso.info.inputs).filter(([key]) => key !== q.vr.key));
    expect(hasAirSpeedGroup({ ...pmvPpdIso, info: { ...pmvPpdIso.info, inputs } })).toBe(false);
  });
});

describe("declaredQuantitiesOf and optionsOf", () => {
  it("read PMV (ASHRAE 55)'s quantities with their defaults and its one option off its panel list", () => {
    expect(declaredQuantitiesOf(pmvPpdAshrae).map((entry) => entry.quantity)).toEqual([q.tdb, q.tr, q.v, q.rh, q.met, q.clo]);
    expect(optionsOf(pmvPpdAshrae).map((option) => option.key)).toEqual(["airspeed_control"]);
  });

  it("answer no option for every other registered model", () => {
    for (const model of registeredModels.filter((registered) => registered !== pmvPpdAshrae)) {
      expect(optionsOf(model), model.info.label).toEqual([]);
    }
  });

  it("between them read every element of the list once, for every registered model", () => {
    for (const model of registeredModels) {
      const read = [...declaredQuantitiesOf(model), ...optionsOf(model).map((option) => ({ option }))];
      expect(read, model.info.label).toHaveLength(model.inputs.length);
      expect(model.inputs, model.info.label).toEqual(expect.arrayContaining(read));
    }
  });
});

describe("calculators", () => {
  /** Each row of `model` that offers a calculator, as its quantity and what it offers. */
  const offeredBy = (model: ModelDeclaration) =>
    declaredQuantitiesOf(model).flatMap((entry) => (entry.calculators ? [[entry.quantity, entry.calculators]] : []));

  it("stand on the rows decision 75 names, and on no other, for every registered model", () => {
    const table = new Map<ModelDeclaration, unknown[]>([
      [
        pmvPpdAshrae,
        [
          [q.tr, [solarGainOnOccupants]],
          [q.clo, [customEnsemble, clothingFromOutdoorTemperature]],
        ],
      ],
      [pmvPpdIso, [[q.clo, [customEnsemble]]]],
      [adaptiveAshrae, []],
      [heatIndexRothfusz, []],
    ]);
    // A model registered later is added to the table above.
    expect(registeredModels.filter((model) => !table.has(model)).map((model) => model.info.label)).toEqual([]);
    for (const [model, offered] of table) {
      expect(offeredBy(model), model.info.label).toEqual(offered);
    }
  });

  it("that write a clothing insulation stand only on clo rows, and Solar gain only on tr rows, for every registered model", () => {
    const rowOf = new Map<Calculator, Quantity>([
      [customEnsemble, q.clo],
      [clothingFromOutdoorTemperature, q.clo],
      [solarGainOnOccupants, q.tr],
    ]);
    for (const model of registeredModels) {
      for (const entry of declaredQuantitiesOf(model)) {
        for (const calculator of entry.calculators ?? []) {
          expect(entry.quantity, `${model.info.label}: ${calculator.label}`).toBe(rowOf.get(calculator));
        }
      }
    }
  });
});

describe("inputs", () => {
  it("enter v and met wherever the model takes vr, for every registered model", () => {
    for (const model of registeredModels) {
      expectAirSpeedAndMetabolicRateUnderRelativeAirSpeed(model);
    }
  });

  it("that leave out met where the model takes vr fail the check", () => {
    const withoutMetabolicRate: ModelDeclaration = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture taking vr without met" },
      inputs: pmvPpdIso.inputs.filter((entry) => entry.quantity !== q.met),
    };
    expect(() => expectAirSpeedAndMetabolicRateUnderRelativeAirSpeed(withoutMetabolicRate)).toThrow(withoutMetabolicRate.info.label);
  });
});

/** Whether the model's info names the clothing insulation and its standard has a clothing correction. */
function takesClothingUnderACorrectingStandard(model: ModelDeclaration): boolean {
  return model.info.inputs[q.clo.key] !== undefined && clothingCorrectionFor(standardOf(model)) !== undefined;
}

/**
 * The clothing is corrected at the slot's own values, so a model with the
 * clothing group must be entered what its standard's rule takes: the
 * metabolic rate, and the air speed where the rule reads one. Correcting the
 * model's own default slot reads exactly those.
 */
function expectWhatTheClothingCorrectionTakes(model: ModelDeclaration): void {
  if (!hasClothingGroup(model)) return;
  expect(declaredQuantitiesOf(model).map((entry) => entry.quantity), model.info.label).toContain(q.met);
  let corrected: number;
  try {
    corrected = dynamicClothingInsulationOf(defaultSlot(model), model);
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
    expect(clothingCorrectionOf({ ...pmvPpdIso, info: { ...pmvPpdIso.info, standards: [] } })).toBeUndefined();
    expect(hasClothingGroup({ ...pmvPpdIso, info: { ...pmvPpdIso.info, standards: [Standard.iso_7933_2023] } })).toBe(false);
  });

  it("enters met, and v where its standard's correction takes it, for every registered model", () => {
    for (const model of registeredModels) {
      expectWhatTheClothingCorrectionTakes(model);
    }
  });

  it("that leaves out met fails the check", () => {
    const withoutMetabolicRate: ModelDeclaration = {
      ...pmvPpdAshrae,
      info: { ...pmvPpdAshrae.info, label: "Fixture correcting clothing without met" },
      inputs: pmvPpdAshrae.inputs.filter((entry) => entry.quantity !== q.met),
    };
    expect(() => expectWhatTheClothingCorrectionTakes(withoutMetabolicRate)).toThrow(withoutMetabolicRate.info.label);
  });

  it("that leaves out v under ISO 7730, whose correction takes the air speed, fails the check", () => {
    const noAirSpeed: ModelDeclaration = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture correcting clothing by ISO 7730 without v" },
      inputs: pmvPpdIso.inputs.filter((entry) => entry.quantity !== q.v),
    };
    expect(() => expectWhatTheClothingCorrectionTakes(noAirSpeed)).toThrow(noAirSpeed.info.label);
  });

  it("that leaves out v under ASHRAE 55, whose correction takes none, passes the check", () => {
    const noAirSpeed: ModelDeclaration = {
      ...pmvPpdAshrae,
      inputs: pmvPpdAshrae.inputs.filter((entry) => entry.quantity !== q.v),
    };
    expect(() => expectWhatTheClothingCorrectionTakes(noAirSpeed)).not.toThrow();
  });
});

describe("axisRangeFor", () => {
  it("returns the declared range when the model has one", () => {
    const declared = heatIndexRothfusz.axisRanges.find((range) => range.quantity === q.tdb);
    if (!declared) throw new Error("Heat Index declares a tdb range");
    // A declared range equal to the applicability bound could not tell the two sources apart.
    const bound: Bound = heatIndexRothfusz.info.inputs.tdb.applicability;
    expect([declared.min, declared.max]).not.toEqual([bound.min, bound.max]);
    expect(axisRangeFor(heatIndexRothfusz, q.tdb)).toEqual({ min: declared.min, max: declared.max });
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
function expectEveryModeAxisRangeBesideTheDefaultModes(model: ModelDeclaration): void {
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
    const noRelativeAirSpeedRange: ModelDeclaration = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture without a relative air speed range" },
      axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.vr),
    };
    expect(() => expectEveryModeAxisRangeBesideTheDefaultModes(noRelativeAirSpeedRange)).toThrow(noRelativeAirSpeedRange.info.label);
  });

  it("that name the clothing insulation and not the dynamic one fail the check", () => {
    const noDynamicClothingInsulationRange: ModelDeclaration = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture without a dynamic clothing range" },
      axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.clo_dynamic),
    };
    expect(() => expectEveryModeAxisRangeBesideTheDefaultModes(noDynamicClothingInsulationRange)).toThrow(noDynamicClothingInsulationRange.info.label);
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

  it("end PMV (ISO 7730)'s dry-bulb and operative temperatures at its 30 °C entry bound, its mean radiant temperature at 40 °C", () => {
    expect(axisRangeFor(pmvPpdIso, q.tdb)).toEqual({ min: 10, max: 30 });
    expect(axisRangeFor(pmvPpdIso, q.operative_tmp)).toEqual({ min: 10, max: 30 });
    expect(axisRangeFor(pmvPpdIso, q.tr)).toEqual({ min: 10, max: 40 });
  });

  it("leave PMV (ASHRAE 55)'s temperatures at 10 to 40 °C", () => {
    for (const quantity of [q.tdb, q.operative_tmp, q.tr]) {
      expect(axisRangeFor(pmvPpdAshrae, quantity), quantity.label).toEqual({ min: 10, max: 40 });
    }
  });

  it("draw PMV (ISO 7730)'s relative air speed as far as its air speed", () => {
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
 * Type-level proof of the declaration's shapes (ADR-0002 decisions 37, 61 and
 * 62), compiled by `npm run check` and never called: each `@ts-expect-error`
 * fails the build the day the compiler stops refusing that literal. What the
 * model scans is its own, so no chart names an output or its Bands; the
 * psychrometric chart names nothing but its type, the dynamic chart its axes,
 * and the adaptive chart its axes and its limits source; and only the adaptive
 * chart may be declared by a model without a scan. Exported only because
 * `noUnusedLocals` would otherwise flag it.
 */
export function chartShapesTypeProof(limits: readonly ZoneLimits[]): DeclaredChart[] {
  const axes = { x: q.v, y: q.operative_tmp };
  const zone = { label: "Zone", limit: 0.5, inclusive: false };
  return [
    { type: chartType.psychrometric },
    { type: chartType.dynamic, axes },
    { type: chartType.adaptive, axes, limits: () => limits },
    // @ts-expect-error an output on a chart, which is the model's scan's
    { type: chartType.dynamic, axes, output: q.pmv },
    // @ts-expect-error Bands on a chart, which are the model's scan's
    { type: chartType.dynamic, axes, bands: q.tsv },
    // @ts-expect-error a psychrometric chart with axes, which its temperature entry mode fixes
    { type: chartType.psychrometric, axes },
    // @ts-expect-error a psychrometric chart with Comfort zones, which are the model's scan's
    { type: chartType.psychrometric, comfortZones: [zone] },
    // @ts-expect-error a psychrometric chart with limit lines, which are the adaptive chart's
    { type: chartType.psychrometric, limits: () => limits },
    // @ts-expect-error a dynamic chart with limit lines, which are the adaptive chart's
    { type: chartType.dynamic, axes, limits: () => limits },
    // @ts-expect-error an adaptive chart without its limits source
    { type: chartType.adaptive, axes },
    // @ts-expect-error an adaptive chart whose source closes polygons, which the builder closes from the limits
    { type: chartType.adaptive, axes, limits: () => [{ label: "Zone", x: [0, 1, 1], y: [0, 0, 1] }] },
    // @ts-expect-error an adaptive chart with an output it does not scan
    { type: chartType.adaptive, axes, limits: () => limits, output: q.pmv },
    // @ts-expect-error an adaptive chart with Bands it does not scan
    { type: chartType.adaptive, axes, limits: () => limits, bands: q.tsv },
  ];
}

/** The same, for which charts a model may declare with and without a scan. */
export function scanShapesTypeProof(limits: readonly ZoneLimits[]): ModelDeclaration[] {
  const { charts: _charts, ...unscanned } = adaptiveAshrae;
  const scan = { output: q.pmv, bands: q.tsv };
  const axes = { x: q.v, y: q.operative_tmp };
  const adaptive = { type: chartType.adaptive, axes, limits: () => limits };
  return [
    { ...unscanned, scan, charts: [{ type: chartType.dynamic, axes }] },
    { ...unscanned, scan, charts: [{ type: chartType.psychrometric }, { type: chartType.dynamic, axes }, adaptive] },
    { ...unscanned, charts: [adaptive] },
    // @ts-expect-error a dynamic chart on a model that declares no scan
    { ...unscanned, charts: [{ type: chartType.dynamic, axes }] },
    // @ts-expect-error a psychrometric chart on a model that declares no scan
    { ...unscanned, charts: [{ type: chartType.psychrometric }, adaptive] },
  ];
}
