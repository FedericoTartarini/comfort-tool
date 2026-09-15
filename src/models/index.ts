import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { pmvIso } from "./pmvIso";

/** The registry. Adding a model is one declaration file plus one entry here. */
export const registeredModels: readonly RegisteredModel[] = [pmvIso];
