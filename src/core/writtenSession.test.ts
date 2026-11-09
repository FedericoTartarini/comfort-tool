import { describe, expect, it } from "vitest";
import { registeredModels } from "$lib/models";
import { bandListOf } from "./bands";
import { classifierOf, dynamicChartOf } from "./modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE } from "./quantities";
import { defaultSlot } from "./slot";
import { unitSystem } from "./unitSystem";
import { defaultChartSettings, defaultSession } from "./writtenSession";

describe("defaultSession", () => {
  it("is the model on its default slot alone, SI, default atmospheric pressure, Compare off and its own chart settings, for every registered model", () => {
    for (const model of registeredModels) {
      const settings = {
        type: model.charts[0].type,
        axes: dynamicChartOf(model)?.axes ?? null,
        bands: model.scan ? bandListOf(classifierOf(model.info, model.scan.bands)) : null,
      };
      expect(defaultChartSettings(model), model.info.label).toEqual(settings);
      expect(defaultSession(model), model.info.label).toEqual({
        model,
        unitSystem: unitSystem.si,
        atmosphericPressure: DEFAULT_ATMOSPHERIC_PRESSURE,
        compare: false,
        enabled: [false, false],
        slots: [defaultSlot(model), null, null],
        charts: new Map([[model, settings]]),
      });
    }
  });
});
