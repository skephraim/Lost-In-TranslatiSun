/** Shared shape every RosettaMAIC agent persona must conform to. */

export type AgentRole =
  | "lead_instructor"
  | "peer_learner"
  | "native_peer"
  | "phonetics_coach"
  | "bilingual_ta";

export interface ErrorPattern {
  /** Short id so EvaluateResponse can reference which mistake was modeled, e.g. "gender_agreement". */
  id: string;
  description: string;
  example: string;
  correction: string;
}

export interface AgentPersona {
  id: string;
  displayName: string;
  role: AgentRole;
  /** BCP-47 locale the agent speaks in during normal (non-TA) turns. */
  locale: "es-MX" | "en-US";
  /** The full system prompt sent to the LLM for this agent. */
  systemPrompt: string;
  /** TTS voice tuning; cadence 1.0 = natural speed. */
  voice: {
    provider: "openai" | "elevenlabs" | "lemonade";
    voiceId: string;
    cadence: number;
  };
  /** Only meaningful for peer_learner: how often the agent should inject a mistake, 0-1. */
  errorInjectionRate?: number;
  errorBank?: ErrorPattern[];
}
