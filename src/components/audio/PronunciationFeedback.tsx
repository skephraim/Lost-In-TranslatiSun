"use client";

import { Check, CircleHelp, X } from "lucide-react";
import { WaveformDisplay } from "./WaveformDisplay";
import type { FindingStatus, TruAccentReport } from "../../services/truaccent/types";

const TARGET_LABEL: Record<string, string> = {
  trilled_rr: "Vibrante «rr»",
  intervocalic_d: "«d» entre vocales",
  vowel_quality: "Vocales puras",
  stress_placement: "Acento tónico",
};

const STATUS_ICON: Record<FindingStatus, typeof Check> = {
  ok: Check,
  missed: X,
  not_assessable: CircleHelp,
};

const STATUS_CLASS: Record<FindingStatus, string> = {
  ok: "text-correct",
  missed: "text-incorrect",
  not_assessable: "text-text-muted",
};

export function PronunciationFeedback({ report }: { report: TruAccentReport }) {
  // Sort so actionable findings come first and un-assessable ones last.
  const order: Record<FindingStatus, number> = { missed: 0, ok: 1, not_assessable: 2 };
  const findings = [...report.findings].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="mt-5 w-full space-y-4">
      <div className="rounded-xl border border-border-soft bg-surface-raised p-4">
        <p className="text-xs uppercase tracking-wider text-text-muted">Te escuché decir</p>
        <p className="mt-1 text-lg font-semibold">{report.transcript || "(nada)"}</p>
        <p className="mt-2 text-sm text-text-muted">
          Objetivo: <span className="font-medium text-text-main">{report.expectedPhrase}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <span className={report.wordsMatched ? "font-semibold text-correct" : "font-semibold text-incorrect"}>
            {report.wordsMatched ? "Palabras correctas" : `Palabras: ${Math.round(report.wordAccuracy * 100)}%`}
          </span>
          {report.confidence !== null ? (
            <span className="text-text-muted">Confianza del reconocedor: {Math.round(report.confidence * 100)}%</span>
          ) : null}
        </div>
      </div>

      {report.prosody ? <WaveformDisplay prosody={report.prosody} /> : null}

      <ul className="space-y-2">
        {findings.map((finding) => {
          const Icon = STATUS_ICON[finding.status];
          return (
            <li key={finding.target} className="flex gap-3 rounded-xl border border-border-soft bg-surface-raised p-3">
              <Icon size={18} className={`mt-0.5 shrink-0 ${STATUS_CLASS[finding.status]}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {TARGET_LABEL[finding.target] ?? finding.target}
                  {finding.status === "not_assessable" ? (
                    <span className="ml-2 font-normal text-xs text-text-muted">sin evaluar</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-sm text-text-muted">{finding.evidence}</p>
                {finding.tip ? <p className="mt-1 text-sm text-text-main">{finding.tip}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs leading-relaxed text-text-muted">
        Nota: estas observaciones salen de la transcripción y de la energía de la grabación. Una transcripción correcta
        no prueba que la pronunciación sea correcta, por eso algunos puntos aparecen «sin evaluar» en lugar de
        darte un visto bueno que no se puede comprobar.
      </p>
    </div>
  );
}
