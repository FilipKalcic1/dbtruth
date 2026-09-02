// Copies src/prompts/*.md next to the compiled code so dist/model.js can read them.
import { cpSync } from "node:fs";
cpSync("src/prompts", "dist/prompts", { recursive: true });
