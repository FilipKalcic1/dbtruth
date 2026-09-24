// model.ts: the ONLY module that imports the Anthropic SDK, and the only way to reach the API.
//
// One mechanism for every prompt: ask(name, input, schema, { effort }).
//   - reads prompts/<name>.md and sends it as the system prompt
//   - sends JSON.stringify(input) as the user message
//   - extracts the JSON body from the reply and validates it with the zod schema
//   - on failure, sends the validation error back once and validates again
//   - on a second failure, saves both raw replies and throws
//
// Every API failure, before or during a request, becomes one sentence a person can act on.
// The transport is injectable so tests can run the whole loop without the network and can
// capture exactly what would have been sent.

import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Effort } from "./config.js";

export const DEFAULT_MODEL = "claude-sonnet-5";

export type Reply = { text: string; inputTokens: number; outputTokens: number; effortDropped?: boolean };

/** Sends one request and returns the text of the reply, with the token usage when the API reported it. */
export type Transport = (system: string, messages: Anthropic.MessageParam[], effort?: Effort) => Promise<string | Reply>;

export type AskOptions = {
  /** Reasoning effort for this call. Omitted: the API's default for the model. */
  effort?: Effort;
};

export type Usage = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** true when a call had to run without the requested effort because the model rejected the parameter. */
  effortDropped: boolean;
};

export type Model = {
  ask<T>(promptName: string, input: unknown, schema: z.ZodType<T>, options?: AskOptions): Promise<T>;
  /** Tokens sent and received so far, summed over every call including retries. Zero with an injected transport. */
  usage(): Usage;
  /**
   * Proves the API is reachable with the configured credentials and model before any data is
   * read. Sends only the model id. Throws a plain-language error naming what to fix.
   */
  preflight(): Promise<void>;
};

export type ModelOptions = {
  /** Where .raw-<name>.json is written when a reply fails validation twice. */
  rawDir: string;
  model?: string;
  maxOutputTokens: number;
  /** Explicit key (for example from .env); when absent the SDK resolves credentials from the environment. */
  apiKey?: string;
  transport?: Transport;
};

export function createModel(opts: ModelOptions): Model {
  const modelId = opts.model ?? DEFAULT_MODEL;
  const client = opts.transport ? undefined : new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  const transport = opts.transport ?? sdkTransport(client!, modelId, opts.maxOutputTokens);
  const usage: Usage = { calls: 0, inputTokens: 0, outputTokens: 0, effortDropped: false };

  /** One request through the transport, with usage accounted for. */
  async function send(system: string, messages: Anthropic.MessageParam[], effort: Effort | undefined): Promise<string> {
    const reply = await transport(system, messages, effort);
    usage.calls += 1;
    if (typeof reply === "string") return reply;
    usage.inputTokens += reply.inputTokens;
    usage.outputTokens += reply.outputTokens;
    if (reply.effortDropped) usage.effortDropped = true;
    return reply.text;
  }

  return {
    usage: () => ({ ...usage }),

    async preflight() {
      if (!client) return;
      try {
        await client.models.retrieve(modelId);
      } catch (e) {
        throw new Error(explainApiFailure(e, modelId));
      }
    },

    async ask(promptName, input, schema, options = {}) {
      const system = readPrompt(promptName);
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: JSON.stringify(input) }];

      const first = await send(system, messages, options.effort);
      const firstTry = validate(first, schema);
      if (firstTry.ok) return firstTry.value;

      messages.push(
        { role: "assistant", content: first },
        {
          role: "user",
          content:
            `Your reply did not validate:\n${firstTry.error}\n\n` +
            "Respond again with JSON only, matching the schema in the instructions.",
        },
      );
      const second = await send(system, messages, options.effort);
      const secondTry = validate(second, schema);
      if (secondTry.ok) return secondTry.value;

      mkdirSync(opts.rawDir, { recursive: true });
      const rawPath = join(opts.rawDir, `.raw-${promptName}.json`);
      writeFileSync(
        rawPath,
        JSON.stringify({ prompt: promptName, replies: [first, second], errors: [firstTry.error, secondTry.error] }, null, 2),
      );
      throw new Error(`the model's reply to "${promptName}" failed validation twice; raw replies saved to ${rawPath}`);
    },
  };
}

