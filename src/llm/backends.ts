import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AgentPersona } from "../types/agent";

/**
 * Every LLM backend satisfies this one signature, which is what lets the
 * lesson graph stay provider-agnostic — it never learns who is answering.
 */
export type LLMCaller = (agent: AgentPersona, userMessage: string, history?: BaseMessage[]) => Promise<string>;

/** Coach reports measurements, so it wants consistency; classroom personas want variety. */
function temperatureFor(agent: AgentPersona): number {
  return agent.role === "phonetics_coach" ? 0.2 : 0.7;
}

/**
 * Wraps any LangChain chat model as an LLMCaller. Clients are cached per
 * agent because a chat model is an HTTP client underneath — no reason to
 * rebuild one every turn.
 */
function makeCaller(build: (agent: AgentPersona) => BaseChatModel): LLMCaller {
  const cache = new Map<string, BaseChatModel>();

  return async (agent, userMessage, history = []) => {
    let model = cache.get(agent.id);
    if (!model) {
      model = build(agent);
      cache.set(agent.id, model);
    }
    const response = await model.invoke([new SystemMessage(agent.systemPrompt), ...history, new HumanMessage(userMessage)]);
    return typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  };
}

// --- Qwen (Alibaba Model Studio / DashScope, or anything OpenAI-compatible) ---

/** Singapore endpoint. For the Beijing console use https://dashscope.aliyuncs.com/compatible-mode/v1 */
const DASHSCOPE_INTL_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

function isLocalEndpoint(baseUrl: string): boolean {
  return baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
}

/**
 * Qwen through an OpenAI-compatible endpoint. That one shape covers every
 * practical way to run Qwen — Alibaba's DashScope, OpenRouter, Together,
 * a self-hosted vLLM server, or Ollama on your own laptop — so switching
 * between them is a base URL change, not a code change.
 */
export const callQwen: LLMCaller = makeCaller((agent) => {
  const baseURL = process.env.QWEN_BASE_URL ?? DASHSCOPE_INTL_BASE_URL;
  // Local runtimes (Ollama, vLLM) ignore the key but the client still
  // requires a non-empty one.
  const apiKey = process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? (isLocalEndpoint(baseURL) ? "local" : undefined);

  if (!apiKey) {
    throw new Error(
      `No Qwen API key found. Set DASHSCOPE_API_KEY (or QWEN_API_KEY) in .env.local, ` +
        `or point QWEN_BASE_URL at a local runtime such as http://localhost:11434/v1 for Ollama.`
    );
  }

  return new ChatOpenAI({
    model: process.env.QWEN_MODEL ?? "qwen-plus",
    temperature: temperatureFor(agent),
    apiKey,
    configuration: { baseURL },
  });
});

// --- Claude (kept available; switch with LLM_PROVIDER=anthropic) ---

export const callAnthropic: LLMCaller = makeCaller(
  (agent) =>
    new ChatAnthropic({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
      temperature: temperatureFor(agent),
    })
);

/** Picks the backend from LLM_PROVIDER. Defaults to Qwen. */
export function resolveLLMBackend(): LLMCaller {
  const provider = (process.env.LLM_PROVIDER ?? "qwen").toLowerCase();
  switch (provider) {
    case "qwen":
      return callQwen;
    case "anthropic":
    case "claude":
      return callAnthropic;
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}". Expected "qwen" or "anthropic".`);
  }
}
