// contextualize.ts: Extract -> Claims. One call, prompt A, validated, with every table name spelled as the extract spells it.

import type { AskOptions, Model } from "./model.js";
import { claimsSchema, type Claims, type Extract } from "./schemas.js";

export function contextualize(model: Model, extract: Extract, options?: AskOptions): Promise<Claims> {
  return model.ask("contextualize", extract, claimsSchema(extract.tables), options);
}
