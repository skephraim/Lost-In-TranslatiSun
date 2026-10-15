"use client";

import type { ProsodyMeasurement } from "../../services/truaccent/types";

/**
 * Draws the learner's amplitude envelope with the measurements that can
 * honestly be derived from it.
 *
 * On the "compare against the native model" idea: browser speech synthesis
 * gives no way to capture its output as audio data — there is no
 * MediaStream from `speechSynthesis` — so there is no native waveform to
 * overlay. Rather than draw a plausible-looking fake curve, this shows the
 * learner's real envelope against the phrase's expected SYLLABLE COUNT,
 * which is genuine information: seven syllables should produce roughly
 * seven energy bursts, so running words together is visible. Overlaying a
 * true reference needs recorded native-speaker clips per phrase.
 */

/** Comfortable range for careful Latin American Spanish at beginner levels. */
const RATE_FLOOR = 2.5;
const RATE_CEILING = 5.5;

export function WaveformDisplay({ prosody }: { prosody: ProsodyMeasurement }) {
  const { envelope, durationMs, syllableCount, syllablesPerSecond, silenceRatio } = prosody;

  const rateVerdict =
    syllablesPerSecond < RATE_FLOOR ? "lento" : syllablesPerSecond > RATE_CEILING ? "rápido" : "bien";

  // Count energy bursts: runs above the silence floor. A rough proxy for how
  // many syllables actually came out as separate beats.
  const SILENCE = 0.08;
  let bursts = 0;
  let inBurst = false;
  for (const v of envelope) {
    if (v >= SILENCE && !inBurst) {
      bursts += 1;
      inBurst = true;
    } else if (v < SILENCE) {
      inBurst = false;
    }
  }

  return (
    <div className="rounded-xl border border-border-soft bg-surface-raised p-4">
      <div className="flex items-end gap-[2px]" style={{ height: 64 }} role="img" aria-label="Forma de onda de tu grabación">
        {envelope.map((value, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-accent"
            style={{ height: `${Math.max(2, value * 100)}%`, opacity: value < SILENCE ? 0.22 : 1 }}
          />
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <Stat label="Duración" value={`${(durationMs / 1000).toFixed(1)} s`} />
        <Stat label="Sílabas esperadas" value={String(syllableCount)} />
        <Stat
          label="Ritmo"
          value={`${syllablesPerSecond.toFixed(1)}/s`}
          tone={rateVerdict === "bien" ? "good" : "warn"}
          note={rateVerdict === "bien" ? undefined : rateVerdict === "lento" ? "un poco lento" : "un poco rápido"}
        />
        <Stat label="Silencio" value={`${Math.round(silenceRatio * 100)}%`} />
      </dl>

      {bursts > 0 && bursts < syllableCount - 2 ? (
        <p className="mt-2 text-xs text-text-muted">
          Se detectaron ~{bursts} golpes de voz para {syllableCount} sílabas: intenta separar un poco más las palabras.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone, note }: { label: string; value: string; tone?: "good" | "warn"; note?: string }) {
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd className={tone === "warn" ? "font-semibold text-accent" : "font-semibold text-text-main"}>
        {value}
        {note ? <span className="ml-1 font-normal text-text-muted">({note})</span> : null}
      </dd>
    </div>
  );
}
