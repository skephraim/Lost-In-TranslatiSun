import { alignWords, countSyllables, editDistance, normalize, words, type WordPair } from "./spanish";
import type { PhoneticFinding, ProsodyMeasurement, TruAccentReport } from "./types";

export interface ScoreInput {
  expectedPhrase: string;
  transcript: string;
  confidence?: number | null;
  prosody?: ProsodyMeasurement | null;
}

/** Does the word contain a double-r, the written form of the trill? */
function hasTrill(word: string): boolean {
  return word.includes("rr");
}

/** The same word with its trill reduced to a tap — "perro" -> "pero". */
function detrill(word: string): string {
  return word.replace(/rr/g, "r");
}

const VOWELS = "aeiou";

/** Do two words differ only in vowel letters, position for position? */
function differsOnlyInVowels(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  let sawVowelDifference = false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    const bothVowels = VOWELS.includes(a[i]) && VOWELS.includes(b[i]);
    if (!bothVowels) return false;
    sawVowelDifference = true;
  }

  return sawVowelDifference;
}

/** Do two words differ only by a d/r swap? Catches "cada" heard as "cara". */
function differsOnlyInDR(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  let sawDR = false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    const pair = a[i] + b[i];
    if (pair !== "dr" && pair !== "rd") return false;
    sawDR = true;
  }

  return sawDR;
}

/** Written accents present in the original (unnormalized) phrase. */
function hasWrittenAccent(text: string): boolean {
  return /[áéíóú]/i.test(text);
}

function assessTrill(pairs: WordPair[], expectedWords: string[]): PhoneticFinding {
  // Substitution evidence is checked before any "nothing to assess" bail:
  // over-trilling shows up as an "rr" on the HEARD side, so keying the
  // early-out off the expected phrase alone would hide it entirely.

  // The informative case: a word written with "rr" came back as its
  // single-r counterpart. The recognizer heard a tap where a trill belongs.
  const flattened = pairs.find(
    (p) => p.expected && p.heard && hasTrill(p.expected) && !hasTrill(p.heard) && detrill(p.expected) === p.heard
  );

  if (flattened) {
    return {
      target: "trilled_rr",
      status: "missed",
      evidence: `Se esperaba «${flattened.expected}» pero se reconoció «${flattened.heard}»: la vibrante múltiple sonó como una «r» simple.`,
      tip: "Deja la punta de la lengua suelta detrás de los dientes de arriba y empuja el aire para que vibre sola. Practica: «carro», «perro», «rápido».",
    };
  }

  // The reverse: a tap came out as a trill ("pero" heard as "perro").
  const overTrilled = pairs.find(
    (p) => p.expected && p.heard && !hasTrill(p.expected) && hasTrill(p.heard) && detrill(p.heard) === p.expected
  );

  if (overTrilled) {
    return {
      target: "trilled_rr",
      status: "missed",
      evidence: `Se esperaba «${overTrilled.expected}» pero se reconoció «${overTrilled.heard}»: la «r» simple salió vibrada.`,
      tip: "La «r» entre vocales es un solo golpecito de la lengua, no una vibración. Compara: «pero» (un golpe) y «perro» (vibración).",
    };
  }

  if (!expectedWords.some(hasTrill)) {
    return {
      target: "trilled_rr",
      status: "not_assessable",
      evidence: "Esta frase no contiene «rr».",
    };
  }

  const trillWordHeardCorrectly = pairs.some((p) => p.expected && hasTrill(p.expected) && p.heard === p.expected);

  if (trillWordHeardCorrectly) {
    return {
      target: "trilled_rr",
      status: "ok",
      evidence: "La palabra con «rr» se reconoció correctamente y no como su par con «r» simple.",
    };
  }

  return {
    target: "trilled_rr",
    status: "not_assessable",
    evidence: "La palabra con «rr» no se reconoció con claridad, así que no se puede evaluar la vibrante.",
  };
}

function assessVowels(pairs: WordPair[]): PhoneticFinding {
  const vowelSwap = pairs.find((p) => p.expected && p.heard && differsOnlyInVowels(p.expected, p.heard));

  if (vowelSwap) {
    return {
      target: "vowel_quality",
      status: "missed",
      evidence: `Se esperaba «${vowelSwap.expected}» pero se reconoció «${vowelSwap.heard}»: solo cambian las vocales.`,
      tip: "Las cinco vocales del español son puras y cortas, siempre iguales: a-e-i-o-u. No las alargues ni las relajes como en inglés.",
    };
  }

  // A matching transcript does NOT mean the vowels were clean — the
  // recognizer's language model snaps to the nearest real word regardless of
  // accent. Only formant analysis could confirm this, and we don't do it.
  return {
    target: "vowel_quality",
    status: "not_assessable",
    evidence: "La calidad vocálica necesita análisis acústico de formantes; la transcripción sola no la revela.",
  };
}

