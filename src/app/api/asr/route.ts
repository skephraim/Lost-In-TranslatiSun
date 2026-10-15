import { NextResponse } from "next/server";

/**
 * Whisper transcription endpoint.
 *
 * Forwards the recording to any OpenAI-compatible `/audio/transcriptions`
 * service. That covers the hosted OpenAI API as well as self-hosted
 * whisper.cpp (`whisper-server`), faster-whisper-server and LocalAI, so the
 * audio need never leave your own machine — point ASR_BASE_URL at the local
 * server and leave ASR_API_KEY unset.
 *
 * `language: "es"` is pinned so Whisper does not have to guess, which both
 * speeds it up and stops short utterances being misdetected as Portuguese
 * or Italian.
 */

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const baseUrl = process.env.ASR_BASE_URL ?? "https://api.openai.com/v1";
  const apiKey = process.env.ASR_API_KEY;
  const model = process.env.ASR_MODEL ?? "whisper-1";
  const isLocal = /localhost|127\.0\.0\.1/.test(baseUrl);

  if (!apiKey && !isLocal) {
    return NextResponse.json(
      { error: "Falta ASR_API_KEY. Configúrala en .env.local, o apunta ASR_BASE_URL a un servidor Whisper local." },
      { status: 503 }
    );
  }

  const form = await request.formData();
  const audio = form.get("audio");

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "Se esperaba un archivo de audio en el campo 'audio'." }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ error: "El audio está vacío." }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "El audio supera el límite de 25 MB." }, { status: 413 });
  }

  const upstream = new FormData();
  upstream.append("file", audio, audio.name || "utterance.webm");
  upstream.append("model", model);
  upstream.append("language", "es");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      body: upstream,
    });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar el servicio de transcripción." }, { status: 502 });
  }

  if (!response.ok) {
    // Deliberately does not forward the upstream body, which can echo the
    // Authorization header back in some error shapes.
    return NextResponse.json({ error: `El servicio de transcripción respondió ${response.status}.` }, { status: 502 });
  }

  const data = (await response.json()) as { text?: string };
  return NextResponse.json({ transcript: data.text ?? "" });
}
