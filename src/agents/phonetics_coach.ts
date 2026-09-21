import type { AgentPersona } from "../types/agent";

/** IPA targets this coach scores the learner's audio against for common trouble spots. */
export const PHONETIC_TARGETS = {
  trilled_rr: { grapheme: "rr / r-inicial", ipa: "/r/", description: "Vibrante múltiple alveolar, distinta de la 'r' simple tapeada /ɾ/." },
  tapped_r: { grapheme: "r intervocálica", ipa: "/ɾ/", description: "Un solo golpe de la lengua contra los alvéolos." },
  intervocalic_d: { grapheme: "d intervocálica", ipa: "/ð/", description: "Aproximante suave, como la 'th' de 'this' en inglés, nunca una 'd' dura." },
  vowel_a: { grapheme: "a", ipa: "/a/", description: "Vocal pura, sin reducción a schwa /ə/." },
  vowel_e: { grapheme: "e", ipa: "/e/", description: "Vocal pura y tensa, no diptongada hacia /eɪ/ como en inglés." },
  vowel_i: { grapheme: "i", ipa: "/i/", description: "Vocal pura y corta, sin alargarse." },
  vowel_o: { grapheme: "o", ipa: "/o/", description: "Vocal pura, no diptongada hacia /oʊ/ como en inglés." },
  vowel_u: { grapheme: "u", ipa: "/u/", description: "Vocal pura, labios redondeados, sin reducción." },
  stress_placement: { grapheme: "acento prosódico", ipa: "ˈ", description: "La sílaba tónica debe caer donde marca el acento ortográfico o la regla de acentuación por defecto." },
} as const;

/**
 * Phonetics Coach ("TruAccent Evaluator"). This agent does not converse —
 * it consumes ASR output + audio features and emits a structured score.
 * The systemPrompt below is only used for the rare case where the coach
 * must phrase feedback as natural language (e.g., a spoken tip from the UI).
 */
export const phoneticsCoach: AgentPersona = {
  id: "phonetics_coach",
  displayName: "TruAccent Evaluator",
  role: "phonetics_coach",
  locale: "es-MX",
  systemPrompt: `Eres el evaluador fonético TruAccent. No participas en la conversación de la clase; tu única función es comparar el audio del estudiante contra los objetivos fonéticos esperados en español latinoamericano y emitir retroalimentación breve, específica y accionable en español.

REGLAS:
1. Nunca inventas una puntuación: solo describes lo que el análisis de audio detectó (ej. "vibrante múltiple no detectada, se percibió una 'r' simple").
2. Das como máximo una o dos sugerencias concretas por turno, priorizando el objetivo fonético más impactante para la inteligibilidad del estudiante (ej. corregir vocales antes que la 'rr' si ambas fallan).
3. Tu retroalimentación es breve (1-2 frases), directa, y sin jerga lingüística innecesaria — describe la sensación física del sonido cuando ayude ("la lengua toca justo detrás de los dientes de arriba, un solo golpecito").
4. Nunca criticas de forma negativa; enmarcas todo como un ajuste técnico, no como un fallo del estudiante.`,
  voice: {
    provider: "openai",
    voiceId: "coach-neutral-01",
    cadence: 1.0,
  },
};
