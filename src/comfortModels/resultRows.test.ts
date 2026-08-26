import { describe, expect, it } from "vitest";

import { CalculationSource, ComfortStandard } from "../models/calculationMetadata";
import { ComplianceStatus } from "../models/modelIds";
import { PhysicalQuantityId, getQuantityPresentationMeta } from "../models/quantities";
import { InputId, type InputId as InputIdType } from "../models/inputSlots";
import { UnitSystem } from "../models/units";
import type { ResultCellViewModel, ResultSectionViewModel } from "../state/comfortTool/types";
import {
  adaptiveAshraeModelConfig,
  adaptiveAshraeZonesList,
} from "./adaptive/adaptiveAshrae";
import {
  adaptiveEnModelConfig,
  adaptiveEnZonesList,
} from "./adaptive/adaptiveEn";
import type { AdaptiveResponse } from "./adaptive/adaptiveShared";
import { pmvAshraeModelConfig } from "./pmv/pmvAshrae";
import { pmvZonesList, type PmvResponse } from "./pmv/pmvCalculation";
import { phsModelConfig } from "./phs/phs";
import { simulatePhs, calculatePhs } from "./phs/phsCalculation";
import {
  PHS_COMPLIANCE_HORIZON_MINUTES,
  phsReferenceEnvironment,
  defaultPhsPersonSettings,
} from "../models/phs";
import { utciModelConfig, calculateUtci } from "./utci/utci";
import { windChillModelConfig, calculateWindChill } from "./windChill";

const visibleInputIds = [InputId.Input1];
const allVisibleInputIds = [InputId.Input1, InputId.Input2, InputId.Input3];
const pmvNeutralZone = pmvZonesList.find(
  ({ label }) => label === "Neutral",
);
if (!pmvNeutralZone) throw new Error("Missing registered PMV Neutral zone.");

function createResultRecord<T>(
  result: T,
  overrides: Partial<Record<InputIdType, T | null>> = {},
): Record<InputIdType, T | null> {
  return {
    [InputId.Input1]: result,
    [InputId.Input2]: null,
    [InputId.Input3]: null,
    ...overrides,
  };
}

function getInputCell(
  sections: ResultSectionViewModel[],
  title: string,
  inputId: InputIdType = InputId.Input1,
): ResultCellViewModel | null | undefined {
  return sections.find((section) => section.title === title)?.valuesByInput[inputId];
}

const pmvResult: PmvResponse = {
  pmv: 0.24,
  ppd: 5.25,
  vr: 0.6,
  set: 24.3,
  coolingEffect: 1.64,
  dynamicClothing: 0.5,
  isCompliant: true,
  standard: ComfortStandard.Ashrae55PmvPpd,
  source: CalculationSource.JsThermalComfort,
};

const ashraeResult: AdaptiveResponse = {
  tCmf: 25,
  operativeTemperature: 28,
  levels: [
    {
      id: "acceptability-80",
      label: adaptiveAshraeZonesList[1].label,
      accepted: true,
      status: adaptiveAshraeZonesList[1].label,
      lower: 21.5,
      upper: 28.5,
    },
    {
      id: "acceptability-90",
      label: adaptiveAshraeZonesList[2].label,
      accepted: false,
      status: adaptiveAshraeZonesList[3].label,
      lower: 22.5,
      upper: 27.5,
    },
  ],
  isApplicable: true,
  standard: ComfortStandard.Ashrae55Adaptive,
  source: CalculationSource.JsThermalComfort,
};

const enResult: AdaptiveResponse = {
  tCmf: 24,
  operativeTemperature: 28,
  levels: [
    {
      id: "category-i",
      label: adaptiveEnZonesList[3].label,
      accepted: false,
      status: adaptiveEnZonesList[4].label,
      lower: 21,
      upper: 27,
    },
    {
      id: "category-ii",
      label: adaptiveEnZonesList[2].label,
      accepted: false,
      status: adaptiveEnZonesList[4].label,
      lower: 20,
      upper: 28,
    },
    {
      id: "category-iii",
      label: adaptiveEnZonesList[1].label,
      accepted: true,
      status: adaptiveEnZonesList[1].label,
      lower: 19,
      upper: 29,
    },
  ],
  isApplicable: true,
  standard: ComfortStandard.En16798Adaptive,
  source: CalculationSource.JsThermalComfort,
};

