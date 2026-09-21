/**
 * Runs a full lesson through the graph with a fake LLM so the flow can be
 * watched (and verified) without an API key or any audio hardware.
 *
 *   npm run demo
 *
 * Scripted learner answers below drive the run: one correct, one wrong, one
 * "Ask TA" interrupt, proving the TAIntervention branch resumes cleanly.
 */
import { Command } from "@langchain/langgraph";
import { buildLessonGraph, type LLMCaller } from "../graphs/lesson_graph";

const fakeLLM: LLMCaller = async (agent, userMessage) => {
  const preview = userMessage.length > 70 ? `${userMessage.slice(0, 70)}...` : userMessage;
  console.log(`   [LLM] ${agent.displayName} <- "${preview}"`);
  return `(respuesta simulada de ${agent.displayName})`;
};

/** What the "learner" does at each userPrompt pause, in order. */
const SCRIPTED_TURNS = [
  "El niño bebe agua.",
  { taQuestion: "Why is it 'el agua' if agua is feminine?" },
  "Los hombres corren.",
  "la nina come una naranja",
];

async function main() {
  const graph = buildLessonGraph({ callLLM: fakeLLM, maxDrills: 3 });
  const config = { configurable: { thread_id: "demo-lesson-1" } };

  console.log("\n=== Lección: arrancando ===\n");

  await graph.invoke({ cefrLevel: "A1.1", topic: "acciones-cotidianas" }, config);

  for (const turn of SCRIPTED_TURNS) {
    // A non-empty `next` means the graph is parked mid-run — i.e. userPrompt
    // called interrupt() and is waiting on the learner. Empty means it ended.
    const paused = await graph.getState(config);
    if (paused.next.length === 0) break;

    const label = typeof turn === "string" ? `"${turn}"` : `[Ask TA] "${turn.taQuestion}"`;
    console.log(`\n>> Estudiante: ${label}`);

    await graph.invoke(new Command({ resume: turn }), config);
  }

  const state = await graph.getState(config);

  console.log("\n=== Lección: terminada ===");
  console.log(`   drills completados : ${state.values.drillsCompleted}`);
  console.log(`   racha (streak)     : ${state.values.streak}`);
  console.log(`   turnos en historial: ${state.values.messages.length}`);
  console.log(`   siguiente nodo     : ${state.next.length ? state.next.join(", ") : "(END)"}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
