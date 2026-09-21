import type { AgentPersona } from "../types/agent";
import { maestraElena } from "./maestra_elena";
import { peerMateo } from "./peer_mateo";
import { peerSofia } from "./peer_sofia";
import { phoneticsCoach } from "./phonetics_coach";
import { taBilingual } from "./ta_bilingual";

export { maestraElena, peerMateo, peerSofia, phoneticsCoach, taBilingual };

/** Lookup table the lesson graph uses to resolve `AgentId -> AgentPersona`. */
export const AGENT_REGISTRY: Record<string, AgentPersona> = {
  [maestraElena.id]: maestraElena,
  [peerMateo.id]: peerMateo,
  [peerSofia.id]: peerSofia,
  [phoneticsCoach.id]: phoneticsCoach,
  [taBilingual.id]: taBilingual,
};

export function getAgent(id: string): AgentPersona {
  const agent = AGENT_REGISTRY[id];
  if (!agent) {
    throw new Error(`Unknown agent id: "${id}". Known agents: ${Object.keys(AGENT_REGISTRY).join(", ")}`);
  }
  return agent;
}
