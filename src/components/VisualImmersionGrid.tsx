"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Mic, Volume2, X } from "lucide-react";
import { SceneArt } from "./SceneArt";
import type { Scene, SceneTile } from "../types/scene";

/** Speaks Spanish text with the browser's own TTS, preferring an es-MX voice. */
function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  utterance.voice =
    voices.find((v) => v.lang === "es-MX") ??
    voices.find((v) => v.lang.startsWith("es-") && v.lang !== "es-ES") ??
    voices.find((v) => v.lang.startsWith("es")) ??
    null;
  utterance.lang = "es-MX";
  // Elena's cadence: slightly under natural speed for beginner comprehension.
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export interface VisualImmersionGridProps {
  scene: Scene;
  /** Called with the chosen tile once the learner commits to an answer. */
  onAnswer?: (tile: SceneTile) => void;
  /** Hold-to-talk handler. Phase 3 wires this to the ASR pipeline. */
  onSpeechRequest?: () => void;
}

type TileStatus = "idle" | "correct" | "incorrect";

export function VisualImmersionGrid({ scene, onAnswer, onSpeechRequest }: VisualImmersionGridProps) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const answeredRef = useRef(false);

  // A new scene is a fresh question — clear whatever the last one answered.
  useEffect(() => {
    setChosenId(null);
    setReplayingId(null);
    answeredRef.current = false;
  }, [scene.id]);

  // When the graph expects speech, clicking a tile must not count as the
  // answer — the target is already highlighted, so a click would just be
  // reading it back. Selection is only an answer when a selection is asked for.
  const selectable = scene.expectedResponseType !== "speech";

  const choose = useCallback(
    (tile: SceneTile) => {
      if (!selectable || answeredRef.current) return;
      answeredRef.current = true;
      setChosenId(tile.id);
      speak(tile.audioText);
      onAnswer?.(tile);
    },
    [onAnswer, selectable]
  );

  // Number keys 1-4 select tiles, so the drill is playable without a mouse.
  useEffect(() => {
    if (!selectable) return;
    function onKeyDown(event: KeyboardEvent) {
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < scene.tiles.length) {
        choose(scene.tiles[index]);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [scene.tiles, choose, selectable]);

  function statusFor(tile: SceneTile): TileStatus {
    if (chosenId === null) return "idle";
    if (tile.id === chosenId) return tile.isCorrect ? "correct" : "incorrect";
    // After a wrong guess, reveal which tile was right.
    if (tile.isCorrect) return "correct";
    return "idle";
  }

  function replay(tile: SceneTile) {
    speak(tile.audioText);
    setReplayingId(tile.id);
    window.setTimeout(() => setReplayingId((id) => (id === tile.id ? null : id)), 900);
  }

  // In listen_select the phrase is heard, never read — showing the caption
  // would turn a listening drill into a reading drill.
  const showCaptions = scene.mode !== "listen_select" || chosenId !== null;
  const highlightTarget = scene.mode === "speak_match";

  return (
    <section className="w-full max-w-3xl">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{MODE_LABEL[scene.mode]}</p>
          <h2 className="mt-1 text-lg font-semibold text-text-main">{MODE_INSTRUCTION[scene.mode]}</h2>
        </div>

        {scene.mode === "listen_select" ? (
          <button
            type="button"
            onClick={() => speak(scene.targetPhrase)}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Volume2 size={16} aria-hidden="true" />
            Escuchar de nuevo
          </button>
        ) : null}

        {scene.mode === "speak_match" ? (
          <button
            type="button"
            onClick={onSpeechRequest}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Mic size={16} aria-hidden="true" />
            Mantén para hablar
          </button>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {scene.tiles.map((tile, index) => {
          const status = statusFor(tile);
          const isTarget = highlightTarget && tile.isCorrect;

          return (
            <div key={tile.id} className="relative">
              <button
                type="button"
                onClick={() => choose(tile)}
                disabled={!selectable || chosenId !== null}
                aria-label={`Opción ${index + 1}`}
                aria-pressed={tile.id === chosenId}
                className={[
                  "group flex w-full flex-col items-center gap-2 rounded-2xl border-2 bg-surface-raised p-4 transition",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  status === "correct"
                    ? "border-correct bg-correct-soft"
                    : status === "incorrect"
                      ? "border-incorrect bg-incorrect-soft"
                      : isTarget
                        ? "border-accent ring-2 ring-accent/30"
                        : "border-border-soft hover:border-accent",
                  !selectable || chosenId !== null ? "cursor-default" : "cursor-pointer",
                ].join(" ")}
              >
                <span className="absolute left-3 top-3 text-xs font-semibold text-text-muted">{index + 1}</span>

                {tile.art ? (
                  <SceneArt art={tile.art} className="h-28 w-28 text-text-main" />
                ) : tile.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tile.imageUrl} alt="" className="h-28 w-28 object-contain" />
                ) : null}

                <span className="min-h-[1.5rem] text-center text-sm font-medium text-text-main">
                  {showCaptions ? tile.audioText : " "}
                </span>
              </button>

              {/* Replay sits outside the choice button so hearing a tile is
                  never mistaken for answering with it. */}
              <button
                type="button"
                onClick={() => replay(tile)}
                aria-label={`Escuchar opción ${index + 1}`}
                className={[
                  "absolute right-3 top-3 rounded-full p-1.5 transition",
                  replayingId === tile.id ? "bg-accent text-white" : "text-text-muted hover:bg-accent-soft hover:text-accent",
                ].join(" ")}
              >
                <Volume2 size={15} aria-hidden="true" />
              </button>

              {status !== "idle" && chosenId !== null ? (
                <span
                  className={[
                    "absolute bottom-3 right-3 rounded-full p-1 text-white",
                    status === "correct" ? "bg-correct" : "bg-incorrect",
                  ].join(" ")}
                >
                  {status === "correct" ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <p role="status" aria-live="polite" className="mt-4 min-h-[1.5rem] text-sm font-medium">
        {chosenId === null ? (
          <span className="text-text-muted">
            {selectable ? "Elige una opción, o pulsa 1-4." : "Pulsa el micrófono y di la frase en voz alta."}
          </span>
        ) : scene.tiles.find((t) => t.id === chosenId)?.isCorrect ? (
          <span className="text-correct">¡Exacto! {scene.targetPhrase}</span>
        ) : (
          <span className="text-incorrect">Casi. La respuesta es: {scene.targetPhrase}</span>
        )}
      </p>
    </section>
  );
}

const MODE_LABEL: Record<Scene["mode"], string> = {
  listen_select: "Escucha y selecciona",
  speak_match: "Habla para emparejar",
  contrastive_deduction: "Deducción contrastiva",
};

const MODE_INSTRUCTION: Record<Scene["mode"], string> = {
  listen_select: "¿Cuál imagen escuchaste?",
  speak_match: "Di la frase de la imagen marcada.",
  contrastive_deduction: "¿Cuál imagen corresponde?",
};
