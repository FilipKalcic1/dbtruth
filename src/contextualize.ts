// contextualize.ts: Extract -> Claims. One call, prompt A, validated.

import type { AskOptions, Model } from "./model.js";
import { ClaimsSchema, type Claims, type Extract } from "./schemas.js";

export function contextualize(model: Model, extract: Extract, options?: AskOptions): Promise<Claims> {
  return model.ask("contextualize", extract, ClaimsSchema, options);
}
