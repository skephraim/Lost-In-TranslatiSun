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
- Real LLM backends in `src/llm/backends.ts` — **Qwen by default**, Claude
  optional. Every node that talks to an agent sends that persona's
  `systemPrompt` plus the running `messages` transcript and appends the reply
  back onto it, so agents have memory of the lesson so far. Copy
  `.env.example` to `.env.local` to point it at a real model.
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
function matching the `LLMCaller` signature; with nothing passed it reads
`LLM_PROVIDER` and picks one. That's what lets the demo (and any future
tests) run offline — the graph doesn't know or care what's answering.

## Choosing a model

`LLM_PROVIDER=qwen` (the default) talks to Qwen over an **OpenAI-compatible**
endpoint, which is the same wire format DashScope, OpenRouter, Together,
vLLM and Ollama all expose. Switching between them is a `QWEN_BASE_URL`
change, not a code change:

| Route | `QWEN_BASE_URL` | Key |
|---|---|---|
| Alibaba Model Studio (Singapore) | *(default)* `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` |
| Alibaba Model Studio (Beijing) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` |
| Ollama, on your own machine | `http://localhost:11434/v1` | none needed |
| OpenRouter / Together / vLLM | that host's `/v1` | `QWEN_API_KEY` |

`LLM_PROVIDER=anthropic` switches the whole classroom to Claude instead.
Both paths are live; nothing else in the codebase changes.

## Phase 2: the visual immersion grid

`<VisualImmersionGrid />` (`src/components/VisualImmersionGrid.tsx`) is the
Rosetta-style 2x2 matcher, served by a Next.js 16 App Router page. Run it
with `npm run dev` and open http://localhost:3000.

All three interaction modes are implemented:

| Mode | What the learner does | Captions |
|---|---|---|
| `contrastive_deduction` | Picks the tile matching the phrase | Shown — the contrast *is* the lesson |
| `listen_select` | Hears the phrase, picks the tile | **Hidden until answered** — otherwise it's a reading test, not a listening one |
| `speak_match` | Target tile is ringed; learner says the phrase | Shown |

`scene.expectedResponseType` is load-bearing, not decorative: when it's
`"speech"`, tile clicks *and* the 1-4 keyboard shortcuts are disabled, so a
learner can't satisfy a speaking drill by clicking the tile already
highlighted for them.

Audio uses the browser's own `speechSynthesis`, preferring an `es-MX` voice
and speaking at 0.9x — matching Maestra Elena's configured cadence.

### Tiles are drawn, not photographed

`src/components/SceneArt.tsx` renders each tile as inline SVG from a shared
vocabulary (subject + action + object) rather than loading images. That's a
pedagogical choice as much as a practical one: two tiles whose Spanish
differs by one word also differ by exactly one visual mark, so the learner
maps word to meaning by comparison. It also means no asset pipeline, no
network, and no image licensing. `SceneTile.imageUrl` remains as an escape
hatch for real photography later.

The art is deliberately plain line-work — functional placeholder quality,
not a finished visual identity.

## Phase 3: speech capture and TruAccent

Hold the mic button in a `speak_match` drill: the app records, transcribes,
scores the pronunciation, and shows a waveform with the measurements.

- `src/components/audio/` — `useAudioRecorder` (MediaRecorder + a live level
  meter from a Web Audio analyser), the hold-to-talk button, the waveform,
  and the feedback panel.
- `src/services/asr/` — a `SpeechRecognizer` interface with two engines.
  The interface follows the *recording lifecycle* (`begin` / `finish` /
  `cancel`) rather than `transcribe(blob)`, because the Web Speech API
  listens to the mic itself and never sees a blob — modelling it as a
  file-taking function would misrepresent how it works.
- `src/services/truaccent/` — the scorer, with tests.

Recording and recognition run **in parallel** on one press. A live engine
never hands back the audio, so capturing alongside it is the only way to get
both a transcript and a waveform from a single utterance.

### What the scorer can and cannot actually tell you

This is the part most worth understanding before trusting it.

Everything comes from the transcript plus measurable audio properties. There
is no formant analysis, so the scorer **cannot hear vowel quality directly**.
What it can do is notice when the recognizer heard a *different word* and
reason about which articulation would explain the substitution — "corren"
coming back as "coren" is real evidence the trill became a tap.

That drives a three-valued result, and the middle one matters:

| Status | Means |
|---|---|
| `missed` | Positive evidence of a problem — a substitution consistent with this target |
| `ok` | Positive evidence the sound was produced |
| `not_assessable` | Target absent from the phrase, **or undetectable without acoustics** |

**A matching transcript is not evidence of good pronunciation.** Recognizers
snap to the nearest plausible word and will happily transcribe a heavily
accented "perro" as "perro". Reporting "✓ your vowels were perfect" on that
basis would be fabricated praise, and worse than silence for a learner who
would then stop working on it. So the scorer says `not_assessable` wherever
it genuinely cannot tell, and the UI labels those "sin evaluar" rather than
dressing them up as passes. A test asserts this specifically.

Because of that, **drill phrases should contain the sounds being coached** —
otherwise every finding is honestly but uselessly "not assessable". The
trill drill uses "Los hombres corren" for exactly this reason.

### On the "native model" waveform comparison

The original plan called for comparing the learner's waveform against a
native model's. Browser speech synthesis offers **no way to capture its
output as audio data** — there is no `MediaStream` from `speechSynthesis` —
so there is no native curve to overlay. Rather than draw a plausible-looking
fake, the waveform shows the learner's real envelope against the phrase's
expected *syllable count*, which is genuine and actionable: seven syllables
should yield roughly seven energy bursts, so running words together shows
up. A true overlay needs recorded native-speaker clips per phrase.

## What's not here yet (later phases)

- **The UI and the lesson graph are still separate** (Phase 5). The grid
  reads scenes from the static bank; nothing streams them from LangGraph
  over SSE yet, and a spoken attempt scores locally without feeding its
  result back to Elena for a reaction.
- **No multi-voice TTS** — all three classroom personas share the browser's
  one Spanish voice. Distinct ElevenLabs/OpenAI voices per persona, and the
  per-persona cadence already in their configs, are not wired up.
- **No classroom avatars or top-bar progress** (Phase 5's UI layer).
- **No real acoustic analysis** — see the scorer's limits above.

## Running it

```bash
npm install
npm run typecheck   # no API key needed
npm run test        # scorer tests, no API key needed
npm run dev         # the UI at http://localhost:3000
npm run demo        # full lesson with a fake LLM, no API key needed
```

`npm run demo` prints each agent turn as it happens, so you can watch the
state machine move through the nodes and see exactly where it pauses for the
learner.
