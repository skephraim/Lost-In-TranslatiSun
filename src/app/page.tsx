"use client";

import { useState } from "react";
import { VisualImmersionGrid } from "../components/VisualImmersionGrid";
import { SCENE_BANK } from "../data/scene_bank";
import { DEFAULT_RESPONSE_TYPE, type Scene, type SceneTile } from "../types/scene";

/**
 * Phase 2 harness: drives <VisualImmersionGrid /> straight from the scene
 * bank so every mode is reachable in a browser. Phase 5 replaces this with
 * the real lesson, where scenes arrive from the LangGraph over SSE.
 */
export default function Page() {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState({ right: 0, total: 0 });

  const template = SCENE_BANK[index];
  const scene: Scene = {
    ...template,
    id: `demo-${index}`,
    expectedResponseType: DEFAULT_RESPONSE_TYPE[template.mode],
  };

  function handleAnswer(tile: SceneTile) {
    setScore((s) => ({ right: s.right + (tile.isCorrect ? 1 : 0), total: s.total + 1 }));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center px-4 py-10">
      <div className="mb-8 flex w-full max-w-3xl flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RosettaMAIC</h1>
          <p className="text-sm text-text-muted">Español latinoamericano · inmersión visual</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-accent-soft px-3 py-1 font-semibold text-accent">A1.1</span>
          <span className="text-text-muted">
            {score.right}/{score.total} correctas
          </span>
        </div>
      </div>

      <VisualImmersionGrid
        scene={scene}
        onAnswer={handleAnswer}
        onSpeechRequest={() => window.alert("El micrófono llega en la Fase 3.")}
      />

      <nav className="mt-8 flex w-full max-w-3xl items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIndex((i) => (i - 1 + SCENE_BANK.length) % SCENE_BANK.length)}
          className="rounded-full border border-border-soft px-4 py-2 text-sm font-medium transition hover:border-accent hover:text-accent"
        >
          Anterior
        </button>
        <span className="text-xs text-text-muted">
          Ejercicio {index + 1} de {SCENE_BANK.length} · modo {template.mode}
        </span>
        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % SCENE_BANK.length)}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Siguiente
        </button>
      </nav>
    </main>
  );
}
