"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { measureProsody } from "../../services/truaccent/score";
import type { ProsodyMeasurement } from "../../services/truaccent/types";

export type RecorderState = "idle" | "requesting" | "recording" | "processing" | "error";

export interface Recording {
  blob: Blob;
  prosody: ProsodyMeasurement;
}

interface UseAudioRecorderOptions {
  /** Hard ceiling so a stuck press can't record forever. */
  maxDurationMs?: number;
}

/**
 * Microphone capture over MediaRecorder, plus a live level meter from a Web
 * Audio AnalyserNode so the learner can see the mic is actually hearing them
 * before they find out the transcript was empty.
 *
 * The recorded blob is decoded after the fact to measure prosody, since the
 * analyser's real-time data is too coarse for duration and pause structure.
 */
export function useAudioRecorder({ maxDurationMs = 15000 }: UseAudioRecorderOptions = {}) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setLevel(0);
  }, []);

  // Releasing the mic on unmount matters: otherwise the browser keeps showing
  // the recording indicator after the user has navigated away.
  useEffect(() => teardown, [teardown]);

  const isSupported =
    typeof window !== "undefined" && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

  const start = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError("Este navegador no permite grabar audio.");
      setState("error");
      return false;
    }

    setError(null);
    setState("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "El micrófono está bloqueado. Permite el acceso en el navegador e intenta de nuevo."
          : name === "NotFoundError"
            ? "No se encontró un micrófono."
            : "No se pudo abrir el micrófono."
      );
      setState("error");
      return false;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorderRef.current = recorder;
    recorder.start();

    // Live level meter.
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);

    const tick = () => {
      analyser.getFloatTimeDomainData(buffer);
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i += 1) sumSquares += buffer[i] * buffer[i];
      setLevel(Math.min(1, Math.sqrt(sumSquares / buffer.length) * 4));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    stopTimerRef.current = window.setTimeout(() => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    }, maxDurationMs);

    setState("recording");
    return true;
  }, [isSupported, maxDurationMs]);

  const stop = useCallback(
    async (expectedPhrase: string): Promise<Recording | null> => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        teardown();
        setState("idle");
        return null;
      }

      setState("processing");

      const blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        recorder.stop();
      });

      recorderRef.current = null;
      teardown();

      if (blob.size === 0) {
        setError("No se grabó nada.");
        setState("error");
        return null;
      }

      // Decode in a fresh context — the capture context is closed by teardown.
      let prosody: ProsodyMeasurement;
      try {
        const decodeContext = new AudioContext();
        const decoded = await decodeContext.decodeAudioData(await blob.arrayBuffer());
        prosody = measureProsody(decoded.getChannelData(0), decoded.sampleRate, expectedPhrase);
        await decodeContext.close();
      } catch {
        setError("No se pudo analizar el audio grabado.");
        setState("error");
        return null;
      }

      setState("idle");
      return { blob, prosody };
    },
    [teardown]
  );

  const cancel = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    teardown();
    setState("idle");
  }, [teardown]);

  return { state, error, level, isSupported, start, stop, cancel };
}
