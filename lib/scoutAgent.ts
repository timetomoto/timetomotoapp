import { buildScoutSystemPrompt } from './scoutPrompt';
import { SCOUT_TOOL_DEFINITIONS, executeScoutTool } from './scoutTools';
import type { ScoutMessage, ScoutContext } from './scoutTypes';

// ---------------------------------------------------------------------------
// Gemini agent core for Scout
// ---------------------------------------------------------------------------

const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY ?? '';
const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const MAX_TOOL_ROUNDS = 6;
const TIMEOUT_MS = 30000;
const HISTORY_WINDOW = 10;

// ── Request cancellation ─────────────────────────────────────────────────

let activeAbortController: AbortController | null = null;

/** Abort any in-flight Scout request (called on panel close or new message). */
export function abortScoutRequest(): void {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

// ── Gemini request / response shapes ────────────────────────────────────

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, any> };
  functionResponse?: { name: string; response: { content: string } };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiRequest {
  systemInstruction: { parts: [{ text: string }] };
  contents: GeminiContent[];
  tools: { functionDeclarations: typeof SCOUT_TOOL_DEFINITIONS };
  generationConfig: { maxOutputTokens: number; temperature: number; thinkingConfig?: { thinkingBudget: number } };
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Send a user message through Scout's Gemini-powered agent.
 * Handles function-calling loops (up to 6 rounds) and always returns
 * a plain text result — never throws.
 */
export async function sendScoutMessage(
  userMessage: string,
  conversationHistory: ScoutMessage[],
  context: ScoutContext,
): Promise<{ text: string; toolsExecuted: string[] }> {
  // Abort any previous in-flight request
  abortScoutRequest();

  const controller = new AbortController();
  activeAbortController = controller;
  const toolsExecuted: string[] = [];

  try {
    if (!GEMINI_KEY) {
      return { text: "Scout isn't configured yet — the Gemini API key is missing.", toolsExecuted };
    }

    // 1. Build system prompt
    const systemPrompt = buildScoutSystemPrompt(context);

    // 2. Format conversation history as Gemini messages (windowed)
    const windowed = conversationHistory.slice(-HISTORY_WINDOW);
    const contents: GeminiContent[] = windowed.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    // Append the new user message
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    // 3. First Gemini call
    let response = await callGemini(systemPrompt, contents, controller.signal);

    // 4. Function-calling loop
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const functionCalls = extractFunctionCalls(response);
      if (functionCalls.length === 0) break;

      // Execute tool calls sequentially so each sees the store mutations from prior calls
      functionCalls.forEach((fc) => toolsExecuted.push(fc.name));
      const results: string[] = [];
      for (const fc of functionCalls) {
        try {
          results.push(await executeScoutTool(fc.name, fc.args, context));
        } catch (err: any) {
          results.push(`Tool "${fc.name}" failed: ${err?.message ?? 'unknown error'}`);
        }
      }
      const responseParts: GeminiPart[] = functionCalls.map((fc, i) => ({
        functionResponse: {
          name: fc.name,
          response: { content: results[i] },
        },
      }));

      // Add model's function-call turn + our function-response turn
      const modelParts: GeminiPart[] = functionCalls.map((fc) => ({
        functionCall: { name: fc.name, args: fc.args },
      }));
      contents.push({ role: 'model', parts: modelParts });
      contents.push({ role: 'user', parts: responseParts });

      // Next Gemini call with tool results
      response = await callGemini(systemPrompt, contents, controller.signal);
    }

    // 5. Extract final text
    const text = extractText(response);
    if (!text) {
      return { text: "I didn't get a clear answer. Try rephrasing.", toolsExecuted };
    }

    return { text, toolsExecuted };
  } catch (err: any) {
    // Silent return on abort (user closed Scout or sent a new message)
    if (err?.name === 'AbortError') {
      return { text: '', toolsExecuted };
    }
    console.error('[Scout] sendScoutMessage error:', err);
    if (err?.message?.includes('Network') || err?.message?.includes('fetch')) {
      return { text: "I'm having trouble connecting. Check your signal and try again.", toolsExecuted };
    }
    return { text: 'Something went wrong on my end. Try again in a moment.', toolsExecuted };
  } finally {
    if (activeAbortController === controller) {
      activeAbortController = null;
    }
  }
}

// ── Internal helpers ────────────────────────────────────────────────────

async function callGemini(
  systemPrompt: string,
  contents: GeminiContent[],
  signal: AbortSignal,
): Promise<GeminiResponse> {
  const body: GeminiRequest = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    tools: { functionDeclarations: SCOUT_TOOL_DEFINITIONS },
    generationConfig: { maxOutputTokens: 4096, temperature: 0.7, thinkingConfig: { thinkingBudget: 1024 } },
  };

  const timer = setTimeout(() => {
    // Only abort via timeout if this specific signal isn't already aborted
    if (!signal.aborted) {
      // Create a timeout-specific error by aborting with reason
    }
  }, TIMEOUT_MS);

  // Combine the external abort signal with a timeout
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal.addEventListener('abort', onExternalAbort);
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    clearTimeout(timer);
    const res = await fetch(`${ENDPOINT}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    signal.removeEventListener('abort', onExternalAbort);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini API ${res.status}: ${errBody}`);
    }

    return (await res.json()) as GeminiResponse;
  } catch (err) {
    clearTimeout(timeoutId);
    signal.removeEventListener('abort', onExternalAbort);
    throw err;
  }
}

function extractFunctionCalls(
  response: GeminiResponse,
): Array<{ name: string; args: Record<string, any> }> {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p): p is GeminiPart & { functionCall: NonNullable<GeminiPart['functionCall']> } =>
      p.functionCall != null,
    )
    .map((p) => ({
      name: p.functionCall!.name,
      args: p.functionCall!.args ?? {},
    }));
}

function extractText(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => typeof p.text === 'string')
    .map((p) => p.text!)
    .join('')
    .trim();
}
