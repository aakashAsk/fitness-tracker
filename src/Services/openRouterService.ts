// OpenRouter, over its OpenAI-compatible REST API with plain fetch.
//
// No SDK: the openai package pulls in Node-oriented plumbing that React
// Native has to be polyfilled for, and a chat completion is one POST.
//
// Replaces geminiService for nutrition estimates. The exported shape —
// generateText / generateJson / isOpenRouterConfigured — deliberately
// mirrors it, so call sites move over by changing only the import.
//
// ─────────────────────────────────────────────────────────────────────
// SECURITY — read before shipping this
//
// EXPO_PUBLIC_* values are inlined into the JS bundle at build time, so
// anyone who has the APK can extract this key and spend against your
// account. That is fine for the Firebase config (it is designed to be
// public, and Firestore rules do the protecting) but an OpenRouter key
// is a BILLING credential with no equivalent guard.
//
// So: direct calls are for local development only. Before release, put
// a server in front — a Firebase Cloud Function that holds the key and
// forwards the prompt — and set EXPO_PUBLIC_OPENROUTER_PROXY_URL to it.
// Every call site goes through generateText(), so that switch needs no
// changes anywhere else. Set a hard spend limit on the key meanwhile:
// https://openrouter.ai/settings/keys
// ─────────────────────────────────────────────────────────────────────

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Treats a blank env var as absent.
 *
 * `process.env.X ?? fallback` is wrong here: a var declared but left
 * empty in .env — `EXPO_PUBLIC_OPENROUTER_MODEL=` — inlines as '', which
 * is not null, so the fallback never fires. That shipped an empty model
 * name and the API answered `400 No models provided`, which reads like
 * an outage rather than a config typo.
 *
 * Note the call sites below pass `process.env.SOMETHING` as a STATIC
 * property read, never `process.env[name]`. Expo's Babel plugin
 * substitutes EXPO_PUBLIC_* values by matching that exact syntax at
 * build time; a computed lookup is invisible to it, so the variable
 * silently becomes undefined in a real build while still working in
 * Node. Do not refactor these into a lookup-by-name helper.
 */
function orDefault(value: string | undefined, fallback = ''): string {
  return value && value.trim() ? value.trim() : fallback;
}

/**
 * Fallback only — .env selects the model actually used.
 *
 * Picked by benchmarking six foods at deliberately non-standard
 * quantities against USDA values, scoring mean calorie error:
 *
 *   google/gemini-2.5-flash       0.6%   2.5s   (what .env uses)
 *   openai/gpt-4o-mini            0.3%   5.6s   (this fallback)
 *   nex-agi/nex-n2.5-mini:free   16.5%   2.5s
 *   google/gemini-2.5-flash-lite 24.9%   1.9s
 *
 * The cheap ones all fail the same way: they return the per-100g figure
 * and ignore the stated quantity — 165 kcal for 150 g of chicken, wrong
 * by a third and entirely plausible-looking on a card. Benchmark any
 * replacement on quantities that are NOT 100 g or one serving, or this
 * failure hides.
 *
 * NOTE: free models (`:free`) additionally require Zero Data Retention
 * to be OFF for the account. With ZDR on, OpenRouter answers 404 "ZDR
 * violation" rather than a billing error, which is a confusing way to
 * find out. There is no free Gemini; the free Google models are Gemma,
 * which cannot do structured outputs.
 */
const MODEL = orDefault(process.env.EXPO_PUBLIC_OPENROUTER_MODEL, 'openai/gpt-4o-mini');

const API_KEY = orDefault(process.env.EXPO_PUBLIC_OPENROUTER_API_KEY);

/** Set once a server-side proxy exists; see the note above. */
const PROXY_URL = orDefault(process.env.EXPO_PUBLIC_OPENROUTER_PROXY_URL);

export class OpenRouterServiceError extends Error {
  /** HTTP status, when the failure came from the API rather than the network. */
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'OpenRouterServiceError';
    this.status = status;
  }
}

/** Whether a call can be made at all — no key and no proxy means no. */
export function isOpenRouterConfigured(): boolean {
  return !!API_KEY || !!PROXY_URL;
}

