import { serverEnv } from "@/lib/env";

/**
 * ---------------------------------------------------------------------------
 * AI provider abstraction (server-side only)
 * ---------------------------------------------------------------------------
 * The rest of the app never talks to an AI vendor directly — it depends on
 * `chatCompletion()` here. Any OpenAI-compatible endpoint is supported by
 * pointing `AI_BASE_URL` at it (OpenAI, Azure OpenAI-compatible gateways,
 * local vLLM/Ollama proxies, …).
 *
 * Guarantees:
 *   * the API key is read from the server environment and never leaves the
 *     server (no `NEXT_PUBLIC_` prefix, never returned to the client);
 *   * a missing key produces a typed `AiNotConfiguredError` so the UI can show
 *     a "not configured" state instead of crashing;
 *   * request bodies/responses are never logged with credentials attached.
 * ---------------------------------------------------------------------------
 */

export type AiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AiMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: AiToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string; name?: string };

export type AiToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    /** JSON Schema describing the arguments object. */
    parameters: Record<string, unknown>;
  };
};

export type AiUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

export type AiCompletion = {
  content: string | null;
  toolCalls: AiToolCall[];
  usage: AiUsage;
  model: string;
};

export class AiNotConfiguredError extends Error {
  constructor(message = "AI sozlanmagan. `AI_API_KEY` muhit o‘zgaruvchisini kiriting.") {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

export class AiRequestError extends Error {
  readonly status: number;
  readonly details: string;
  constructor(message: string, status = 0, details = "") {
    super(message);
    this.name = "AiRequestError";
    this.status = status;
    this.details = details;
  }
}

export function aiConfigured(): boolean {
  return serverEnv().AI_API_KEY.trim().length > 0;
}

export function aiModel(): string {
  return serverEnv().AI_MODEL;
}

export function aiBaseUrlHost(): string {
  try {
    return new URL(serverEnv().AI_BASE_URL).host;
  } catch {
    return serverEnv().AI_BASE_URL;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseToolCalls(value: unknown): AiToolCall[] {
  if (!Array.isArray(value)) return [];
  const calls: AiToolCall[] = [];
  for (const raw of value) {
    const item = asRecord(raw);
    const fn = asRecord(item.function);
    const name = typeof fn.name === "string" ? fn.name : "";
    if (!name) continue;
    calls.push({
      id: typeof item.id === "string" ? item.id : `call_${calls.length}`,
      type: "function",
      function: {
        name,
        arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
      },
    });
  }
  return calls;
}

/**
 * Perform a single chat-completion request. Throws `AiNotConfiguredError` when
 * no key is set and `AiRequestError` for transport/upstream failures.
 */
export async function chatCompletion(input: {
  messages: AiMessage[];
  tools?: AiToolSpec[];
  temperature?: number;
  maxTokens?: number;
}): Promise<AiCompletion> {
  const env = serverEnv();
  const apiKey = env.AI_API_KEY.trim();
  if (!apiKey) throw new AiNotConfiguredError();

  const base = env.AI_BASE_URL.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const configuredMax = Number.parseInt(env.AI_MAX_OUTPUT_TOKENS, 10);
  const maxTokens = input.maxTokens ?? (Number.isFinite(configuredMax) ? configuredMax : 900);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        messages: input.messages,
        ...(input.tools && input.tools.length > 0
          ? { tools: input.tools, tool_choice: "auto" }
          : {}),
        temperature: input.temperature ?? 0.2,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new AiRequestError(
      "AI xizmatiga ulanib bo‘lmadi.",
      0,
      error instanceof Error ? error.message : "Noma’lum tarmoq xatosi.",
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // Never surface the raw upstream body to end users; keep a short slice for
    // server logs only (it contains no credentials on our side).
    throw new AiRequestError(
      `AI xizmati xato qaytardi (HTTP ${response.status}).`,
      response.status,
      body.slice(0, 400),
    );
  }

  const json = (await response.json().catch(() => null)) as unknown;
  const root = asRecord(json);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const first = asRecord(choices[0]);
  const message = asRecord(first.message);
  const usage = asRecord(root.usage);

  const content = typeof message.content === "string" ? message.content : null;
  const toolCalls = parseToolCalls(message.tool_calls);

  if (!content && toolCalls.length === 0) {
    throw new AiRequestError("AI bo‘sh javob qaytardi.", response.status);
  }

  return {
    content,
    toolCalls,
    usage: {
      promptTokens: asNumber(usage.prompt_tokens),
      completionTokens: asNumber(usage.completion_tokens),
      totalTokens: asNumber(usage.total_tokens),
    },
    model: typeof root.model === "string" ? root.model : env.AI_MODEL,
  };
}
