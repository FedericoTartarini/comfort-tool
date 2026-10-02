/**
 * Nothing a registered model does while its charts are drawn reaches the
 * console. A chart calls `run` for every cell of its grid, the dynamic
 * chart's and the psychrometric chart's, so one line a kernel logs per call
 * is thousands per chart, and the app's own messages drown in it.
 * The deployed front end logs nothing; neither may this one.
 */
import { describe, expect, it, vi } from "vitest";
import { registeredModels } from "$lib/models";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { startingSlot } from "$lib/core/slot";
import { dynamicChartOf, psychrometricChartOf, type RegisteredModel, type Values } from "$lib/core/modelDeclaration";
import { chartRequestFor, chartRequestForSlots } from "./chartTestRequests";
import { dynamicSpec } from "./dynamicChart";
import { psychrometricSpec } from "./psychrometricChart";

const consoleMethods = ["warn", "log", "error"] as const;

/**
 * Every console write made while `model`'s dynamic chart is scanned at its
 * declared axes and its psychrometric chart scanned, where it declares one, all
 * at the model's own defaults, of one slot and of three compared ones. Each
 * write reads `console.<method>: <args>`.
 */
function consoleWritesWhileDrawing(model: RegisteredModel): string[] {
  const spies = consoleMethods.map((method) => [method, vi.spyOn(console, method).mockImplementation(() => undefined)] as const);
  try {
    const slot = startingSlot(model);
    for (const request of [chartRequestFor(model, slot), chartRequestForSlots(model, [slot, slot, slot])]) {
      const dynamic = dynamicChartOf(model);
      if (dynamic) {
        dynamicSpec(request, dynamic, dynamic.axes);
      }
      if (psychrometricChartOf(model)) {
        psychrometricSpec(request);
      }
    }
    return spies.flatMap(([method, spy]) => spy.mock.calls.map((args) => `console.${method}: ${args.map(String).join(" ")}`));
  } finally {
    // Restored per model, so one model's writes are never counted against the next.
    for (const [, spy] of spies) {
      spy.mockRestore();
    }
  }
}

describe("drawing a model's charts", () => {
  it("writes nothing to the console, for every registered model", () => {
    for (const model of registeredModels) {
      expect(consoleWritesWhileDrawing(model), model.info.label).toEqual([]);
    }
  });

  it("is caught writing a single line", () => {
    let logged = false;
    const logsOnce = {
      ...pmvPpdIso,
      run: (values: Values) => {
        if (!logged) {
          logged = true;
          console.warn("cooling effect assumed 0");
        }
        return pmvPpdIso.run(values);
      },
    } satisfies RegisteredModel;
    expect(consoleWritesWhileDrawing(logsOnce)).toEqual(["console.warn: cooling effect assumed 0"]);
  });
});
