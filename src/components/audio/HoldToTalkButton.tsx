"use client";

import { useCallback, useRef, useState } from "react";
import { Mic, Loader2 } from "lucide-react";
import { useAudioRecorder } from "./useAudioRecorder";
import { resolveRecognizer, SpeechUnavailableError, type SpeechRecognizer } from "../../services/asr";
import { scorePronunciation } from "../../services/truaccent/score";
import type { TruAccentReport } from "../../services/truaccent/types";

export interface HoldToTalkButtonProps {
  expectedPhrase: string;
  onReport: (report: TruAccentReport) => void;
  disabled?: boolean;
}

/**
 * Press and hold to record; release to transcribe and score.
 *
 * Recording and recognition run in parallel rather than in sequence: the
 * live engine listens to the microphone directly while MediaRecorder
 * captures the same stream. That way one press yields both a transcript and
 * an audio blob to measure prosody from — a live engine never surfaces the
 * audio itself, so recording alongside it is the only way to get both.
 */
export function HoldToTalkButton({ expectedPhrase, onReport, disabled }: HoldToTalkButtonProps) {
  const recorder = useAudioRecorder();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  const holdingRef = useRef(false);

  const begin = useCallback(async () => {
    if (disabled || busy || holdingRef.current) return;
    holdingRef.current = true;
    setProblem(null);

    const started = await recorder.start();
    if (!started) {
      holdingRef.current = false;
      return;
    }

    try {
      const recognizer = resolveRecognizer();
      recognizer.begin();
      recognizerRef.current = recognizer;
    } catch (error) {
      // Recording still works without recognition, but without a transcript
      // there is nothing to score, so stop rather than record uselessly.
      recorder.cancel();
      holdingRef.current = false;
      setProblem(error instanceof Error ? error.message : "No se pudo iniciar el reconocimiento de voz.");
    }
  }, [busy, disabled, recorder]);

  const end = useCallback(async () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;

    const recognizer = recognizerRef.current;
    recognizerRef.current = null;
    setBusy(true);

    try {
      const recording = await recorder.stop(expectedPhrase);
      if (!recording) {
        recognizer?.cancel();
        return;
      }

      if (!recognizer) {
        setProblem("No hay motor de reconocimiento disponible.");
        return;
      }

      const result = await recognizer.finish(recording.blob);
      onReport(
        scorePronunciation({
          expectedPhrase,
          transcript: result.transcript,
          confidence: result.confidence,
          prosody: recording.prosody,
        })
      );
    } catch (error) {
      setProblem(
        error instanceof SpeechUnavailableError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Algo falló al transcribir."
      );
    } finally {
      setBusy(false);
    }
  }, [expectedPhrase, onReport, recorder]);

  const recording = recorder.state === "recording";
  const message = problem ?? recorder.error;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={disabled || busy || !recorder.isSupported}
        onPointerDown={begin}
        onPointerUp={end}
        onPointerLeave={end}
        // Keyboard equivalent: hold space/enter while focused.
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            void begin();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            void end();
          }
        }}
        aria-label="Mantén para hablar"
        aria-pressed={recording}
        className={[
          "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition",
          "disabled:cursor-not-allowed disabled:opacity-50",
          recording ? "bg-incorrect" : "bg-accent hover:opacity-90",
        ].join(" ")}
      >
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
        {busy ? "Analizando..." : recording ? "Escuchando..." : "Mantén para hablar"}
      </button>

      {recording ? (
        // Live level meter, so a dead mic is obvious before the transcript
        // comes back empty.
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-border-soft" aria-hidden="true">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(recorder.level * 100)}%` }} />
        </div>
      ) : null}

      {!recorder.isSupported ? (
        <p className="max-w-xs text-right text-xs text-text-muted">Este navegador no permite grabar audio.</p>
      ) : message ? (
        <p role="alert" className="max-w-xs text-right text-xs text-incorrect">
          {message}
        </p>
      ) : null}
    </div>
  );
}
