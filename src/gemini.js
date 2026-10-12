const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function friendlyError(status, body, model) {
  const message = body?.error?.message || '';
  if (status === 400 && /api key/i.test(message)) return 'Gemini rejected the API key. Check GEMINI_API_KEY in your .env file.';
  if (status === 403) return `Gemini denied access (403). The key may lack permission for the Generative Language API. ${message}`;
  if (status === 404) return `Gemini model "${model}" was not found or does not support generateContent. Set GEMINI_MODEL in .env to an available model. ${message}`;
  if (status === 429) return `Gemini rate limit or quota exceeded (429). Wait and retry, or use a different model. ${message}`;
  return `Gemini request failed (${status}). ${message}`.trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls Gemini generateContent and returns the concatenated text of the first candidate.
 */
export async function generateContent({ apiKey, model, system, prompt, temperature = 0.2, timeoutMs = 300_000, signal }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set. Add it to the .env file in the work_load_understand folder.');
  const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature },
  };

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1500 * 2 ** (attempt - 1));
    let res;
    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any?.([signal, timeout]) ?? timeout : timeout,
      });
    } catch (err) {
      if (err?.name === 'TimeoutError') throw new Error(`Gemini did not respond within ${Math.round(timeoutMs / 1000)}s.`);
      lastError = new Error(`Could not reach Gemini: ${err.message}`);
      continue;
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      lastError = new Error(friendlyError(res.status, json, model));
      if (RETRYABLE.has(res.status)) continue;
      throw lastError;
    }

    if (json?.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the request: ${json.promptFeedback.blockReason}.`);
    }
    const candidate = json?.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .filter((p) => typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('');
    if (!text) throw new Error(`Gemini returned no text (finish reason: ${candidate?.finishReason || 'unknown'}).`);
    const notes = [];
    if (candidate.finishReason === 'MAX_TOKENS') notes.push('Output was cut off because the model reached its maximum output length.');
    return { text, notes, usage: json.usageMetadata || null };
  }
  throw lastError;
}
