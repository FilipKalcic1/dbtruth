// contextualize.ts: Extract -> Claims. One call, prompt A, validated.

import type { Model } from "./model.js";
import { ClaimsSchema, type Claims, type Extract } from "./schemas.js";

export function contextualize(model: Model, extract: Extract): Promise<Claims> {
  return model.ask("contextualize", extract, ClaimsSchema);
}