export interface GenerateOptions {
  /** Steers tone and rules; sent as the system message. */
  system?: string;
  /** 0 = deterministic, 1 = default, 2 = maximum spread. */
  temperature?: number;
  /** Caps the reply. Worth setting — these are shown in small cards. */
  maxOutputTokens?: number;
  /** Ask for JSON back rather than prose. */
  json?: boolean;
  /**
   * A JSON Schema the reply must conform to. Far stronger than asking
   * for JSON in the prompt: the model is constrained during decoding,
   * so missing keys and stray prose stop being failure modes worth
   * coding around.
   *
   * Two constraints come from OpenAI-style strict structured outputs,
   * which is what OpenRouter forwards:
   *   - the ROOT must be an object, never an array. Wrap a list in
   *     `{ items: [...] }` and unwrap it on the way out.
   *   - every object needs `additionalProperties: false` and must list
   *     all of its properties in `required`.
   * Types are lowercase JSON Schema ('number'), not Gemini's uppercase
   * OpenAPI dialect ('NUMBER') — schemas do not port over unchanged.
   */
  schema?: Record<string, unknown>;
  /** Names the schema in the request; shows up in OpenRouter's logs. */
  schemaName?: string;
  /**
   * Lets the model reason before answering. Off by default — see the
   * note where this is sent. Turn it on only for genuinely open-ended
   * work, and raise maxOutputTokens to match.
   */
  reasoning?: boolean;
  /** Aborts a request the user is no longer waiting on. */
  signal?: AbortSignal;
}

interface ChatChoice {
  message?: { content?: string };
  finish_reason?: string;
}

/**
 * One prompt in, one string out.
 *
 * Routes through the proxy when one is configured, otherwise straight
 * to OpenRouter with the local key.
 */
export async function generateText(
  prompt: string,
  options: GenerateOptions = {},
): Promise<string> {
  if (!isOpenRouterConfigured()) {
    throw new OpenRouterServiceError(
      'OpenRouter is not configured — set EXPO_PUBLIC_OPENROUTER_API_KEY in .env.',
    );
  }

  const body = {
    model: MODEL,
    messages: [
      ...(options.system ? [{ role: 'system', content: options.system }] : []),
      { role: 'user', content: prompt },
    ],
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxOutputTokens ?? 512,
    // Reasoning tokens count against max_tokens, so a model that thinks
    // before answering spends the whole budget on thought and returns
    // nothing — finish_reason 'length' with an empty message. Three of
    // the free models fail exactly that way with this turned on, and a
    // short structured reply has nothing to reason about. Same guard the
    // Gemini service used (thinkingConfig.thinkingBudget = 0); a no-op
    // on models that do not reason.
    reasoning: { enabled: options.reasoning ?? false },
    ...(options.schema
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: options.schemaName ?? 'response',
              strict: true,
              schema: options.schema,
            },
          },
        }
      : options.json
        ? { response_format: { type: 'json_object' } }
        : {}),
  };

  const url = PROXY_URL || API_URL;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The proxy authenticates its own way; the key never leaves the
        // server in that setup.
        ...(PROXY_URL ? {} : { Authorization: `Bearer ${API_KEY}` }),
        // Optional attribution, shown on OpenRouter's activity page.
        'X-Title': 'PulseFit',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    throw new OpenRouterServiceError(
      err instanceof Error ? err.message : 'Could not reach the AI service.',
    );
  }

  if (!response.ok) {
    // OpenRouter returns a JSON error body; fall back to the status text
    // when it is something else entirely (a proxy 502, say).
    let detail = response.statusText;
    try {
      const failure = await response.json();
      detail = failure?.error?.message ?? detail;
    } catch {
      /* non-JSON body — the status is all there is */
    }
    throw new OpenRouterServiceError(detail, response.status);
  }

  const payload = await response.json();

  // A 200 can still carry an error: OpenRouter reports some upstream
  // provider failures in the body rather than the status.
  if (payload?.error) {
    throw new OpenRouterServiceError(payload.error.message ?? 'The AI service returned an error.');
  }

  const choice: ChatChoice | undefined = payload?.choices?.[0];
  const text = (choice?.message?.content ?? '').trim();

  if (!text) {
    // An empty reply with a finish_reason is usually a content filter or
    // the token cap being hit mid-sentence — worth saying which.
    throw new OpenRouterServiceError(
      choice?.finish_reason
        ? `The model returned nothing (${choice.finish_reason}).`
        : 'The model returned nothing.',
    );
  }

  return text;
}

/**
 * Same call, parsed as JSON.
 *
 * Models still occasionally wrap JSON in a ```json fence even when a
 * response_format was requested, so that is stripped before parsing
 * rather than letting it throw.
 */
export async function generateJson<T>(
  prompt: string,
  options: Omit<GenerateOptions, 'json'> = {},
): Promise<T> {
  const raw = await generateText(prompt, { ...options, json: true });
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new OpenRouterServiceError('The model did not return valid JSON.');
  }
}
