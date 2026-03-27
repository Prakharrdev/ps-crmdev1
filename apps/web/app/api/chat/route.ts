// app/api/chat/route.ts — Server-side Gemini proxy (keeps API key safe)

import { NextRequest, NextResponse } from "next/server";
import { SYSTEM_PROMPT } from "@/lib/gemini";
import type { ChatMessage, GeminiResponse, ExtractedComplaint } from "@/lib/gemini";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ??
  process.env.GOOGLE_API_KEY ??
  process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const GEMINI_PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL ?? "gemini-2.5-flash";
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-2.0-flash";
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "https://jansamadhan.perkkk.dev",
  "https://api.jansamadhan.perkkk.dev",
]);

interface GeminiApiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

interface GeminiCandidate {
  content: { parts: { text: string }[] };
}

interface GeminiApiResponse {
  candidates?: GeminiCandidate[];
  error?: { message: string; status?: string; code?: number };
}

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function withCors(req: NextRequest, init?: ResponseInit): ResponseInit {
  const origin = req.headers.get("origin");
  return {
    ...init,
    headers: {
      ...getCorsHeaders(origin),
      ...(init?.headers ?? {}),
    },
  };
}

function toConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function sanitizeExtracted(value: unknown): ExtractedComplaint | null {
  if (!value || typeof value !== "object") return null;

  const v = value as Record<string, unknown>;
  const title = typeof v.title === "string" ? v.title.trim() : "";
  const issueType = typeof v.issue_type === "string" ? v.issue_type.trim() : "";
  const severity = typeof v.severity === "string" ? v.severity.trim() : "";
  const description = typeof v.description === "string" ? v.description.trim() : "";

  if (!title || !issueType || !severity || !description) return null;

  return {
    title,
    issue_type: issueType,
    severity,
    description,
    confidence: toConfidence(v.confidence),
  };
}

/**
 * POST /api/chat
 * Accepts conversation messages and proxies them to Google Gemini.
 * Returns a structured GeminiResponse (reply + optional extracted complaint).
 */
export async function POST(req: NextRequest): Promise<NextResponse<GeminiResponse | { error: string }>> {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "Gemini API key not configured (set GEMINI_API_KEY or GOOGLE_API_KEY)" },
      withCors(req, { status: 500 }),
    );
  }

  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: "Origin not allowed" }, withCors(req, { status: 403 }));
  }

  const body = await req.json().catch(() => null);
  if (!body?.messages || !Array.isArray(body.messages)) {
    return NextResponse.json(
      { error: "messages array is required" },
      withCors(req, { status: 400 }),
    );
  }

  const messages = body.messages as ChatMessage[];
  const language = body.language as string | undefined;

  // Build Gemini API contents: system instruction + conversation history
  const systemPrompt = language 
    ? `${SYSTEM_PROMPT}\n\nCRITICAL INSTRUCTION: You MUST strictly reply in the language with the ISO code "${language}". Even if the user speaks in English, your conversational responses AND the 'reply' field in your JSON MUST be localized entirely in the language corresponding to "${language}".`
    : SYSTEM_PROMPT;

  const contents: GeminiApiContent[] = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: "Understood. I am JanSamadhan AI, ready to help Delhi citizens report civic issues in the requested language." }] },
    ...messages.map((m) => ({
      role: m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.text }],
    })),
  ];

  try {
    const models = [GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL].filter(
      (v, i, arr) => Boolean(v) && arr.indexOf(v) === i,
    );

    let data: GeminiApiResponse | null = null;
    let quotaFailure = false;

    for (const model of models) {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
          }),
        },
      );

      data = (await geminiRes.json()) as GeminiApiResponse;
      console.error(`[Gemini ${model}] raw:`, JSON.stringify(data));  // ← ADD THIS

      if (!data.error) {
        quotaFailure = false;
        break;
      }

      const isQuota =
        data.error.code === 429 ||
        data.error.status === "RESOURCE_EXHAUSTED" ||
        /quota|resource_exhausted/i.test(data.error.message);

      const isNotFound =
        data.error.code === 404 ||
        data.error.status === "NOT_FOUND" ||
        /not found|unsupported/i.test(data.error.message);

      if (isQuota) {
        quotaFailure = true;
        continue;
      }

      if (isNotFound) {
        // Model ID may be unavailable for this API version/project; try next model.
        continue;
      }

      return NextResponse.json({ error: data.error.message }, withCors(req, { status: 502 }));
    }

    if (!data || data.error) {
      const status = quotaFailure ? 429 : 502;
      const message = quotaFailure
        ? "Gemini quota exhausted. Please retry shortly or switch to a billed Gemini project."
        : (data?.error?.message ?? "Gemini request failed");
      return NextResponse.json({ error: message }, withCors(req, { status }));
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!rawText) {
      return NextResponse.json({ error: "Empty response from Gemini" }, withCors(req, { status: 502 }));
    }

    // Try to parse extracted complaint JSON from code block
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as { extracted?: unknown; reply?: unknown };
        const extracted = sanitizeExtracted(parsed.extracted);
        const reply = typeof parsed.reply === "string" && parsed.reply.trim()
          ? parsed.reply
          : "Please review the complaint summary and type YES to submit.";

        return NextResponse.json({
          reply,
          extracted,
        }, withCors(req));
      } catch {
        // Malformed JSON — fall through to plain text
      }
    }

    // Plain conversational reply
    return NextResponse.json({ reply: rawText.trim(), extracted: null }, withCors(req));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gemini request failed";
    return NextResponse.json({ error: message }, withCors(req, { status: 502 }));
  }
}

export async function OPTIONS(req: NextRequest): Promise<Response> {
  const origin = req.headers.get("origin");

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response(null, withCors(req, { status: 403 }));
  }

  return new Response(null, withCors(req, { status: 204 }));
}
