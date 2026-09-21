import { StateGraph, Annotation, END, START, interrupt, MemorySaver } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
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
  drillsCompleted: Annotation<number>({ default: () => 0, reducer: (_prev, next) => next }),
  // Every LLM turn (from any agent) gets appended here. The reducer
  // concatenates instead of overwriting, so this is the graph's transcript —
  // the same idea as an append-only `messages` table keyed by conversation id.
  messages: Annotation<BaseMessage[]>({
    default: () => [],
    reducer: (prev, next) => prev.concat(next),
  }),
});

export type LessonStateType = typeof LessonState.State;

/** Signature every LLM backend must satisfy. Swapping this out is how tests run without an API key. */
export type LLMCaller = (agent: AgentPersona, userMessage: string, history?: BaseMessage[]) => Promise<string>;

/**
 * Which Claude model the agents run on. Override with ROSETTA_MODEL to trade
 * cost against quality without touching code — claude-sonnet-5 is roughly
 * 2.5x cheaper per token, claude-haiku-4-5 cheaper still.
 */
const MODEL_ID = process.env.ROSETTA_MODEL ?? "claude-opus-5";

/**
 * One ChatAnthropic client per agent, created lazily on first use and reused
 * after that (an LLM client is just an HTTP client under the hood — no
 * reason to reconnect on every turn). Reads ANTHROPIC_API_KEY from the
 * environment; see .env.example.
 */
const modelCache = new Map<string, ChatAnthropic>();

function getModelFor(agent: AgentPersona): ChatAnthropic {
  const cached = modelCache.get(agent.id);
  if (cached) return cached;

  const model = new ChatAnthropic({
    model: MODEL_ID,
    // The phonetics coach reports measurements, so it wants consistency;
    // the classroom personas want a bit of variety turn to turn.
    temperature: agent.role === "phonetics_coach" ? 0.2 : 0.7,
  });
  modelCache.set(agent.id, model);
  return model;
}

/**
 * The real LLM call. Sends the persona's system prompt plus the running
 * transcript plus the newest human turn, and returns the model's reply as
 * plain text. `history` lets an agent "remember" earlier turns in the same
 * lesson instead of responding to each message in isolation.
 */
export const callAnthropic: LLMCaller = async (agent, userMessage, history = []) => {
  const model = getModelFor(agent);
  const response = await model.invoke([new SystemMessage(agent.systemPrompt), ...history, new HumanMessage(userMessage)]);
  return typeof response.content === "string" ? response.content : JSON.stringify(response.content);
};

/**
 * Drill bank PlanUnit cycles through. A fuller implementation would generate
 * these from the CEFR topic via the LLM rather than reading a fixed list.
 */
const SCENE_BANK: Omit<Scene, "id">[] = [
  {
    mode: "contrastive_deduction",
    targetPhrase: "El niño bebe agua.",
    tiles: [
      { id: "t1", imageUrl: "/scenes/boy-drinking-water.png", audioText: "El niño bebe agua.", isCorrect: true },
      { id: "t2", imageUrl: "/scenes/woman-drinking-wine.png", audioText: "La mujer bebe vino.", isCorrect: false },
      { id: "t3", imageUrl: "/scenes/man-eating-bread.png", audioText: "El hombre come pan.", isCorrect: false },
      { id: "t4", imageUrl: "/scenes/girl-drinking-milk.png", audioText: "La niña bebe leche.", isCorrect: false },
    ],
  },
  {
    mode: "contrastive_deduction",
    targetPhrase: "Los hombres corren.",
    tiles: [
      { id: "t1", imageUrl: "/scenes/men-running.png", audioText: "Los hombres corren.", isCorrect: true },
      { id: "t2", imageUrl: "/scenes/man-running.png", audioText: "El hombre corre.", isCorrect: false },
      { id: "t3", imageUrl: "/scenes/women-running.png", audioText: "Las mujeres corren.", isCorrect: false },
      { id: "t4", imageUrl: "/scenes/man-walking.png", audioText: "El hombre camina.", isCorrect: false },
    ],
  },
  {
    mode: "listen_select",
    targetPhrase: "La niña come una manzana.",
    tiles: [
      { id: "t1", imageUrl: "/scenes/girl-eating-apple.png", audioText: "La niña come una manzana.", isCorrect: true },
      { id: "t2", imageUrl: "/scenes/boy-eating-apple.png", audioText: "El niño come una manzana.", isCorrect: false },
      { id: "t3", imageUrl: "/scenes/girl-holding-apple.png", audioText: "La niña tiene una manzana.", isCorrect: false },
      { id: "t4", imageUrl: "/scenes/girl-eating-orange.png", audioText: "La niña come una naranja.", isCorrect: false },
    ],
  },
];

