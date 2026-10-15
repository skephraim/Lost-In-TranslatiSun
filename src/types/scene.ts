/**
 * Scene types shared by the lesson graph and the UI.
 *
 * These live apart from `lesson_graph.ts` on purpose: that module imports the
 * LangGraph runtime, and a client component importing it would pull the whole
 * graph into the browser bundle. The types are the contract between the two
 * sides; neither needs the other's runtime.
 */

/** Who the pictogram depicts. Plural subjects exist to teach number agreement. */
export type TileSubject = "nino" | "nina" | "hombre" | "mujer" | "hombres" | "mujeres";

/** What they're doing. */
export type TileAction = "beber" | "comer" | "correr" | "caminar" | "tener";

/** What they're doing it with, when the action takes an object. */
export type TileObject = "agua" | "vino" | "leche" | "pan" | "manzana" | "naranja";

/**
 * A pictogram specification instead of a photo. Rendering tiles from a shared
 * shape vocabulary is what makes contrastive pairs legible: "el niño bebe
 * agua" vs "la mujer bebe vino" differ in exactly two marks, so the learner
 * can see which word maps to which change.
 */
export interface TileArt {
  subject: TileSubject;
  action: TileAction;
  object?: TileObject;
}

export interface SceneTile {
  id: string;
  /** The Spanish phrase this tile depicts, and what TTS speaks for it. */
  audioText: string;
  isCorrect: boolean;
  /** Pictogram spec. Preferred — renders offline with no asset pipeline. */
  art?: TileArt;
  /** Escape hatch for a real photograph once an asset pipeline exists. */
  imageUrl?: string;
}

export type SceneMode = "listen_select" | "speak_match" | "contrastive_deduction";

/**
 * What the graph expects back from the learner, so the UI knows whether to
 * await a click, a spoken utterance, or either.
 */
export type ExpectedResponseType = "tile_selection" | "speech" | "either";

export interface Scene {
  id: string;
  mode: SceneMode;
  tiles: SceneTile[];
  targetPhrase: string;
  expectedResponseType: ExpectedResponseType;
}

export interface EvaluationResult {
  correct: boolean;
  transcript?: string;
  phoneticNotes?: string[];
}

/** The response type each mode implies when a scene doesn't override it. */
export const DEFAULT_RESPONSE_TYPE: Record<SceneMode, ExpectedResponseType> = {
  listen_select: "tile_selection",
  speak_match: "speech",
  contrastive_deduction: "tile_selection",
};
