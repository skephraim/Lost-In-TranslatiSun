/**
 * TruAccent assessment types.
 *
 * READ THIS BEFORE EXTENDING THE SCORER.
 *
 * Everything here is derived from two sources: the ASR transcript, and
 * measurable properties of the recorded audio (duration, energy envelope).
 * Neither gives us formants, so this module cannot actually hear vowel
 * quality, voice-onset time, or the difference between a trill and a tap in
 * isolation. What it *can* do is notice when the recognizer heard a
 * different word than the one expected, and reason about which articulatory
 * slip would explain that substitution.
 *
 * That distinction drives the three-valued `status`. A matching transcript
 * is NOT evidence of good pronunciation — speech recognizers snap to the
 * nearest plausible word and will happily transcribe a heavily accented
 * "perro" as "perro". Reporting "✓ your trill was perfect" on that basis
 * would be inventing feedback, which is worse than silence for a learner
 * who would then stop working on it. So the scorer says `not_assessable`
 * wherever it genuinely cannot tell.
 */

export type AssessedTargetId =
  | "trilled_rr"
  | "intervocalic_d"
  | "vowel_quality"
  | "stress_placement";

export type FindingStatus =
  /** Positive evidence the sound was produced as expected. */
  | "ok"
  /** Positive evidence of a problem — a substitution consistent with this target. */
  | "missed"
  /** Target absent from this phrase, or undetectable without acoustic analysis. */
  | "not_assessable";

export interface PhoneticFinding {
  target: AssessedTargetId;
  status: FindingStatus;
  /** What in the data supports this call. Shown to the learner, so plain Spanish. */
  evidence: string;
  /** Actionable coaching, only when status is "missed". */
  tip?: string;
}

/** Properties genuinely measurable from the recorded waveform. */
export interface ProsodyMeasurement {
  durationMs: number;
  /** Syllables counted from the expected phrase's orthography. */
  syllableCount: number;
  syllablesPerSecond: number;
  /** Share of the recording below the silence threshold, 0-1. */
  silenceRatio: number;
  /** Normalized amplitude envelope, for the waveform display. */
  envelope: number[];
}

export interface TruAccentReport {
  expectedPhrase: string;
  transcript: string;
  /** Recognizer confidence, 0-1, or null when the engine doesn't report one. */
  confidence: number | null;
  /** Word-level agreement between expected and heard, 0-1. */
  wordAccuracy: number;
  findings: PhoneticFinding[];
  prosody: ProsodyMeasurement | null;
  /**
   * True only when the words matched. Says nothing about pronunciation
   * quality — see the note at the top of this file.
   */
  wordsMatched: boolean;
}
