// app/api/stt/route.ts — Server-side proxy for Sarvam Saaras v3 STT
// Keeps the SARVAM_API_KEY on the server; the client only sends audio.

import { NextRequest, NextResponse } from "next/server";

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";

export async function POST(req: NextRequest) {
  if (!SARVAM_API_KEY) {
    return NextResponse.json(
      { error: "SARVAM_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("file");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: "No audio file provided. Send a 'file' field with audio data." },
        { status: 400 },
      );
    }

    // Read the language the user selected in the UI (sent via X-Language header).
    const languageCode = req.headers.get("X-Language")?.trim();

    if (!languageCode) {
      return NextResponse.json(
        { error: "X-Language header is required." },
        { status: 400 },
      );
    }

    // Build the request to Sarvam STT API.
    // Sarvam rejects MIME types with codec parameters (e.g. "audio/webm;codecs=opus"),
    // so we strip to the base type ("audio/webm") before forwarding.
    const rawMime = audioFile.type || "audio/webm";
    const baseMime = rawMime.split(";")[0].trim();  // "audio/webm;codecs=opus" → "audio/webm"
    const cleanBlob = new Blob([await audioFile.arrayBuffer()], { type: baseMime });

    const sarvamForm = new FormData();
    sarvamForm.append("file", cleanBlob, "recording.webm");
    sarvamForm.append("model", "saaras:v3");
    sarvamForm.append("language_code", languageCode);
    sarvamForm.append("mode", "transcribe");          // keep original language

    const sarvamRes = await fetch(SARVAM_STT_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": SARVAM_API_KEY,
      },
      body: sarvamForm,
    });

    if (!sarvamRes.ok) {
      const errBody = await sarvamRes.text();
      console.error("[Sarvam STT] Error:", sarvamRes.status, errBody);
      return NextResponse.json(
        { error: `Sarvam STT failed (${sarvamRes.status}): ${errBody}` },
        { status: 502 },
      );
    }

    const result = await sarvamRes.json();

    return NextResponse.json({
      transcript: result.transcript ?? "",
      language_code: result.language_code,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "STT request failed";
    console.error("[Sarvam STT] Exception:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
