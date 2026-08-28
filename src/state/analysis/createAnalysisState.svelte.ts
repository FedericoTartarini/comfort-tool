import { syncDerivedStateIntoAuxiliary } from "../../engines/comfort/syncState";
import {
  createAnalysisInputState,
  createAnalysisOutputState,
  createAnalysisSettingState,
} from "./initialAnalysisState";
import { createCalculationManager } from "./calculationManager.svelte";
import { createAnalysisActions } from "./analysisActions";
import { createAnalysisInternals } from "./analysisInternals";
import { createAnalysisSelectors } from "./analysisSelectors";
import type {
  AnalysisController,
  AnalysisOutputState,
  AnalysisStateSlice,
} from "./types";

/**
 * Point session for Standard and Explore. Time-series stays a separate session.
 */
export class PointSession implements AnalysisController {
  input = $state(createAnalysisInputState());
  setting = $state(createAnalysisSettingState());
  isLoading = $state(false);
  errorMessage = $state("");
  calculationCacheByModel = $state.raw(
    createAnalysisOutputState().calculationCacheByModel,
  );

  readonly state: AnalysisStateSlice;
  readonly actions: AnalysisController["actions"];
  readonly selectors: AnalysisController["selectors"];

  constructor() {
    syncDerivedStateIntoAuxiliary(
      this.input.quantitiesByInput,
      this.input.auxiliaryQuantitiesByInput,
    );

    const getInput = () => this.input;
    const getSetting = () => this.setting;
    const getIsLoading = () => this.isLoading;
    const setIsLoading = (value: boolean) => {
      this.isLoading = value;
    };
    const getErrorMessage = () => this.errorMessage;
    const setErrorMessage = (value: string) => {
      this.errorMessage = value;
    };
    const getCalculationCacheByModel = () => this.calculationCacheByModel;
    const setCalculationCacheByModel = (
      value: AnalysisOutputState["calculationCacheByModel"],
    ) => {
      this.calculationCacheByModel = value;
    };

    const state: AnalysisStateSlice = {
      get input() {
        return getInput();
      },
      get setting() {
        return getSetting();
      },
      output: {
        get isLoading() {
          return getIsLoading();
        },
        set isLoading(value) {
          setIsLoading(value);
        },
        get errorMessage() {
          return getErrorMessage();
        },
        set errorMessage(value) {
          setErrorMessage(value);
        },
        get calculationCacheByModel() {
          return getCalculationCacheByModel();
        },
        set calculationCacheByModel(value) {
          setCalculationCacheByModel(value);
        },
      },
    };
    this.state = state;

    const internals = createAnalysisInternals(state);
    const { scheduleCalculation: scheduleCalculationInternal } =
      createCalculationManager(
        state,
        internals.getVisibleInputIds,
        internals.getEffectiveQuantitiesByInput,
      );

    this.actions = createAnalysisActions(
      state,
      internals,
      scheduleCalculationInternal,
    );
    this.selectors = createAnalysisSelectors(
      state,
      internals,
      {
        onSelectBaseline: this.actions.setChartBaselineInputId,
        onSelectXAxis: this.actions.setDynamicXAxis,
        onSelectYAxis: this.actions.setDynamicYAxis,
        onSelectOutput: this.actions.setExploreOutput,
        onApplyBands: this.actions.setExploreBands,
      },
      {
        onSetCompareEnabled: this.actions.setCompareEnabled,
        onToggleUnitSystem: this.actions.toggleUnitSystem,
        onToggleCompareInputVisibility:
          this.actions.toggleCompareInputVisibility,
        onActivateInput: this.actions.setActiveInputId,
        onUpdateInput: this.actions.updateInput,
        onSetModelOption: this.actions.setModelOption,
        getInputModifierDraft: internals.getInputModifierDraft,
        projectInputModifierDraft: internals.getInputModifierControls,
        onApplyInputModifierDraft: this.actions.applyInputModifierDraft,
      },
    );
  }
}

export function createAnalysisState(): AnalysisController {
  return new PointSession();
}
