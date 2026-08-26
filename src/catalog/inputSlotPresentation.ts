import { InputId, inputOrder, type InputId as InputIdType } from "./inputSlots";

type InputTone = "red" | "green" | "blue";

export interface InputChartStyle {
  line: string;
  fill: string;
  marker: string;
}

export interface InputUiStyle {
  inputToggleVisibleClass: string;
  inputToggleHiddenClass: string;
  clothingTargetActiveClass: string;
  clothingTargetInactiveClass: string;
  resultCellClass: string;
  resultActiveRingClass: string;
}

export const inputDisplayMetaById: Record<
  InputIdType,
  {
    label: string;
    shortLabel: string;
    tone: InputTone;
    accentClass: string;
    chartStyle: InputChartStyle;
    ui: InputUiStyle;
  }
> = {
  [InputId.Input1]: {
    label: "Input 1",
    shortLabel: "Input 1",
    tone: "blue",
    accentClass: "text-blue-800",
    chartStyle: {
      line: "#1e40af",
      fill: "rgba(30, 64, 175, 0.12)",
      marker: "#1e40af",
    },
    ui: {
      inputToggleVisibleClass: "border-blue-700 text-blue-900",
      inputToggleHiddenClass: "border-blue-300 text-blue-700",
      clothingTargetActiveClass: "bg-blue-100 text-blue-900 ring-1 ring-inset ring-blue-300 shadow-sm shadow-blue-900/5",
      clothingTargetInactiveClass: "text-blue-800 hover:bg-blue-100/80",
      resultCellClass: "border-blue-100 bg-blue-50/70",
      resultActiveRingClass: "ring-1 ring-blue-200/80",
    },
  },
  [InputId.Input2]: {
    label: "Input 2",
    shortLabel: "Input 2",
    tone: "red",
    accentClass: "text-red-800",
    chartStyle: {
      line: "#991b1b",
      fill: "rgba(153, 27, 27, 0.12)",
      marker: "#991b1b",
    },
    ui: {
      inputToggleVisibleClass: "border-red-700 text-red-900",
      inputToggleHiddenClass: "border-red-300 text-red-700",
      clothingTargetActiveClass: "bg-red-100 text-red-900 ring-1 ring-inset ring-red-300 shadow-sm shadow-red-900/5",
      clothingTargetInactiveClass: "text-red-800 hover:bg-red-100/80",
      resultCellClass: "border-red-100 bg-red-50/70",
      resultActiveRingClass: "ring-1 ring-red-200/80",
    },
  },
  [InputId.Input3]: {
    label: "Input 3",
    shortLabel: "Input 3",
    tone: "green",
    accentClass: "text-emerald-800",
    chartStyle: {
      line: "#047857",
      fill: "rgba(4, 120, 87, 0.14)",
      marker: "#047857",
    },
    ui: {
      inputToggleVisibleClass: "border-emerald-700 text-emerald-900",
      inputToggleHiddenClass: "border-emerald-300 text-emerald-700",
      clothingTargetActiveClass: "bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-300 shadow-sm shadow-emerald-900/5",
      clothingTargetInactiveClass: "text-emerald-800 hover:bg-emerald-100/80",
      resultCellClass: "border-emerald-100 bg-emerald-50/70",
      resultActiveRingClass: "ring-1 ring-emerald-200/80",
    },
  },
};

export const inputChartStyleById: Record<InputIdType, InputChartStyle> = inputOrder.reduce(
  (accumulator, inputId) => {
    accumulator[inputId] = inputDisplayMetaById[inputId].chartStyle;
    return accumulator;
  },
  {} as Record<InputIdType, InputChartStyle>,
);
