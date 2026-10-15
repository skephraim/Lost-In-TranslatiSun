import { SpeechUnavailableError, type SpeechRecognizer, type TranscriptionResult } from "./types";

/**
 * Batch recognizer that POSTs the recording to this app's own /api/asr
 * route, which forwards it to Whisper. Unlike the browser engine this works
 * in any browser and can run entirely on your own infrastructure (see the
 * route for pointing it at a local whisper.cpp or faster-whisper server).
 *
 * Whisper returns no per-utterance confidence, so `confidence` is null and
 * the scorer simply works without it.
 */
export class WhisperSpeechRecognizer implements SpeechRecognizer {
  readonly id = "whisper";
  readonly kind = "batch" as const;

  #aborter: AbortController | null = null;

  isAvailable(): boolean {
    // The route answers for itself at call time; nothing to feature-detect
    // client-side. Availability failures surface as a clear error instead.
    return true;
  }

  begin(): void {
    this.#aborter = new AbortController();
  }

  async finish(audio: Blob): Promise<TranscriptionResult> {
    const form = new FormData();
    form.append("audio", audio, "utterance.webm");

    let response: Response;
    try {
      response = await fetch("/api/asr", { method: "POST", body: form, signal: this.#aborter?.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new SpeechUnavailableError("Transcripción cancelada.");
      }
      throw new SpeechUnavailableError("No se pudo contactar el servicio de transcripción.");
    } finally {
      this.#aborter = null;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new SpeechUnavailableError(detail || `El servicio de transcripción respondió ${response.status}.`);
    }

    const data = (await response.json()) as { transcript?: string };
    if (!data.transcript) {
      throw new SpeechUnavailableError("No se escuchó nada. Intenta de nuevo, más cerca del micrófono.");
    }

    return { transcript: data.transcript.trim(), confidence: null, engine: this.id };
  }

  cancel(): void {
    this.#aborter?.abort();
    this.#aborter = null;
  }
}
