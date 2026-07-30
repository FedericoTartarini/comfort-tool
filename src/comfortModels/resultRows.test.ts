import { describe, expect, it } from "vitest";

import { CalculationSource, ComfortStandard } from "../models/calculationMetadata";
import { ChartId } from "../models/chartOptions";
import { ComplianceStatus } from "../models/comfortModels";
import { FieldKey } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { AirSpeedInputMode, OptionKey } from "../models/inputModes";
import { InputId, type InputId as InputIdType } from "../models/inputSlots";
import { UnitSystem } from "../models/units";
import type { ResultCellViewModel, ResultSectionViewModel } from "../state/comfortTool/types";
import {
  adaptiveAshraeModelConfig,
  adaptiveAshraeZonesList,
} from "./adaptiveAshrae";
import {
  adaptiveEnModelConfig,
  adaptiveEnZonesList,
} from "./adaptiveEn";
import type { AdaptiveResponseDto } from "./adaptiveShared";
import { pmvAshraeModelConfig } from "./pmvAshrae";
import { pmvZonesList, type PmvResponseDto } from "./pmvShared";

const visibleInputIds = [InputId.Input1];
const allVisibleInputIds = [InputId.Input1, InputId.Input2, InputId.Input3];

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

const pmvResult: PmvResponseDto = {
  pmv: 0.24,
  ppd: 5.25,
  vr: 0.6,
  isCompliant: true,
  standard: ComfortStandard.Ashrae55PmvPpd,
  source: CalculationSource.JsThermalComfort,
};

const ashraeResult: AdaptiveResponseDto = {
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

const enResult: AdaptiveResponseDto = {
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
  result: AdaptiveResponseDto,
  levelId: string,
  patch: Partial<AdaptiveResponseDto["levels"][number]>,
): AdaptiveResponseDto {
  return {
    ...result,
    levels: result.levels.map((level) => (
      level.id === levelId ? { ...level, ...patch } : level
    )),
  };
}

describe("comfort model result rows", () => {
  it("builds PMV default rows in order with current formatting", () => {
    const sections = pmvAshraeModelConfig.buildResultSections(
      createResultRecord(pmvResult),
      visibleInputIds,
      UnitSystem.SI,
      {},
      ChartId.Psychrometric,
    );

    expect(sections.map((section) => section.title)).toEqual([
      "Compliance",
      "PMV",
      "Zone",
      "PPD",
      "Acceptability",
    ]);
    expect(getInputCell(sections, "Compliance")).toEqual({
      text: ComplianceStatus.Compliant,
      color: "#047857",
    });
    expect(getInputCell(sections, "PMV")?.text).toBe("0.24");
    expect(getInputCell(sections, "Zone")).toEqual({
      text: pmvZonesList[3].label,
      color: pmvZonesList[3].textColor,
    });
    expect(getInputCell(sections, "PPD")?.text).toBe("5.3%");
    expect(getInputCell(sections, "Acceptability")?.text).toBe("94.8%");
  });

  it("adds the PMV measured air-speed row and converts units for display", () => {
    const airSpeedLabel = fieldMetaByKey[FieldKey.RelativeAirSpeed].label;
    const siAirSpeedUnits = fieldMetaByKey[FieldKey.RelativeAirSpeed].displayUnits[UnitSystem.SI];
    const ipAirSpeedUnits = fieldMetaByKey[FieldKey.RelativeAirSpeed].displayUnits[UnitSystem.IP];
    const measuredOptions = {
      [OptionKey.AirSpeedInputMode]: AirSpeedInputMode.Measured,
    };
    const siSections = pmvAshraeModelConfig.buildResultSections(
      createResultRecord(pmvResult),
      visibleInputIds,
      UnitSystem.SI,
      measuredOptions,
      ChartId.Psychrometric,
    );
    const ipSections = pmvAshraeModelConfig.buildResultSections(
      createResultRecord(pmvResult),
      visibleInputIds,
      UnitSystem.IP,
      measuredOptions,
      ChartId.Psychrometric,
    );

    expect(siSections.map((section) => section.title)).toEqual([
      "Compliance",
      airSpeedLabel,
      "PMV",
      "Zone",
      "PPD",
      "Acceptability",
    ]);
    expect(getInputCell(siSections, airSpeedLabel)?.text).toBe(`0.60 ${siAirSpeedUnits}`);
    expect(getInputCell(ipSections, airSpeedLabel)?.text).toBe(`1.97 ${ipAirSpeedUnits}`);
  });

  it("maps multiple PMV inputs while preserving null and noncompliant cells", () => {
    const nonCompliantResult: PmvResponseDto = {
      ...pmvResult,
      pmv: -1.2,
      ppd: 35,
      isCompliant: false,
    };
    const sections = pmvAshraeModelConfig.buildResultSections(
      createResultRecord(pmvResult, {
        [InputId.Input3]: nonCompliantResult,
      }),
      allVisibleInputIds,
      UnitSystem.SI,
      {},
      ChartId.Psychrometric,
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
    const temperatureUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[UnitSystem.SI];
    const sections = adaptiveAshraeModelConfig.buildResultSections(
      createResultRecord(ashraeResult),
      visibleInputIds,
      UnitSystem.SI,
      {},
      ChartId.Adaptive,
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

    const sectionsWithMissingStatus = adaptiveAshraeModelConfig.buildResultSections(
      createResultRecord(replaceAdaptiveLevel(
        ashraeResult,
        "acceptability-90",
        { status: null },
      )),
      visibleInputIds,
      UnitSystem.SI,
      {},
      ChartId.Adaptive,
    );
    expect(getInputCell(sectionsWithMissingStatus, adaptiveAshraeZonesList[2].label)).toEqual({
      text: "N/A",
      color: "",
    });
  });

  it("converts Adaptive ASHRAE boundary subtext to IP and colors a cool result", () => {
    const sections = adaptiveAshraeModelConfig.buildResultSections(
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
      {},
      ChartId.Adaptive,
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
    const sections = adaptiveAshraeModelConfig.buildResultSections(
      createResultRecord(result),
      visibleInputIds,
      UnitSystem.SI,
      {},
      ChartId.Adaptive,
    );

    expect(getInputCell(sections, "Compliance")).toEqual({
      text: expectedText,
      color: adaptiveAshraeZonesList[3].textColor,
    });
  });

  it("renders N/A without a misleading color when boundary data is missing", () => {
    const sections = adaptiveAshraeModelConfig.buildResultSections(
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
      {},
      ChartId.Adaptive,
    );

    expect(getInputCell(sections, adaptiveAshraeZonesList[2].label)).toEqual({
      text: "N/A",
      color: "",
    });
  });

  it("builds Adaptive EN rows with accepted and non-accepted category colors", () => {
    const temperatureUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[UnitSystem.SI];
    const sections = adaptiveEnModelConfig.buildResultSections(
      createResultRecord(enResult),
      visibleInputIds,
      UnitSystem.SI,
      {},
      ChartId.Adaptive,
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
});
