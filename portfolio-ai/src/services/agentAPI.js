/**
 * agentAPI.js — LLM integration module with secure API key handling and
 * Retrieval-Augmented Generation from the local vector store.
 *
 * The browser NEVER sees a raw provider key in production: `key` is your
 * backend's publishable token (or empty for demo/local-intent mode). The real
 * OpenAI/Anthropic key lives only in the server environment (see backend/).
 */
import { findProject, PROJECTS } from './vectorStore';

const AGENT_API_URL = import.meta.env.VITE_AGENT_API_URL || '';
const AGENT_KEY = import.meta.env.VITE_OPENAI_API_KEY || ''; // publishable/demo key

const SYSTEM_PROMPT = `You are Aether, the AI voice agent embedded in an interactive 3D portfolio site.
Tone: sharp, friendly, concise (voice output — 1-3 sentences unless asked for detail).
Use the provided retrieved portfolio context. If context is insufficient, say so briefly.
The user can command you: "change theme neon|ember|aurora|ocean", "reset", "create a doc about <project>",
"email <project> to <address>", "tell me about <project>".`;

/** Build a RAG prompt by pulling semantically-matched portfolio chunks. */
function buildMessages(userText, history = []) {
  const hit = findProject(userText);
  const context = hit
    ? `Retrieved portfolio context (similarity ${hit.score.toFixed(2)}):\n${JSON.stringify(PROJECTS.find((p) => p.id === hit.id), null, 0)}`
    : 'No strong portfolio match retrieved.';

  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${context}` },
    ...history.slice(-8),
    { role: 'user', content: userText },
  ];
}

/**
 * Ask the agent a question. Tries the secure backend proxy first; if no
 * backend is configured (demo mode) falls back to a deterministic local
 * responder so the voicebot always works offline.
 */
export async function askAgent(userText, history = [], { signal } = {}) {
  if (AGENT_API_URL) {
    const res = await fetch(`${AGENT_API_URL}/agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AGENT_KEY}`,
      },
      body: JSON.stringify({ messages: buildMessages(userText, history) }),
      signal,
    });
    if (!res.ok) throw new Error(`Agent API ${res.status}`);
    const data = await res.json();
    return data.reply || data.content || '…';
  }
  return localResponder(userText, history);
}

/** Offline fallback that still uses vector retrieval for grounded answers. */
function localResponder(text, history) {
  const hit = findProject(text);
  const p = hit ? PROJECTS.find((x) => x.id === hit.id) : null;
  const t = text.toLowerCase();

  if (/hello|hi\b|hey/.test(t)) return 'Hey! I\'m Aether — your guide through this portfolio. Ask me about any project, or try "change theme neon".';
  if (p) return `${p.title}: ${p.blurb} Built with ${p.stack.join(', ')}. Say "create a doc about ${p.title.toLowerCase()}" if you want a shareable summary.`;
  if (/what can you do|help/.test(t)) return 'I answer questions about the projects here, generate Google Doc summaries, email them to anyone, and drive the 3D canvas — "change theme ember", "reset", "open mic".';
  if (/theme/.test(t)) return 'Try: change theme neon, ember, aurora, or ocean.';
  return history.length > 4
    ? 'Still with you — name a project (Nebula Engine, Sentinel Agent, Pulse Metrics) and I\'ll dive in.'
    : 'I couldn\'t match that to a portfolio entry. Try asking about Nebula Engine, Sentinel AI Agent, or Pulse Metrics.';
}

export { AGENT_API_URL, SYSTEM_PROMPT };
