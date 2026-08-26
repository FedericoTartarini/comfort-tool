/// <reference lib="webworker" />

import type { PhsTimeSeriesDraft } from "../../models/phs";
import { simulatePhs } from "./calculation";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<PhsTimeSeriesDraft>) => {
  try {
    let lastReportedPercentage = -1;
    const result = simulatePhs(
      {
        segments: event.data.segments,
        person: event.data.person,
        recordHistory: true,
      },
      {
        onProgress: (completedMinutes, totalMinutes) => {
          const progress = totalMinutes > 0 ? completedMinutes / totalMinutes : 1;
          const percentage = Math.floor(progress * 100);
          if (percentage === lastReportedPercentage) return;
          lastReportedPercentage = percentage;
          workerScope.postMessage({ type: "progress", progress });
        },
      },
    );
    if (!result.valid) {
      workerScope.postMessage({
        type: "error",
        message: result.issues.join(" "),
      });
      return;
    }
    workerScope.postMessage({ type: "result", result });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      message: error instanceof Error
        ? error.message
        : "PHS worker simulation failed.",
    });
  }
};
