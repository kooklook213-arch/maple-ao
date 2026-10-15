/**
 * Aether Agent Backend — Express blueprint (Module 3 & 4)
 * ---------------------------------------------------------------------------
 *  POST /agent/chat        : LLM proxy (API key stays server-side) + JWT guard
 *  POST /auth/login        : OAuth2 code exchange -> signed JWT
 *  POST /ingest/repo       : multipart .zip (even >60MB) -> unpack/chunk/embed
 *  GET  /memory/search     : semantic query against ChromaDB collection
 *  POST /video/session     : Daily.co room/token creation for WebRTC calls
 *  GET  /workspace/docs    : Google Docs/Slides preview metadata (gapi)
 *
 *  RUN:  npm i express cors multer jsonwebtoken bcryptjs @octokit/rest \
 *              openai chromadb axios googleapis form-data
 *        OPENAI_API_KEY=sk-... JWT_SECRET=... node index.js
 */
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import OpenAI from 'openai';

const exec = promisify(execFile);
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // never exposed to client

/* ----------------------------- auth middleware ---------------------------- */
function requireJwt(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'unauthorized' }); }
}

app.post('/auth/login', async (req, res) => {
  // Exchange OAuth2 code (Google/GitHub) or email+bcrypt here, then:
  const token = jwt.sign({ sub: req.body.subject || 'demo-user', scope: 'agent' }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

/* ------------------------------ LLM chat proxy ---------------------------- */
app.post('/agent/chat', requireJwt, async (req, res) => {
  const { messages = [] } = req.body;
  const completion = await openai.chat.completions.create({
    model: process.env.AGENT_MODEL || 'gpt-4o-mini',
    messages,
    max_tokens: 300,
    temperature: 0.7,
  });
  res.json({ reply: completion.choices[0].message.content });
});

/* -------------------- vector memory (ChromaDB client) --------------------- */
let chromaCol = null;
async function getCollection() {
  if (chromaCol) return chromaCol;
  const { ChromaClient } = await import('chromadb');
  const client = new ChromaClient({ path: process.env.CHROMA_URL || 'http://localhost:8000' });
  chromaCol = await client.getOrCreateCollection({ name: 'portfolio', embeddingFunction: null });
  return chromaCol;
}

app.get('/memory/search', requireJwt, async (req, res) => {
  const col = await getCollection();
  const results = await col.query({ queryTexts: [String(req.query.q || '')], nResults: 4 });
  res.json(results);
});

/* ---------------- GitHub repo processor: zip -> chunks -> embeddings ------- */
const upload = multer({ dest: path.join(os.tmpdir(), 'aether-zips/'), limits: { fileSize: 500 * 1024 * 1024 } });

const CODE_EXT = /\.(js|jsx|ts|tsx|py|go|rs|java|cpp?|cs|rb|php|sql|sh|glsl|html?|css|md|json|ya?ml)$/i;
const MAX_CHUNK = 1200; // chars per embedding chunk

app.post('/ingest/repo', requireJwt, upload.single('repo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'multipart field "repo" (.zip) required' });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
  try {
    // 1. unpack (stream-safe `unzip`; handles >60MB archives fine on disk)
    await exec('unzip', ['-q', '-o', req.file.path, '-d', workDir]);

    // 2. walk + parse + chunk
    const chunks = [];
    const walk = async (dir) => {
      for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(p);
        else if (CODE_EXT.test(entry.name)) {
          const text = await fsp.readFile(p, 'utf8').catch(() => '');
          for (let i = 0; i < text.length; i += MAX_CHUNK) {
            chunks.push({ id: `${path.relative(workDir, p)}#${i}`, doc: text.slice(i, i + MAX_CHUNK) });
            if (chunks.length > 4000) return; // safety cap per repo
          }
        }
      }
    };
    await walk(workDir);

    // 3. embed into the vector DB (Chroma computes embeddings server-side)
    const col = await getCollection();
    for (let i = 0; i < chunks.length; i += 64) {
      const batch = chunks.slice(i, i + 64);
      await col.add({ ids: batch.map((c) => c.id), documents: batch.map((c) => c.doc),
                      metadatas: batch.map((c) => ({ source: c.id.split('#')[0] })) });
    }
    res.json({ ok: true, ingestedChunks: chunks.length });
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
    await fsp.rm(req.file.path, { force: true });
  }
});

/* ------------------- Real-time video sessions (Daily.co wrapper) ----------- */
app.post('/video/session', requireJwt, async (req, res) => {
  const resp = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: { eject_at_participant_rejoin: false, enable_chat: false } }),
  });
  const room = await resp.json();
  const tokResp = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: { room: room.name, valid_for_seconds: 3600 } }),
  });
  const { token } = await tokResp.json();
  res.json({ url: room.url, token }); // client joins via @daily-co/daily-js preloadScript
});

/* ---------------- Google Workspace helper (Docs/Slides previews) ----------- */
app.get('/workspace/docs', requireJwt, async (req, res) => {
  // Using service-account creds; returns iframe-able preview URLs.
  const { google } = await import('googleapis');
  const oauth = new google.auth.JWT({
    email: process.env.GSA_EMAIL,
    key: (process.env.GSA_KEY_B64 && Buffer.from(process.env.GSA_KEY_B64, 'base64').toString()) || process.env.GSA_KEY,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth: oauth });
  const { data } = await drive.files.list({ q: `name contains '${req.query.q || ''}'`, pageSize: 10, fields: 'files(id,name,mimeType)' });
  res.json(data.files.map((f) => ({
    ...f,
    previewUrl: f.mimeType.includes('presentation')
      ? `https://docs.google.com/presentation/d/${f.id}/embed`
      : `https://docs.google.com/document/d/${f.id}/preview`,
  })));
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(process.env.PORT || 8787, () => console.log('Aether agent backend :8787'));