// --- Node 1: PlanUnit ------------------------------------------------------
// Deconstructs the CEFR topic into the scene (visual drill) for this tick.
async function planUnit(state: LessonStateType): Promise<Partial<LessonStateType>> {
  const template = SCENE_BANK[state.drillsCompleted % SCENE_BANK.length];
  return {
    currentScene: { ...template, id: `${state.topic || "intro"}-${state.drillsCompleted}` },
  };
}

// --- Node 2: TeacherDrill ---------------------------------------------------
// Elena introduces the visual stimulus and speaks the target phrase.
function makeTeacherDrill(callLLM: LLMCaller) {
  return async function teacherDrill(state: LessonStateType): Promise<Partial<LessonStateType>> {
    if (!state.currentScene) throw new Error("teacherDrill ran before planUnit produced a scene.");
    const prompt = `Presenta esta escena a la clase, en español, siguiendo tus reglas: ${JSON.stringify(state.currentScene)}`;
    const reply = await callLLM(maestraElena, prompt, state.messages);
    return { messages: [new HumanMessage(prompt), new AIMessage(reply)] };
  };
}

// --- Node 3: PeerSimulation --------------------------------------------------
// Mateo or Sofía responds first, occasionally modeling a mistake.
function makePeerSimulation(callLLM: LLMCaller) {
  return async function peerSimulation(state: LessonStateType): Promise<Partial<LessonStateType>> {
    const useMateo = Math.random() < 0.5;
    const agent = useMateo ? peerMateo : peerSofia;
    // Whether/which error Mateo makes is decided here in code, not by the
    // model, so the 30% injection rate from his persona is an exact
    // probability rather than something the LLM might drift away from.
    const shouldError = useMateo && Math.random() < (peerMateo.errorInjectionRate ?? 0);
    const errorPattern = shouldError && peerMateo.errorBank ? peerMateo.errorBank[Math.floor(Math.random() * peerMateo.errorBank.length)] : undefined;

    let text: string;
    if (errorPattern) {
      // Use the scripted example verbatim — it's a specific, tested error, not
      // something worth leaving to chance.
      text = errorPattern.example;
    } else {
      const prompt = `Reacciona brevemente a esta escena, en tu propio estilo: ${JSON.stringify(state.currentScene)}`;
      text = await callLLM(agent, prompt, state.messages);
    }

    return {
      peerTurnAgentId: agent.id,
      peerTurnText: text,
      peerTurnHadError: Boolean(errorPattern),
      messages: [new AIMessage(text)],
    };
  };
}

// --- Node 4: UserPrompt ------------------------------------------------------
// Suspends the graph until the frontend delivers a voice/selection response.
// LangGraph's `interrupt()` pauses execution and returns whatever value the
// caller resumes the graph with (see the frontend's ASR/tile-click handler).
// Requires the graph to be compiled with a checkpointer — there's nowhere to
// save the paused state otherwise.
async function userPrompt(_state: LessonStateType): Promise<Partial<LessonStateType>> {
  const resumed = interrupt({ waitingFor: "user_voice_or_tile_selection" }) as
    | string
    | { response?: string; taQuestion?: string };

  if (typeof resumed === "string") return { userResponse: resumed };
  // An object with `taQuestion` means the learner hit the "Ask TA" hotkey
  // instead of answering, which routes to the TA branch below.
  if (resumed.taQuestion) return { taRequested: true, taQuestion: resumed.taQuestion };
  return { userResponse: resumed.response ?? "" };
}

