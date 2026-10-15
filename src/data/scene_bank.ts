import type { Scene } from "../types/scene";

/**
 * The drill bank PlanUnit cycles through, and the sample data the UI renders.
 * It lives here rather than inside the graph so the frontend can import
 * scenes without pulling the LangGraph runtime into the browser bundle.
 *
 * Each scene's distractors are chosen to isolate ONE variable against the
 * target — subject, number, verb, or object — so a learner can deduce which
 * word carries which meaning without ever being told a translation.
 */
export type SceneTemplate = Omit<Scene, "id" | "expectedResponseType">;

export const SCENE_BANK: SceneTemplate[] = [
  {
    // Varies subject and object against "el niño bebe agua".
    mode: "contrastive_deduction",
    targetPhrase: "El niño bebe agua.",
    tiles: [
      { id: "t1", art: { subject: "nino", action: "beber", object: "agua" }, audioText: "El niño bebe agua.", isCorrect: true },
      { id: "t2", art: { subject: "mujer", action: "beber", object: "vino" }, audioText: "La mujer bebe vino.", isCorrect: false },
      { id: "t3", art: { subject: "hombre", action: "comer", object: "pan" }, audioText: "El hombre come pan.", isCorrect: false },
      { id: "t4", art: { subject: "nina", action: "beber", object: "leche" }, audioText: "La niña bebe leche.", isCorrect: false },
    ],
  },
  {
    // Singular vs plural, taught purely by contrast — no grammar talk needed.
    mode: "contrastive_deduction",
    targetPhrase: "Los hombres corren.",
    tiles: [
      { id: "t1", art: { subject: "hombres", action: "correr" }, audioText: "Los hombres corren.", isCorrect: true },
      { id: "t2", art: { subject: "hombre", action: "correr" }, audioText: "El hombre corre.", isCorrect: false },
      { id: "t3", art: { subject: "mujeres", action: "correr" }, audioText: "Las mujeres corren.", isCorrect: false },
      { id: "t4", art: { subject: "hombre", action: "caminar" }, audioText: "El hombre camina.", isCorrect: false },
    ],
  },
  {
    // Each distractor changes exactly one word: subject, verb, or object.
    mode: "listen_select",
    targetPhrase: "La niña come una manzana.",
    tiles: [
      { id: "t1", art: { subject: "nina", action: "comer", object: "manzana" }, audioText: "La niña come una manzana.", isCorrect: true },
      { id: "t2", art: { subject: "nino", action: "comer", object: "manzana" }, audioText: "El niño come una manzana.", isCorrect: false },
      { id: "t3", art: { subject: "nina", action: "tener", object: "manzana" }, audioText: "La niña tiene una manzana.", isCorrect: false },
      { id: "t4", art: { subject: "nina", action: "comer", object: "naranja" }, audioText: "La niña come una naranja.", isCorrect: false },
    ],
  },
  {
    // Speak-to-match on a phrase whose target sound the scorer can actually
    // assess: "corren" carries the trilled rr. A pronunciation drill should
    // contain the phoneme it means to coach, otherwise every finding comes
    // back "not assessable" and the learner gets nothing actionable.
    mode: "speak_match",
    targetPhrase: "Los hombres corren.",
    tiles: [
      { id: "t1", art: { subject: "hombres", action: "correr" }, audioText: "Los hombres corren.", isCorrect: true },
      { id: "t2", art: { subject: "hombre", action: "correr" }, audioText: "El hombre corre.", isCorrect: false },
      { id: "t3", art: { subject: "mujeres", action: "correr" }, audioText: "Las mujeres corren.", isCorrect: false },
      { id: "t4", art: { subject: "hombre", action: "caminar" }, audioText: "El hombre camina.", isCorrect: false },
    ],
  },
  {
    // Speak-to-match: the learner produces the phrase rather than picking it.
    mode: "speak_match",
    targetPhrase: "La mujer bebe agua.",
    tiles: [
      { id: "t1", art: { subject: "mujer", action: "beber", object: "agua" }, audioText: "La mujer bebe agua.", isCorrect: true },
      { id: "t2", art: { subject: "mujer", action: "beber", object: "vino" }, audioText: "La mujer bebe vino.", isCorrect: false },
      { id: "t3", art: { subject: "hombre", action: "beber", object: "agua" }, audioText: "El hombre bebe agua.", isCorrect: false },
      { id: "t4", art: { subject: "mujeres", action: "beber", object: "agua" }, audioText: "Las mujeres beben agua.", isCorrect: false },
    ],
  },
];