function readPrompt(name: string): string {
  return readFileSync(new URL(`./prompts/${name}.md`, import.meta.url), "utf8");
}

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

function validate<T>(reply: string, schema: z.ZodType<T>): Validation<T> {
  const body = extractJson(reply);
  if (body === undefined) return { ok: false, error: "no JSON object found in the reply" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return { ok: false, error: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const result = schema.safeParse(parsed);
  return result.success ? { ok: true, value: result.data } : { ok: false, error: z.prettifyError(result.error) };
}

/** The outermost {...} in the reply, tolerating prose or code fences around it. */
function extractJson(reply: string): string | undefined {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  return start >= 0 && end > start ? reply.slice(start, end + 1) : undefined;
}

const KEY_HELP =
  "Set ANTHROPIC_API_KEY in the environment or in a .env file in this directory or its parents up to the repository root; " +
  "keys are created at console.anthropic.com.";

/** One sentence a person can act on, from whatever the SDK threw before or during a request. */
function explainApiFailure(e: unknown, model: string): string {
  if (e instanceof Anthropic.AuthenticationError) return `the Anthropic API rejected the key. ${KEY_HELP}`;
  if (e instanceof Anthropic.PermissionDeniedError) return `this key is not allowed to use model "${model}". Check ANTHROPIC_MODEL or the key's permissions.`;
  if (e instanceof Anthropic.NotFoundError) return `model "${model}" does not exist for this key. Check ANTHROPIC_MODEL.`;
  if (e instanceof Anthropic.RateLimitError) return `the Anthropic API is rate-limiting this key (429). Wait a minute and run again.`;
  if (e instanceof Anthropic.BadRequestError) return `the Anthropic API rejected the request (400): ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return `could not reach the Anthropic API: ${e.message}`;
  if (e instanceof Anthropic.APIError) return `the Anthropic API returned ${e.status}: ${e.message}`;
  // Anything else did not come from the API. The SDK's own error is a reply it could not read, one that broke off.
  if (e instanceof Anthropic.AnthropicError) return `the Anthropic API's reply broke off: ${e.message}. Run again.`;
  // Node refuses a request it cannot build: a key a header cannot carry, such as one with a curly quote, or a bad base URL.
  if (e instanceof TypeError) return `could not send a request to the Anthropic API: ${e.message}. Check the key in ANTHROPIC_API_KEY.`;
  // With no key the SDK throws a plain Error, in words that name ways to sign in dbtruth does not use.
  return `no API key found. ${KEY_HELP}`;
}

function sdkTransport(client: Anthropic, model: string, maxOutputTokens: number): Transport {
  return async (system, messages, effort) => {
    const request = (withEffort: boolean) =>
      client.messages
        .stream({ model, max_tokens: maxOutputTokens, system, messages, ...(withEffort && effort ? { output_config: { effort } } : {}) })
        .finalMessage();

    let message: Anthropic.Message;
    let effortDropped = false;
    try {
      message = await request(true);
    } catch (e) {
      // A model that does not accept the effort parameter answers 400. Try once without it, then explain.
      if (!(effort && e instanceof Anthropic.BadRequestError)) throw new Error(explainApiFailure(e, model));
      try {
        message = await request(false);
        effortDropped = true;
      } catch (again) {
        throw new Error(explainApiFailure(again, model));
      }
    }

    if (message.stop_reason === "refusal") {
      throw new Error(`the model refused the request${message.stop_details?.explanation ? ": " + message.stop_details.explanation : ""}`);
    }
    if (message.stop_reason === "max_tokens") {
      throw new Error(`the model's reply was cut off at ${maxOutputTokens} output tokens; raise DBTRUTH_MODEL_MAX_OUTPUT_TOKENS`);
    }
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return { text, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, effortDropped };
  };
}