function replaceAdaptiveLevel(
  result: AdaptiveResponse,
  levelId: string,
  patch: Partial<AdaptiveResponse["levels"][number]>,
): AdaptiveResponse {
  return {
    ...result,
    levels: result.levels.map((level) => (
      level.id === levelId ? { ...level, ...patch } : level
    )),
  };
}

describe("comfort model result rows", () => {
  it("builds PMV default rows in order with current formatting", () => {
    const sections = pmvAshraeModelConfig.buildTable(
      createResultRecord(pmvResult),
      visibleInputIds,
      UnitSystem.SI,
    );

    expect(sections.map((section) => section.title)).toEqual([
      "Compliance",
      "PMV",
      "Zone",
      "PPD",
      "Acceptability",
      "SET",
      "Cooling effect",
      "Relative air speed",
      "Dynamic clothing",
    ]);
    expect(getInputCell(sections, "Compliance")).toEqual({
      text: ComplianceStatus.Compliant,
      color: "#047857",
    });
    expect(getInputCell(sections, "PMV")?.text).toBe("0.24");
    expect(getInputCell(sections, "Zone")).toEqual({
      text: pmvNeutralZone.label,
      color: pmvNeutralZone.textColor,
    });
    expect(getInputCell(sections, "PPD")?.text).toBe("5.3%");
    expect(getInputCell(sections, "Acceptability")?.text).toBe("94.8%");
    expect(getInputCell(sections, "SET")?.text).toBe("24.3 °C");
    expect(getInputCell(sections, "Cooling effect")?.text).toBe("1.64 °C");
    expect(getInputCell(sections, "Relative air speed")?.text).toBe("0.60 m/s");
    expect(getInputCell(sections, "Dynamic clothing")?.text).toBe("0.50 clo");
  });

  it("converts PMV SET, cooling effect, and relative air speed to IP", () => {
    const sections = pmvAshraeModelConfig.buildTable(
      createResultRecord(pmvResult),
      visibleInputIds,
      UnitSystem.IP,
    );

    expect(getInputCell(sections, "SET")?.text).toBe("75.7 °F");
    expect(getInputCell(sections, "Cooling effect")?.text).toBe("2.95 °F");
    expect(getInputCell(sections, "Relative air speed")?.text).toBe("1.97 ft/s");
    expect(getInputCell(sections, "Dynamic clothing")?.text).toBe("0.50 clo");
  });

  it("maps multiple PMV inputs while preserving null and noncompliant cells", () => {
    const nonCompliantResult: PmvResponse = {
      ...pmvResult,
      pmv: -1.2,
      ppd: 35,
      isCompliant: false,
    };
    const sections = pmvAshraeModelConfig.buildTable(
      createResultRecord(pmvResult, {
        [InputId.Input3]: nonCompliantResult,
      }),
      allVisibleInputIds,
      UnitSystem.SI,
    );
    const complianceSection = sections.find((section) => section.title === "Compliance");

    expect(Object.keys(complianceSection?.valuesByInput ?? {})).toEqual(allVisibleInputIds);
    expect(getInputCell(sections, "Compliance", InputId.Input1)).toEqual({
      text: ComplianceStatus.Compliant,
      color: "#047857",
    });
    expect(getInputCell(sections, "Compliance", InputId.Input2)).toBeNull();
    expect(getInputCell(sections, "Compliance", InputId.Input3)).toEqual({
      text: ComplianceStatus.OutOfRange,
      color: "#dc2626",
    });
    expect(getInputCell(sections, "PMV", InputId.Input1)?.text).toBe("0.24");
    expect(getInputCell(sections, "PMV", InputId.Input3)?.text).toBe("-1.20");
  });

  it("builds Adaptive ASHRAE rows with compliance, band formatting, and N/A state", () => {
    const temperatureUnits = getQuantityPresentationMeta(
      PhysicalQuantityId.DryBulbTemperature,
      UnitSystem.SI,
    ).displayUnits;
    const sections = adaptiveAshraeModelConfig.buildTable(
      createResultRecord(ashraeResult),
      visibleInputIds,
      UnitSystem.SI,
    );

    expect(sections.map((section) => section.title)).toEqual([
      "Compliance",
      adaptiveAshraeZonesList[1].label,
      adaptiveAshraeZonesList[2].label,
    ]);
    expect(getInputCell(sections, "Compliance")).toEqual({
      text: ComplianceStatus.Compliant,
      color: adaptiveAshraeZonesList[2].textColor,
    });
    expect(getInputCell(sections, adaptiveAshraeZonesList[1].label)).toEqual({
      text: adaptiveAshraeZonesList[1].label,
      subtext: `21.5 ~ 28.5 ${temperatureUnits}`,
      color: adaptiveAshraeZonesList[1].textColor,
    });
    expect(getInputCell(sections, adaptiveAshraeZonesList[2].label)).toEqual({
      text: adaptiveAshraeZonesList[3].label,
      subtext: `22.5 ~ 27.5 ${temperatureUnits}`,
      color: adaptiveAshraeZonesList[3].textColor,
    });

    const sectionsWithMissingStatus = adaptiveAshraeModelConfig.buildTable(
      createResultRecord(replaceAdaptiveLevel(
        ashraeResult,
        "acceptability-90",
        { status: null },
      )),
      visibleInputIds,
      UnitSystem.SI,
    );
    expect(getInputCell(sectionsWithMissingStatus, adaptiveAshraeZonesList[2].label)).toEqual({
      text: "N/A",
      color: "",
    });
  });

  it("converts Adaptive ASHRAE boundary subtext to IP and colors a cool result", () => {
    const sections = adaptiveAshraeModelConfig.buildTable(
      createResultRecord({
        ...replaceAdaptiveLevel(
          ashraeResult,
          "acceptability-90",
          { status: adaptiveAshraeZonesList[0].label },
        ),
        operativeTemperature: 20,
      }),
      visibleInputIds,
      UnitSystem.IP,
    );

    expect(getInputCell(sections, adaptiveAshraeZonesList[1].label)).toEqual({
      text: adaptiveAshraeZonesList[1].label,
      subtext: "70.7 ~ 83.3 °F",
      color: adaptiveAshraeZonesList[1].textColor,
    });
    expect(getInputCell(sections, adaptiveAshraeZonesList[2].label)).toEqual({
      text: adaptiveAshraeZonesList[0].label,
      subtext: "72.5 ~ 81.5 °F",
      color: adaptiveAshraeZonesList[0].textColor,
    });
  });

  it.each([
    {
      label: "noncompliant",
      result: replaceAdaptiveLevel(
        ashraeResult,
        "acceptability-80",
        { accepted: false },
      ),
      expectedText: ComplianceStatus.NonCompliant,
    },
    {
      label: "out-of-range",
      result: { ...ashraeResult, isApplicable: false },
      expectedText: ComplianceStatus.OutOfRange,
    },
  ])("formats Adaptive ASHRAE $label compliance", ({ result, expectedText }) => {
    const sections = adaptiveAshraeModelConfig.buildTable(
      createResultRecord(result),
      visibleInputIds,
      UnitSystem.SI,
    );

    expect(getInputCell(sections, "Compliance")).toEqual({
      text: expectedText,
      color: adaptiveAshraeZonesList[3].textColor,
    });
  });

  it("renders N/A without a misleading color when boundary data is missing", () => {
    const sections = adaptiveAshraeModelConfig.buildTable(
      createResultRecord(replaceAdaptiveLevel(
        { ...ashraeResult, operativeTemperature: -5 },
        "acceptability-90",
        {
          status: adaptiveAshraeZonesList[0].label,
          lower: null,
        },
      )),
      visibleInputIds,
      UnitSystem.SI,
    );

    expect(getInputCell(sections, adaptiveAshraeZonesList[2].label)).toEqual({
      text: "N/A",
      color: "",
    });
  });

  it("builds Adaptive EN rows with accepted and non-accepted category colors", () => {
    const temperatureUnits = getQuantityPresentationMeta(
      PhysicalQuantityId.DryBulbTemperature,
      UnitSystem.SI,
    ).displayUnits;
    const sections = adaptiveEnModelConfig.buildTable(
      createResultRecord(enResult),
      visibleInputIds,
      UnitSystem.SI,
    );

    expect(sections.map((section) => section.title)).toEqual([
      "Compliance",
      adaptiveEnZonesList[3].label,
      adaptiveEnZonesList[2].label,
      adaptiveEnZonesList[1].label,
    ]);
    expect(getInputCell(sections, "Compliance")).toEqual({
      text: ComplianceStatus.Compliant,
      color: adaptiveEnZonesList[2].textColor,
    });
    expect(getInputCell(sections, adaptiveEnZonesList[3].label)).toEqual({
      text: adaptiveEnZonesList[4].label,
      subtext: `21.0 ~ 27.0 ${temperatureUnits}`,
      color: adaptiveEnZonesList[4].textColor,
    });
    expect(getInputCell(sections, adaptiveEnZonesList[1].label)).toEqual({
      text: adaptiveEnZonesList[1].label,
      subtext: `19.0 ~ 29.0 ${temperatureUnits}`,
      color: adaptiveEnZonesList[1].textColor,
    });
  });

  it("builds UTCI rows with formatted value and stress color", () => {
    const request = { tdb: 25, tr: 25, v: 1, rh: 50 };
    const result = calculateUtci(request);
    const sections = utciModelConfig.buildTable(
      createResultRecord(result),
      visibleInputIds,
      UnitSystem.SI,
    );

    expect(sections.map((section) => section.title)).toEqual([
      "UTCI",
      "Stress Category",
    ]);
    expect(getInputCell(sections, "UTCI")?.text).toBe("24.6 °C");
    expect(getInputCell(sections, "Stress Category")).toEqual({
      text: "No Thermal Stress",
      color: "#059669",
    });
  });

  it("builds PHS grouped rows for valid and invalid results", () => {
    const validResult = simulatePhs({
      segments: [{
        id: "analysis",
        name: "Eight-hour assessment",
        durationMinutes: PHS_COMPLIANCE_HORIZON_MINUTES,
        ...phsReferenceEnvironment,
      }],
      person: defaultPhsPersonSettings,
      recordHistory: false,
    });
    const invalidResult = calculatePhs({
      ...phsReferenceEnvironment,
      tdb: 14,
      person: defaultPhsPersonSettings,
      durationMinutes: PHS_COMPLIANCE_HORIZON_MINUTES,
    });
    const sections = phsModelConfig.buildTable(
      createResultRecord(validResult, { [InputId.Input2]: invalidResult }),
      [InputId.Input1, InputId.Input2],
      UnitSystem.SI,
    );

    expect(sections.map((section) => section.title)).toEqual([
      "Rectal-temperature exposure limit",
      "Water-loss exposure limit",
      "Earliest limiting criterion",
      "Rectal temperature after 8 h",
      "Predicted water loss after 8 h",
    ]);
    expect(sections[0].group).toBe("Maximum allowable exposure time");
    expect(getInputCell(sections, "Rectal-temperature exposure limit")?.text)
      .toBe("0.90 h");
    expect(getInputCell(sections, "Rectal temperature after 8 h")?.text)
      .toContain("°C");
    expect(getInputCell(sections, "Rectal-temperature exposure limit", InputId.Input2)?.text)
      .toBe("Out of range");
  });

  it("builds Wind Chill rows with index and temperature cells", () => {
    const result = calculateWindChill({ tdb: -10, v: 5 });
    const sections = windChillModelConfig.buildTable(
      createResultRecord(result),
      visibleInputIds,
      UnitSystem.SI,
    );

    expect(sections.map((section) => section.title)).toEqual([
      "Wind Chill Index",
      "Wind Chill Temperature",
    ]);
    expect(getInputCell(sections, "Wind Chill Index")?.subtext).toBe(result.wciZone);
    expect(getInputCell(sections, "Wind Chill Temperature")?.text).toContain("°C");
  });
});
