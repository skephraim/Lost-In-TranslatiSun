import { StateGraph, Annotation, END, START, interrupt } from "@langchain/langgraph";
import { maestraElena, peerMateo, peerSofia, phoneticsCoach, taBilingual } from "../agents";
import type { AgentPersona } from "../types/agent";

/**
 * Visual tile the frontend's <VisualImmersionGrid /> renders. One drill = one
 * `scene` made of these tiles (see Phase 2 of the RosettaMAIC plan).
 */
export interface SceneTile {
  id: string;
  imageUrl: string;
  audioText: string;
  isCorrect: boolean;
}

export interface Scene {
  id: string;
  mode: "listen_select" | "speak_match" | "contrastive_deduction";
  tiles: SceneTile[];
  targetPhrase: string;
}

export interface EvaluationResult {
  correct: boolean;
  transcript?: string;
  phoneticNotes?: string[];
}

/**
 * LangGraph state, threaded through every node. Annotation.Root defines how
 * each field merges when multiple nodes touch it in the same tick — most
 * fields here just get overwritten by whichever node ran last.
 */
export const LessonState = Annotation.Root({
  cefrLevel: Annotation<string>({ default: () => "A1.1", reducer: (_prev, next) => next }),
  topic: Annotation<string>({ default: () => "", reducer: (_prev, next) => next }),
  currentScene: Annotation<Scene | null>({ default: () => null, reducer: (_prev, next) => next }),
  peerTurnAgentId: Annotation<string>({ default: () => peerMateo.id, reducer: (_prev, next) => next }),
  peerTurnText: Annotation<string>({ default: () => "", reducer: (_prev, next) => next }),
  peerTurnHadError: Annotation<boolean>({ default: () => false, reducer: (_prev, next) => next }),
  userResponse: Annotation<string>({ default: () => "", reducer: (_prev, next) => next }),
  evaluation: Annotation<EvaluationResult | null>({ default: () => null, reducer: (_prev, next) => next }),
  taRequested: Annotation<boolean>({ default: () => false, reducer: (_prev, next) => next }),
  taQuestion: Annotation<string>({ default: () => "", reducer: (_prev, next) => next }),
  streak: Annotation<number>({ default: () => 0, reducer: (_prev, next) => next }),
});

export type LessonStateType = typeof LessonState.State;

/**
 * Placeholder for the actual LLM call. Wire this to your model provider
 * (OpenAI, Anthropic, etc.) — it's intentionally isolated here so every node
 * below stays provider-agnostic. Swap the body without touching graph wiring.
 */
async function callAgentLLM(agent: AgentPersona, userMessage: string): Promise<string> {
  throw new Error(
    `callAgentLLM is a stub. Wire "${agent.id}" up to your LLM provider using agent.systemPrompt as the system message and "${userMessage}" as the latest turn.`
  );
}

// --- Node 1: PlanUnit ------------------------------------------------------
// Deconstructs the CEFR topic into a scene (visual drill) for this tick.
async function planUnit(state: LessonStateType): Promise<Partial<LessonStateType>> {
  const scene: Scene = {
    id: `${state.topic || "intro"}-${Date.now()}`,
    mode: "contrastive_deduction",
    targetPhrase: "El niño bebe agua.",
    tiles: [
      { id: "t1", imageUrl: "/scenes/boy-drinking-water.png", audioText: "El niño bebe agua.", isCorrect: true },
      { id: "t2", imageUrl: "/scenes/woman-drinking-wine.png", audioText: "La mujer bebe vino.", isCorrect: false },
      { id: "t3", imageUrl: "/scenes/man-eating-bread.png", audioText: "El hombre come pan.", isCorrect: false },
      { id: "t4", imageUrl: "/scenes/girl-drinking-milk.png", audioText: "La niña bebe leche.", isCorrect: false },
    ],
  };
  return { currentScene: scene };
}

// --- Node 2: TeacherDrill ---------------------------------------------------
// Elena introduces the visual stimulus and speaks the target phrase.
async function teacherDrill(state: LessonStateType): Promise<Partial<LessonStateType>> {
  if (!state.currentScene) throw new Error("teacherDrill ran before planUnit produced a scene.");
  await callAgentLLM(maestraElena, `Presenta esta escena: ${JSON.stringify(state.currentScene)}`);
  return {};
}