// --- Node 5: EvaluateResponse -------------------------------------------------
function makeEvaluateResponse(callLLM: LLMCaller) {
  return async function evaluateResponse(state: LessonStateType): Promise<Partial<LessonStateType>> {
    const target = state.currentScene?.targetPhrase ?? "";
    const correct = normalize(state.userResponse) === normalize(target);

    const feedbackAgent = correct ? maestraElena : peerSofia;
    const feedbackPrompt = correct
      ? `El estudiante respondió correctamente: "${state.userResponse}". Celébralo.`
      : `El estudiante respondió "${state.userResponse}" pero el objetivo era "${target}". Da una corrección cálida con recasting.`;
    const feedbackReply = await callLLM(feedbackAgent, feedbackPrompt, state.messages);

    // The phonetics coach doesn't need conversation history — it only ever
    // looks at the single utterance it's asked to score.
    const phoneticNotesReply = await callLLM(phoneticsCoach, `Evalúa la pronunciación de: "${state.userResponse}"`);

    return {
      evaluation: { correct, transcript: state.userResponse, phoneticNotes: [phoneticNotesReply] },
      streak: correct ? state.streak + 1 : 0,
      drillsCompleted: state.drillsCompleted + 1,
      messages: [new HumanMessage(state.userResponse), new AIMessage(feedbackReply)],
    };
  };
}

/** Strips accents, punctuation and case so "el nino bebe agua" matches "El niño bebe agua." */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// --- Branch: TAIntervention ---------------------------------------------------
// Only entered when the learner hits the "Ask TA" hotkey. Answers in English,
// then routes straight back to userPrompt so the drill resumes where it paused.
function makeTAIntervention(callLLM: LLMCaller) {
  return async function taIntervention(state: LessonStateType): Promise<Partial<LessonStateType>> {
    // Deliberately NOT passed the Spanish-classroom `messages` history — the
    // TA only needs the learner's question, not the in-character transcript,
    // and mixing the two risks the TA picking up Spanish-only habits from it.
    const question = state.taQuestion || "The learner pressed Help with no specific question.";
    const reply = await callLLM(taBilingual, question);
    return {
      taRequested: false,
      taQuestion: "",
      messages: [new HumanMessage(`[TA aside] ${question}`), new AIMessage(`[TA aside] ${reply}`)],
    };
  };
}

function routeAfterUserPrompt(state: LessonStateType): "taIntervention" | "evaluateResponse" {
  return state.taRequested ? "taIntervention" : "evaluateResponse";
}

export interface LessonGraphOptions {
  /** Swap in a fake for tests / offline runs. Defaults to the real Anthropic call. */
  callLLM?: LLMCaller;
  /** How many drills before the lesson ends. */
  maxDrills?: number;
}

export function buildLessonGraph(options: LessonGraphOptions = {}) {
  const callLLM = options.callLLM ?? callAnthropic;
  const maxDrills = options.maxDrills ?? 5;

  function routeAfterEvaluate(state: LessonStateType): "planUnit" | typeof END {
    return state.drillsCompleted >= maxDrills ? END : "planUnit";
  }

  const graph = new StateGraph(LessonState)
    .addNode("planUnit", planUnit)
    .addNode("teacherDrill", makeTeacherDrill(callLLM))
    .addNode("peerSimulation", makePeerSimulation(callLLM))
    .addNode("userPrompt", userPrompt)
    .addNode("evaluateResponse", makeEvaluateResponse(callLLM))
    .addNode("taIntervention", makeTAIntervention(callLLM))
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

  // interrupt() in userPrompt can only pause if the graph has somewhere to
  // persist state. MemorySaver keeps it in process memory; swap for a
  // Postgres/Redis checkpointer when this runs behind a real server.
  return graph.compile({ checkpointer: new MemorySaver() });
}
