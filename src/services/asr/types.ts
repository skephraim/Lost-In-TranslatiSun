/**
 * Speech recognition contract, so the UI never learns which engine is behind it.
 *
 * The two engine families work differently and the interface has to respect
 * that rather than pretend otherwise. The Web Speech API listens to the
 * microphone itself and hands back words; Whisper takes a finished audio
 * file. Modelling everything as `transcribe(blob)` would be a lie for the
 * former — it never sees a blob.
 *
 * So the interface follows the RECORDING LIFECYCLE, which both fit honestly:
 * `begin()` when the learner presses the mic, `finish(audio)` when they
 * release it. A live engine starts listening on begin and ignores the blob
 * on finish; a batch engine no-ops on begin and uploads the blob on finish.
 */

export interface TranscriptionResult {
  transcript: string;
  /** 0-1 where the engine reports one. Whisper does not, so null. */
  confidence: number | null;
  /** Which engine produced this, for display and debugging. */
  engine: string;
}

export type RecognizerKind = "live" | "batch";

export interface SpeechRecognizer {
  readonly id: string;
  readonly kind: RecognizerKind;
  /** Whether this engine can run in the current environment. */
  isAvailable(): boolean;
  /** Called when recording starts. Live engines begin listening here. */
  begin(): void;
  /** Called when recording stops. Batch engines transcribe the blob. */
  finish(audio: Blob): Promise<TranscriptionResult>;
  /** Abandon without producing a result. */
  cancel(): void;
}

export class SpeechUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeechUnavailableError";
  }
}
