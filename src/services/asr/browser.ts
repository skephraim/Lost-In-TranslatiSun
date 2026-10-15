import { SpeechUnavailableError, type SpeechRecognizer, type TranscriptionResult } from "./types";

/**
 * Web Speech API recognizer, configured for Latin American Spanish.
 *
 * Needs no backend and no API key, which makes it the right default for
 * development. Two caveats worth knowing: it is Chromium-and-Safari only
 * (Firefox does not ship it), and in Chrome the audio is sent to Google's
 * servers for recognition, so it is not an offline or private path. Use the
 * Whisper recognizer behind your own infrastructure when that matters.
 */

// The API is still vendor-prefixed and absent from the standard DOM types.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  results: { readonly length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export class BrowserSpeechRecognizer implements SpeechRecognizer {
  readonly id = "web-speech";
  readonly kind = "live" as const;

  #recognition: SpeechRecognitionLike | null = null;
  #best: TranscriptionResult | null = null;
  #error: string | null = null;
  #ended = false;

  isAvailable(): boolean {
    return getConstructor() !== null;
  }

  begin(): void {
    const Constructor = getConstructor();
    if (!Constructor) {
      throw new SpeechUnavailableError("Este navegador no tiene reconocimiento de voz. Prueba Chrome, o configura Whisper.");
    }

    this.#best = null;
    this.#error = null;
    this.#ended = false;

    const recognition = new Constructor();
    recognition.lang = "es-MX";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      // Keep the highest-confidence final alternative seen in this session.
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result.isFinal || result.length === 0) continue;
        const alternative = result[0];
        const confidence = Number.isFinite(alternative.confidence) ? alternative.confidence : null;
        if (!this.#best || (confidence ?? 0) >= (this.#best.confidence ?? 0)) {
          this.#best = { transcript: alternative.transcript.trim(), confidence, engine: this.id };
        }
      }
    };

    recognition.onerror = (event) => {
      this.#error = event.error;
    };

    recognition.onend = () => {
      this.#ended = true;
    };

    this.#recognition = recognition;
    recognition.start();
  }

  async finish(_audio: Blob): Promise<TranscriptionResult> {
    const recognition = this.#recognition;
    if (!recognition) throw new SpeechUnavailableError("finish() llamado sin begin().");

    recognition.stop();
    // Recognition resolves asynchronously after stop(); wait for onend
    // rather than racing it, with a ceiling so a wedged engine can't hang
    // the UI forever.
    await this.#waitForEnd(4000);
    this.#recognition = null;

    if (this.#error && !this.#best) {
      throw new SpeechUnavailableError(ERROR_MESSAGES[this.#error] ?? `Error de reconocimiento: ${this.#error}`);
    }
    if (!this.#best) {
      throw new SpeechUnavailableError("No se escuchó nada. Intenta de nuevo, más cerca del micrófono.");
    }
    return this.#best;
  }

  cancel(): void {
    this.#recognition?.abort();
    this.#recognition = null;
    this.#best = null;
  }

  async #waitForEnd(timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    while (!this.#ended && Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  "no-speech": "No se escuchó nada. Intenta de nuevo, más cerca del micrófono.",
  "audio-capture": "No se encontró un micrófono.",
  "not-allowed": "El navegador bloqueó el micrófono. Permite el acceso e intenta de nuevo.",
  network: "El reconocimiento de voz necesita conexión a internet.",
};
