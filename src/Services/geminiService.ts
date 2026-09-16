// Google Gemini, over the REST API with plain fetch.
//
// No SDK: @google/genai pulls in Node-oriented plumbing that React
// Native has to be polyfilled for, and generateContent is one POST.
//
// ─────────────────────────────────────────────────────────────────────
// SECURITY — read before shipping this
//
// EXPO_PUBLIC_* values are inlined into the JS bundle at build time, so
// anyone who has the APK can extract this key and spend against your
// quota. That is fine for the Firebase config (it is designed to be
// public, and Firestore rules do the protecting) but a Gemini key is a
// BILLING credential with no equivalent guard.
//
// So: direct calls are for local development only. Before release, put
// a server in front — a Firebase Cloud Function that holds the key and
// forwards the prompt — and set EXPO_PUBLIC_GEMINI_PROXY_URL to it.
// Every call site goes through generateText(), so that switch needs no
// changes anywhere else.
// ─────────────────────────────────────────────────────────────────────

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Defaults to the fast, cheap tier. Override with EXPO_PUBLIC_GEMINI_MODEL.
 *
 * Worth knowing: `GET {API_BASE}/models` lists models a key can SEE,
 * which is not the same as models it can CALL. gemini-2.5-flash appears
 * in that list but returns 404 "no longer available to new users" on a
 * new key, pointing at this one instead. Check by actually calling a
 * model, not by finding it in the list.
 */
const MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL ?? 'gemini-3.6-flash';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

/** Set once a server-side proxy exists; see the note above. */
const PROXY_URL = process.env.EXPO_PUBLIC_GEMINI_PROXY_URL ?? '';

export class GeminiServiceError extends Error {
  /** HTTP status, when the failure came from the API rather than the network. */
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GeminiServiceError';
    this.status = status;
  }
}

/** Whether a call can be made at all — no key and no proxy means no. */
export function isGeminiConfigured(): boolean {
  return !!API_KEY || !!PROXY_URL;
}

export interface GenerateOptions {
  /** Steers tone and rules; kept out of the prompt so it can be reused. */
  system?: string;
  /** 0 = deterministic, 1 = default, 2 = maximum spread. */
  temperature?: number;
  /** Caps the reply. Worth setting — these are shown in small cards. */
  maxOutputTokens?: number;
  /** Ask for JSON back rather than prose. */
  json?: boolean;
  /**
   * An OpenAPI-subset schema the reply must conform to. Far stronger
   * than asking for JSON in the prompt: the model is constrained during
   * decoding, so missing keys and stray prose stop being failure modes
   * worth coding around.
   */
  schema?: Record<string, unknown>;
  /**
   * Lets the model reason before answering. Counts against
   * maxOutputTokens on the 3.x models, so leaving it on for a short
   * structured reply silently eats the whole budget — a 200-token cap
   * was spending 190 on thought and truncating the answer to a
   * fragment. Off by default; turn it on for genuinely open-ended work.
   */
  thinking?: boolean;
  /** Aborts a request the user is no longer waiting on. */
  signal?: AbortSignal;
}

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
  finishReason?: string;
}

/**
 * One prompt in, one string out.
 *
 * Routes through the proxy when one is configured, otherwise straight
 * to Google with the local key.
 */
export async function generateText(
  prompt: string,
  options: GenerateOptions = {},
): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new GeminiServiceError(
      'Gemini is not configured — set EXPO_PUBLIC_GEMINI_API_KEY in .env.',
    );
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(options.system
      ? { systemInstruction: { parts: [{ text: options.system }] } }
      : {}),
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 512,
      ...(options.json || options.schema
        ? { responseMimeType: 'application/json' }
        : {}),
      ...(options.schema ? { responseSchema: options.schema } : {}),
      ...(options.thinking ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
    },
  };

  const url = PROXY_URL || `${API_BASE}/models/${MODEL}:generateContent`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The proxy authenticates its own way; the key never leaves the
        // server in that setup.
        ...(PROXY_URL ? {} : { 'x-goog-api-key': API_KEY }),
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    throw new GeminiServiceError(
      err instanceof Error ? err.message : 'Could not reach the AI service.',
    );
  }

  if (!response.ok) {
    // Google returns a JSON error body; fall back to the status text
    // when it is something else entirely (a proxy 502, say).
    let detail = response.statusText;
    try {
      const failure = await response.json();
      detail = failure?.error?.message ?? detail;
    } catch {
      /* non-JSON body — the status is all there is */
    }
    throw new GeminiServiceError(detail, response.status);
  }

  const payload = await response.json();
  const candidate: GeminiCandidate | undefined = payload?.candidates?.[0];

  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) {
    // An empty reply with a finishReason is usually a safety block or
    // the token cap being hit mid-sentence — worth saying which.
    throw new GeminiServiceError(
      candidate?.finishReason
        ? `The model returned nothing (${candidate.finishReason}).`
        : 'The model returned nothing.',
    );
  }
  console.log('Gemini reply:', text);
  return text;
}

/**
 * Same call, parsed as JSON.
 *
 * Models still occasionally wrap JSON in a ```json fence even when asked
 * for application/json, so that is stripped before parsing rather than
 * letting it throw.
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
    throw new GeminiServiceError('The model did not return valid JSON.');
  }
}
