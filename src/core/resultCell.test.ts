import { describe, expect, it } from "vitest";
import { quantities } from "./quantities";
import { formatResultCell } from "./resultCell";
import { unitSystem } from "./unitSystem";

const q = quantities;

describe("formatResultCell", () => {
  it("shows a boolean result as Yes or No in either unit system", () => {
    const result = { acceptability_80: true, compliance: false };
    for (const system of [unitSystem.si, unitSystem.ip]) {
      expect(formatResultCell(result, q.acceptability_80, system)).toBe("Yes");
      expect(formatResultCell(result, q.compliance, system)).toBe("No");
    }
  });

  it("formats a number in the display unit", () => {
    const result = { tmp_cmf: 24.567, pmv: 0.5 };
    expect(formatResultCell(result, q.tmp_cmf, unitSystem.si)).toBe("24.57 °C");
    expect(formatResultCell(result, q.tmp_cmf, unitSystem.ip)).toBe("76.22 °F");
    expect(formatResultCell(result, q.pmv, unitSystem.si)).toBe("0.5");
  });

  it("shows a dash for a category, a non-finite number, a missing key and no result", () => {
    const result = { tsv: "Neutral", pmv: Number.NaN };
    expect(formatResultCell(result, q.tsv, unitSystem.si)).toBe("—");
    expect(formatResultCell(result, q.pmv, unitSystem.si)).toBe("—");
    expect(formatResultCell(result, q.ppd, unitSystem.si)).toBe("—");
    expect(formatResultCell(null, q.pmv, unitSystem.si)).toBe("—");
  });
});