function assessIntervocalicD(pairs: WordPair[], expectedWords: string[]): PhoneticFinding {
  const hasIntervocalicD = expectedWords.some((w) => /[aeiou]d[aeiou]/.test(w));

  if (!hasIntervocalicD) {
    return {
      target: "intervocalic_d",
      status: "not_assessable",
      evidence: "Esta frase no contiene «d» entre vocales.",
    };
  }

  const swap = pairs.find((p) => p.expected && p.heard && differsOnlyInDR(p.expected, p.heard));

  if (swap) {
    return {
      target: "intervocalic_d",
      status: "missed",
      evidence: `Se esperaba «${swap.expected}» pero se reconoció «${swap.heard}»: la «d» suave se confundió con «r».`,
      tip: "La «d» entre vocales es suave, como el «th» de «this» en inglés: la lengua roza los dientes sin cerrar el paso del aire.",
    };
  }

  return {
    target: "intervocalic_d",
    status: "not_assessable",
    evidence: "No hubo confusión d/r, pero distinguir la «d» suave de la dura requiere análisis acústico.",
  };
}

function assessStress(expectedPhrase: string, transcript: string): PhoneticFinding {
  if (!hasWrittenAccent(expectedPhrase)) {
    return {
      target: "stress_placement",
      status: "not_assessable",
      evidence: "Esta frase no tiene acentos escritos que sirvan de referencia.",
    };
  }

  // Compare before normalization so the accents survive the comparison.
  const expectedAccented = expectedPhrase.toLowerCase().match(/[áéíóú]/g) ?? [];
  const heardAccented = transcript.toLowerCase().match(/[áéíóú]/g) ?? [];

  if (heardAccented.length < expectedAccented.length) {
    return {
      target: "stress_placement",
      status: "missed",
      evidence: "La transcripción perdió un acento escrito que se esperaba, lo que sugiere una sílaba tónica desplazada.",
      tip: "Marca con fuerza la sílaba acentuada; en español cambia el significado: «hablo» (ahora) frente a «habló» (ayer).",
    };
  }

  return {
    target: "stress_placement",
    status: "ok",
    evidence: "Los acentos esperados aparecieron en la transcripción.",
  };
}

/**
 * Builds the pronunciation report. Pure function over transcript + optional
 * prosody, so it is fully testable without audio hardware or a network.
 */
export function scorePronunciation(input: ScoreInput): TruAccentReport {
  const expectedWords = words(input.expectedPhrase);
  const heardWords = words(input.transcript);
  const pairs = alignWords(expectedWords, heardWords);

  const distance = editDistance(expectedWords, heardWords);
  const wordAccuracy = expectedWords.length === 0 ? 0 : Math.max(0, 1 - distance / expectedWords.length);
  const wordsMatched = normalize(input.expectedPhrase) === normalize(input.transcript);

  const findings: PhoneticFinding[] = [
    assessTrill(pairs, expectedWords),
    assessVowels(pairs),
    assessIntervocalicD(pairs, expectedWords),
    assessStress(input.expectedPhrase, input.transcript),
  ];

  return {
    expectedPhrase: input.expectedPhrase,
    transcript: input.transcript,
    confidence: input.confidence ?? null,
    wordAccuracy,
    findings,
    prosody: input.prosody ?? null,
    wordsMatched,
  };
}

/**
 * Measures the pieces of prosody that are genuinely computable from a
 * decoded recording. `envelope` is downsampled RMS, suitable for drawing.
 */
export function measureProsody(
  samples: Float32Array,
  sampleRate: number,
  expectedPhrase: string,
  buckets = 64
): ProsodyMeasurement {
  const durationMs = (samples.length / sampleRate) * 1000;
  const envelope: number[] = [];
  const bucketSize = Math.max(1, Math.floor(samples.length / buckets));

  for (let b = 0; b < buckets; b += 1) {
    const start = b * bucketSize;
    const end = Math.min(start + bucketSize, samples.length);
    let sumSquares = 0;
    for (let i = start; i < end; i += 1) sumSquares += samples[i] * samples[i];
    envelope.push(end > start ? Math.sqrt(sumSquares / (end - start)) : 0);
  }

  const peak = Math.max(...envelope, 1e-9);
  const normalized = envelope.map((v) => v / peak);
  const SILENCE_THRESHOLD = 0.08;
  const silentBuckets = normalized.filter((v) => v < SILENCE_THRESHOLD).length;

  const syllableCount = countSyllables(expectedPhrase);
  const seconds = durationMs / 1000;

  return {
    durationMs,
    syllableCount,
    syllablesPerSecond: seconds > 0 ? syllableCount / seconds : 0,
    silenceRatio: normalized.length ? silentBuckets / normalized.length : 0,
    envelope: normalized,
  };
}
