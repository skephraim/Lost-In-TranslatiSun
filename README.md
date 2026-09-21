# RosettaMAIC

A Latin American Spanish immersion platform, architecturally inspired by
[THU-MAIC/OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)'s multi-agent
classroom pattern (LangGraph orchestration, SSE streaming, multi-voice TTS)
but rebuilt around a "Hybrid Dynamic Immersion" teaching method instead of
slide generation.

## Status: Phase 1 (agent personas + lesson graph skeleton)

This is the first build-out phase of a larger plan. It's intentionally
scoped narrow — see "What's here" vs. "What's not here yet" below.

## The five agents (`src/agents/`)

| File | Persona | Role |
|---|---|---|
| `maestra_elena.ts` | Maestra Elena | Lead instructor. 100% Spanish, teaches by visual contrast, never translates. |
| `peer_mateo.ts` | Mateo | Non-native peer. Injects realistic Anglophone learner errors ~30% of the time (gender agreement, false cognates, regularized irregular preterites, ser/estar, redundant pronouns). |
| `peer_sofia.ts` | Sofía | Native Mexican peer. Fluent, colloquial, models correct forms by natural contrast rather than direct correction. |
| `phonetics_coach.ts` | TruAccent Evaluator | Non-conversational. Scores pronunciation against IPA targets (trilled *rr*, tapped *r*, intervocalic *d*, pure five-vowel system, stress placement). |
| `ta_bilingual.ts` | Profe Lucas | Dormant bilingual TA. Only speaks English when the learner explicitly invokes the help hotkey; always hands the learner back into Spanish. |

Each persona is a plain TypeScript object (`AgentPersona`, defined in
`src/types/agent.ts`) — think of it as a *row* in a table where the columns
are `id`, `systemPrompt`, `voice`, etc. `src/agents/index.ts` is the lookup
table (`AGENT_REGISTRY`) the lesson graph uses to go from an agent id string
to the full persona object, the same way you'd `SELECT * FROM agents WHERE
id = ?` in SQL instead of hardcoding five separate variables everywhere.

## The lesson graph (`src/graphs/lesson_graph.ts`)

A [LangGraph](https://langchain-ai.github.io/langgraphjs/) `StateGraph` — a
state machine where each **node** is a function that reads the current
lesson state and returns the fields it wants to change, and **edges**
(including conditional ones) decide which node runs next. It implements the
six nodes from the RosettaMAIC plan:

```
START -> planUnit -> teacherDrill -> peerSimulation -> userPrompt
                                                          |
                                    (taRequested?) --------+--------
                                    yes -> taIntervention   no -> evaluateResponse
                                             |                        |
                                             +-> back to userPrompt   +-> planUnit (loop)
```

`userPrompt` calls LangGraph's `interrupt()`, which pauses the whole graph
mid-execution and hands control back to whatever is running it (the Next.js
API route, eventually) until the frontend resumes it with the learner's
voice transcript or tile selection. That's the mechanism that lets a human
sit in the middle of an otherwise-automated agent loop.

## What's here

- Full, real system prompts for all five personas (Phase 1 deliverable).
- A compiling LangGraph skeleton with correct node/edge/interrupt wiring.
- Shared TypeScript types (`AgentPersona`, `Scene`, `SceneTile`, lesson state).
- A real `callAnthropic()` backed by `@langchain/anthropic`'s `ChatAnthropic`.
  Every node that talks to an agent sends that persona's `systemPrompt` plus
  the running `messages` transcript and appends the reply back onto it, so
  agents have memory of the lesson so far. Copy `.env.example` to `.env.local`
  and set `ANTHROPIC_API_KEY` to actually run it.
- A **runnable demo** (`npm run demo`) that drives a whole lesson with a fake
  LLM — no API key, no microphone needed. It proves the graph wiring works:
  drills advance, the "Ask TA" interrupt pauses and resumes cleanly, wrong
  answers route to Sofía instead of Elena, and the lesson terminates at
  `maxDrills` instead of looping forever.

## Two things worth knowing about the graph

**It needs a checkpointer.** `userPrompt` calls `interrupt()`, and LangGraph
can only pause mid-execution if it has somewhere to persist the half-finished
state. `buildLessonGraph()` compiles with an in-process `MemorySaver`; swap
that for a Postgres or Redis checkpointer before running this behind a real
server, or every page refresh loses the lesson.

**The LLM backend is swappable.** `buildLessonGraph({ callLLM })` takes any
function matching the `LLMCaller` signature and defaults to `callAnthropic`.
That's what lets the demo (and any future tests) run offline — the graph
doesn't know or care what's answering.

## What's not here yet (later phases)

- **No `<VisualImmersionGrid />` UI** (Phase 2) — `Scene`/`SceneTile` types
  exist so the graph and a future frontend agree on shape, but there's no
  React component yet.
- **No ASR/TTS/phoneme-scoring pipeline** (Phase 3) — the phonetics coach's
  `PHONETIC_TARGETS` are defined, but nothing analyzes real audio yet.
- **No Next.js app, API routes, or SSE streaming** (Phase 5) — this repo is
  currently just the agent/graph "brain," no server or UI around it.

## Running it

```bash
npm install
npm run typecheck   # no API key needed
npm run demo        # full lesson with a fake LLM, no API key needed
```

`npm run demo` prints each agent turn as it happens, so you can watch the
state machine move through the nodes and see exactly where it pauses for the
learner.
