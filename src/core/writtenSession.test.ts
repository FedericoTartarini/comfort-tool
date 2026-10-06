import { describe, expect, it } from "vitest";
import { registeredModels } from "$lib/models";
import { bandListOf } from "./bands";
import { dynamicChartOf } from "./modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE } from "./quantities";
import { startingSlot } from "./slot";
import { unitSystem } from "./unitSystem";
import { startingChartSettings, startingSession } from "./writtenSession";

describe("startingSession", () => {
  it("is the model on its starting slot alone, SI, standard pressure, Compare off and its own chart settings, for every registered model", () => {
    for (const model of registeredModels) {
      const settings = {
        type: model.charts[0].type,
        axes: dynamicChartOf(model)?.axes ?? null,
        bands: model.scan ? bandListOf(model.scan.classifier) : null,
      };
      expect(startingChartSettings(model), model.info.label).toEqual(settings);
      expect(startingSession(model), model.info.label).toEqual({
        model,
        unitSystem: unitSystem.si,
        atmosphericPressure: DEFAULT_ATMOSPHERIC_PRESSURE,
        compare: false,
        enabled: [false, false],
        slots: [startingSlot(model), null, null],
        charts: new Map([[model, settings]]),
      });
    }
  });
});