// --- Node 3: PeerSimulation --------------------------------------------------
// Mateo or Sofía responds first, occasionally modeling a mistake.
async function peerSimulation(state: LessonStateType): Promise<Partial<LessonStateType>> {
  const useMateo = Math.random() < 0.5;
  const agent = useMateo ? peerMateo : peerSofia;
  const shouldError = useMateo && Math.random() < (peerMateo.errorInjectionRate ?? 0);
  const errorPattern = shouldError && peerMateo.errorBank ? peerMateo.errorBank[Math.floor(Math.random() * peerMateo.errorBank.length)] : undefined;

  const text = errorPattern ? errorPattern.example : state.currentScene?.targetPhrase ?? "";
  return {
    peerTurnAgentId: agent.id,
    peerTurnText: text,
    peerTurnHadError: Boolean(errorPattern),
  };
}

// --- Node 4: UserPrompt ------------------------------------------------------
// Suspends the graph until the frontend delivers a voice/selection response.
// LangGraph's `interrupt()` pauses execution and returns whatever value the
// caller resumes the graph with (see the frontend's ASR/tile-click handler).
async function userPrompt(_state: LessonStateType): Promise<Partial<LessonStateType>> {
  const response = interrupt({ waitingFor: "user_voice_or_tile_selection" }) as string;
  return { userResponse: response };
}

// --- Node 5: EvaluateResponse -------------------------------------------------
async function evaluateResponse(state: LessonStateType): Promise<Partial<LessonStateType>> {
  const target = state.currentScene?.targetPhrase ?? "";
  const correct = state.userResponse.trim().toLowerCase() === target.trim().toLowerCase();

  const feedbackAgent = correct ? maestraElena : peerSofia;
  await callAgentLLM(
    feedbackAgent,
    correct
      ? `El estudiante respondió correctamente: "${state.userResponse}". Celébralo.`
      : `El estudiante respondió "${state.userResponse}" pero el objetivo era "${target}". Da una corrección cálida con recasting.`
  );

  await callAgentLLM(phoneticsCoach, `Evalúa la pronunciación de: "${state.userResponse}"`);

  return {
    evaluation: { correct, transcript: state.userResponse },
    streak: correct ? state.streak + 1 : 0,
  };
}

// --- Branch: TAIntervention ---------------------------------------------------
// Only entered when the frontend sets `taRequested` before resuming the graph
// (the "Ask TA" hotkey). Answers in English, then hands back to Spanish.
async function taIntervention(state: LessonStateType): Promise<Partial<LessonStateType>> {
  await callAgentLLM(taBilingual, state.taQuestion || "The learner pressed Help with no specific question.");
  return { taRequested: false, taQuestion: "" };
}

function routeAfterUserPrompt(state: LessonStateType): "taIntervention" | "evaluateResponse" {
  return state.taRequested ? "taIntervention" : "evaluateResponse";
}

function routeAfterEvaluate(state: LessonStateType): "planUnit" | typeof END {
  // Keep looping into new drills; a real implementation would check the
  // CEFR unit's drill count / mastery threshold here before ending.
  return state.evaluation?.correct ? "planUnit" : "planUnit";
}

export function buildLessonGraph() {
  const graph = new StateGraph(LessonState)
    .addNode("planUnit", planUnit)
    .addNode("teacherDrill", teacherDrill)
    .addNode("peerSimulation", peerSimulation)
    .addNode("userPrompt", userPrompt)
    .addNode("evaluateResponse", evaluateResponse)
    .addNode("taIntervention", taIntervention)
    .addEdge(START, "planUnit")
    .addEdge("planUnit", "teacherDrill")
    .addEdge("teacherDrill", "peerSimulation")
    .addEdge("peerSimulation", "userPrompt")
    .addConditionalEdges("userPrompt", routeAfterUserPrompt, {
      taIntervention: "taIntervention",
      evaluateResponse: "evaluateResponse",
    })
    .addEdge("taIntervention", "userPrompt")
    .addConditionalEdges("evaluateResponse", routeAfterEvaluate, {
      planUnit: "planUnit",
      [END]: END,
    });

  return graph.compile();
}
