import { BrowserSpeechRecognizer } from "./browser";
import { WhisperSpeechRecognizer } from "./whisper";
import type { SpeechRecognizer } from "./types";

export * from "./types";
export { BrowserSpeechRecognizer } from "./browser";
export { WhisperSpeechRecognizer } from "./whisper";

/**
 * Picks a recognizer. `NEXT_PUBLIC_ASR_ENGINE=whisper` forces the server
 * route; otherwise the browser engine is preferred when present because it
 * needs no key, and Whisper is the fallback for browsers without it
 * (notably Firefox).
 */
export function resolveRecognizer(): SpeechRecognizer {
  if (process.env.NEXT_PUBLIC_ASR_ENGINE === "whisper") {
    return new WhisperSpeechRecognizer();
  }
  const browser = new BrowserSpeechRecognizer();
  return browser.isAvailable() ? browser : new WhisperSpeechRecognizer();
}
