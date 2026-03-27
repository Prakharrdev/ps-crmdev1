// lib/gemini.ts — Gemini AI conversational client for civic complaint extraction

/** Shape of a single conversation message */
export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

/** Structured complaint data extracted by Gemini */
export interface ExtractedComplaint {
  title: string;
  issue_type: string;
  severity: string;
  description: string;
  confidence: number;
}

/** Shape returned from Gemini: either a reply or an extraction */
export interface GeminiResponse {
  reply: string;
  extracted: ExtractedComplaint | null;
}

const SYSTEM_PROMPT = `You are JanSamadhan AI, a helpful civic complaint assistant for Delhi municipal services.
Your job: have a short, friendly conversation with the citizen to collect ALL required fields for their complaint summary, then output structured JSON.

REQUIRED FIELDS:
- title (5-10 word summary)
- issue_type (short issue class like road_damage, garbage, water_leakage, street_light, traffic, safety)
- severity (Low, Medium, High, or Critical)
- description (2-3 sentences)
- confidence (float between 0 and 1)

RULES:
1. Greet warmly on the first message. Ask what issue they want to report.
2. If the user's message is unclear, ask a specific clarifying question. Never make up data.
3. When you still need info, reply in plain conversational text. Do NOT output JSON yet.
4. Hard restriction: do not generate or infer any location data (ward, pincode, authority, city, latitude, longitude, or address). If asked for location details, ask the user to provide it for submission flow, but do not include it in extracted JSON.
5. Once you have ALL required fields, respond with ONLY a JSON block wrapped in \`\`\`json ... \`\`\` containing:
{
  "extracted": {
    "title": "...",
    "issue_type": "...",
    "severity": "Low|Medium|High|Critical",
    "description": "...",
    "confidence": 0.0
  },
  "reply": "Here is your complaint summary. Please review and type YES to submit."
}
6. If user says something unrelated to civic issues, politely redirect.
7. Keep responses concise (2-3 sentences max unless listing confirmation).
8. Be empathetic — the citizen is reporting a real problem.`;

/**
 * Send the conversation history to Gemini and get a response.
 * Calls the Next.js API route to keep the API key server-side.
 */
export async function sendToGemini(messages: ChatMessage[], language?: string): Promise<GeminiResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, language }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? "Failed to contact AI assistant");
  }

  return res.json() as Promise<GeminiResponse>;
}

/** Export system prompt for server-side use */
export { SYSTEM_PROMPT };
