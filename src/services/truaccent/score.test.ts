import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { scorePronunciation, measureProsody } from "./score";
import { countSyllables, alignWords, words } from "./spanish";
import type { AssessedTargetId, FindingStatus } from "./types";

function statusOf(report: ReturnType<typeof scorePronunciation>, target: AssessedTargetId): FindingStatus {
  const finding = report.findings.find((f) => f.target === target);
  assert.ok(finding, `no finding for ${target}`);
  return finding.status;
}

describe("trill detection", () => {
  test("flags a trill flattened to a tap", () => {
    const report = scorePronunciation({ expectedPhrase: "El perro corre.", transcript: "El pero corre" });
    assert.equal(statusOf(report, "trilled_rr"), "missed");
    assert.match(report.findings.find((f) => f.target === "trilled_rr")!.tip!, /lengua/);
  });

  test("flags an over-trilled tap", () => {
    const report = scorePronunciation({ expectedPhrase: "Pero no.", transcript: "Perro no" });
    assert.equal(statusOf(report, "trilled_rr"), "missed");
  });

  test("confirms a trill the recognizer kept distinct from its minimal pair", () => {
    const report = scorePronunciation({ expectedPhrase: "El perro corre.", transcript: "El perro corre" });
    assert.equal(statusOf(report, "trilled_rr"), "ok");
  });

  test("does not assess a trill when the phrase has no rr", () => {
    const report = scorePronunciation({ expectedPhrase: "La mesa es azul.", transcript: "La mesa es azul" });
    assert.equal(statusOf(report, "trilled_rr"), "not_assessable");
  });
});

describe("vowel quality", () => {
  test("flags a vowel-only substitution", () => {
    const report = scorePronunciation({ expectedPhrase: "Quiero comer.", transcript: "Quiero comar" });
    assert.equal(statusOf(report, "vowel_quality"), "missed");
  });

  test("REFUSES to confirm clean vowels from a matching transcript", () => {
    // The integrity case. A recognizer snaps to the nearest real word, so a
    // perfect transcript is not evidence of a clean five-vowel system.
    // Reporting "ok" here would be fabricated praise.
    const report = scorePronunciation({ expectedPhrase: "La mesa es azul.", transcript: "La mesa es azul" });
    assert.equal(statusOf(report, "vowel_quality"), "not_assessable");
    assert.notEqual(statusOf(report, "vowel_quality"), "ok");
  });
});

describe("intervocalic d", () => {
  test("flags a d heard as r", () => {
    const report = scorePronunciation({ expectedPhrase: "Cada día.", transcript: "Cara día" });
    assert.equal(statusOf(report, "intervocalic_d"), "missed");
  });

  test("does not assess when the phrase has no intervocalic d", () => {
    const report = scorePronunciation({ expectedPhrase: "El perro corre.", transcript: "El perro corre" });
    assert.equal(statusOf(report, "intervocalic_d"), "not_assessable");
  });

  test("does not claim success when d survived — that needs acoustics", () => {
    const report = scorePronunciation({ expectedPhrase: "Cada día.", transcript: "Cada día" });
    assert.equal(statusOf(report, "intervocalic_d"), "not_assessable");
  });
});

describe("stress placement", () => {
  test("flags a dropped written accent", () => {
    const report = scorePronunciation({ expectedPhrase: "Él habló ayer.", transcript: "El hablo ayer" });
    assert.equal(statusOf(report, "stress_placement"), "missed");
  });

  test("does not assess a phrase with no written accents", () => {
    const report = scorePronunciation({ expectedPhrase: "La mesa es azul.", transcript: "La mesa es azul" });
    assert.equal(statusOf(report, "stress_placement"), "not_assessable");
  });
});

describe("word accuracy", () => {
  test("is 1 for an exact match ignoring case, accents and punctuation", () => {
    const report = scorePronunciation({ expectedPhrase: "El niño bebe agua.", transcript: "el nino bebe agua" });
    assert.equal(report.wordAccuracy, 1);
    assert.equal(report.wordsMatched, true);
  });

  test("degrades with each wrong word", () => {
    const report = scorePronunciation({ expectedPhrase: "El niño bebe agua.", transcript: "El niño bebe vino" });
    assert.equal(report.wordAccuracy, 0.75);
    assert.equal(report.wordsMatched, false);
  });

  test("handles an empty transcript without dividing by zero", () => {
    const report = scorePronunciation({ expectedPhrase: "El niño bebe agua.", transcript: "" });
    assert.equal(report.wordAccuracy, 0);
    assert.equal(report.wordsMatched, false);
  });
});

describe("syllable counting", () => {
  const cases: Array<[string, number]> = [
    ["agua", 2],
    ["el nino bebe agua", 7],
    ["dia", 1],
    ["día", 2],
    ["los hombres corren", 5],
    ["mujer", 2],
  ];

  for (const [phrase, expected] of cases) {
    test(`"${phrase}" has ${expected} syllables`, () => {
      assert.equal(countSyllables(phrase), expected);
    });
  }
});

describe("word alignment", () => {
  test("pairs substitutions position for position", () => {
    const pairs = alignWords(words("el perro corre"), words("el pero corre"));
    assert.deepEqual(pairs, [
      { expected: "el", heard: "el" },
      { expected: "perro", heard: "pero" },
      { expected: "corre", heard: "corre" },
    ]);
  });

  test("represents a dropped word as a pair with no heard side", () => {
    const pairs = alignWords(words("el nino bebe"), words("el bebe"));
    assert.ok(pairs.some((p) => p.expected === "nino" && p.heard === undefined));
  });
});

describe("prosody measurement", () => {
  test("computes duration and syllable rate from real samples", () => {
    const sampleRate = 16000;
    const samples = new Float32Array(sampleRate * 2); // 2 seconds
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.sin(i / 20) * 0.5;

    const prosody = measureProsody(samples, sampleRate, "el nino bebe agua");
    assert.equal(Math.round(prosody.durationMs), 2000);
    assert.equal(prosody.syllableCount, 7);
    assert.equal(Math.round(prosody.syllablesPerSecond * 10) / 10, 3.5);
    assert.equal(prosody.envelope.length, 64);
  });

  test("reports a high silence ratio for a mostly-silent recording", () => {
    const sampleRate = 16000;
    const samples = new Float32Array(sampleRate);
    // Only the first tenth carries energy.
    for (let i = 0; i < sampleRate / 10; i += 1) samples[i] = Math.sin(i / 20);

    const prosody = measureProsody(samples, sampleRate, "hola");
    assert.ok(prosody.silenceRatio > 0.8, `expected mostly silence, got ${prosody.silenceRatio}`);
  });
});
