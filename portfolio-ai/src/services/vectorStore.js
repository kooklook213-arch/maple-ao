/**
 * Lightweight local vector store for private, ultra-fast semantic retrieval
 * of portfolio data — runs entirely client-side (no data leaves the device).
 *
 * In production you would swap `embed()` for an edge runtime call to
 * ChromaDB / Vectorite / pgvector; the interface stays identical.
 */

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'for', 'on', 'with', 'my', 'your']);

/** Deterministic local embedding: hashed bag-of-words -> normalized Float32 vector. */
export function embed(text, dims = 128) {
  const vec = new Float32Array(dims);
  const tokens = String(text).toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((t) => t && !STOPWORDS.has(t));
  for (const tok of tokens) {
    // simple 2-gram char hash for fuzzy matching ("robotics" ~ "robot")
    for (let i = 0; i < tok.length; i++) {
      const gram = tok.slice(i, i + 3);
      let h = 2166136261;
      for (let j = 0; j < gram.length; j++) { h ^= gram.charCodeAt(j); h = Math.imul(h, 16777619); }
      vec[Math.abs(h) % dims] += 1;
    }
  }
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dims; i++) vec[i] /= norm;
  return vec;
}

export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

class LocalVectorStore {
  constructor(items = []) {
    this.records = items.map((item) => ({ ...item, vector: embed(item.text) }));
  }

  add(item) { this.records.push({ ...item, vector: embed(item.text) }); }

  /** Returns top-k matches with similarity scores. */
  query(text, k = 3) {
    const q = embed(text);
    return this.records
      .map((r) => ({ ...r, score: cosine(q, r.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  best(text, k = 1, threshold = 0.12) {
    const hits = this.query(text, k);
    return hits.length && hits[0].score >= threshold ? hits[0] : null;
  }
}

export const PROJECTS = [
  {
    id: 'nebula-engine', title: 'Nebula Engine', text: 'Nebula Engine real-time WebGL particle renderer GPU compute shaders 60fps digital canvas creative coding three.js',
    stack: ['React', 'Three.js', 'GLSL', 'WebGPU'], blurb: 'A GPU-driven particle engine rendering 1M+ points at 60fps with custom displacement shaders.', slides: '',
  },
  {
    id: 'sentinel-agent', title: 'Sentinel AI Agent', text: 'Sentinel autonomous agent LLM orchestration tool calling RAG chromadb vector memory voice assistant automation',
    stack: ['Node.js', 'OpenAI', 'ChromaDB'], blurb: 'Autonomous multi-tool agent with retrieval-augmented memory and hands-free voice control.', slides: '',
  },
  {
    id: 'pulse-metrics', title: 'Pulse Metrics', text: 'Pulse metrics analytics dashboard realtime streaming pipeline clickhouse grafana observability charts',
    stack: ['Python', 'FastAPI', 'ClickHouse'], blurb: 'Streaming observability platform ingesting 40k events/sec with sub-second dashboards.', slides: '',
  },
  {
    id: 'aether-portfolio', title: 'Aether Portfolio', text: 'Aether portfolio site interactive 3D landing canvas voicebot sidebar google apps script webrtc video calls',
    stack: ['React', 'R3F', 'Web Speech API'], blurb: 'This very site: cursor-reactive shader mesh plus an embedded AI voice assistant.', slides: '',
  },
];

export const store = new LocalVectorStore(PROJECTS.map((p) => ({ id: p.id, text: `${p.title}. ${p.text}` })));

export function findProject(query) { return store.best(query, 2); }
