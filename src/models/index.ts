import type { ModelDeclaration } from "$lib/core/modelDeclaration";
import { adaptiveAshrae } from "./adaptiveAshrae";
import { heatIndexRothfusz } from "./heatIndexRothfusz";
import { pmvPpdAshrae } from "./pmvPpdAshrae";
import { pmvPpdIso } from "./pmvPpdIso";

/**
 * The registry. Adding a model is one declaration file plus one line here.
 * Its order is the tool's one order (ADR-0002 decision 74): the models of one
 * standard together, ASHRAE 55 first, then ISO 7730, then other standards,
 * then the models with no standard last. `defaultModel` reads the default from
 * this order.
 */
export const registeredModels: readonly ModelDeclaration[] = [pmvPpdAshrae, adaptiveAshrae, pmvPpdIso, heatIndexRothfusz];
