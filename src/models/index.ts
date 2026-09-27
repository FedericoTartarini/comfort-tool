import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { adaptiveAshrae } from "./adaptiveAshrae";
import { heatIndexRothfusz } from "./heatIndexRothfusz";
import { pmvPpdAshrae } from "./pmvPpdAshrae";
import { pmvPpdIso } from "./pmvPpdIso";

/** The registry. Adding a model is one declaration file plus one entry here. */
export const registeredModels: readonly RegisteredModel[] = [pmvPpdIso, pmvPpdAshrae, adaptiveAshrae, heatIndexRothfusz];
