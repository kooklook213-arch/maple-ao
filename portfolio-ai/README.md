# Aether — Interactive 3D AI Portfolio (React + Three.js/R3F + Voice Agent)

Production-ready architecture for a next-gen digital presence: a cursor-reactive
shader mesh hero, an open-webui-style **AI voicebot sidebar** wired to a
**Google Apps Script Web App**, local hotword voice commands, private vector-store
RAG memory, and a scalable backend blueprint.

```
portfolio-ai/
├─ index.html                     # SPA entry (viewport-fit=cover for mobile)
├─ .env                           # REACT_APP_GOOGLE_SCRIPT_URL (+ optional VITE_AGENT_API_URL)
├─ vite.config.js                 # dev/build config (envPrefix covers REACT_APP_* + VITE_*)
├─ Dockerfile / nginx.conf        # containerized frontend deploy
├─ appsScript/Code.gs.js          # ← paste into script.google.com (doPost: createDoc/email/slides)
├─ backend/index.js               # Express blueprint: JWT auth, LLM proxy, zip→ChromaDB ingest, Daily.co WebRTC
└─ src/
   ├─ App.jsx                     # Layout wrapper: hero canvas + preserved page content + injected sidebar
   ├─ index.css                   # themes via [data-theme], glassmorphism, full mobile responsiveness
   ├─ canvas/
   │  ├─ HeroCanvas.jsx           # R3F <Canvas dpr={[1,2]}> auto-resize, touch-action:none
   │  └─ AgentMesh.jsx            # ★ GLSL vertex-displaced icosphere + particle circle
   ├─ sidebar/
   │  ├─ VoicebotSidebar.jsx      # ★ intent interceptor → Google actions → LLM chat loop
   │  └─ WaveVisualizer.jsx       # real-time mic waveform (AnalyserNode energy, rAF-driven)
   ├─ hooks/
   │  ├─ useSpeech.js             # Web Speech STT + TTS + getUserMedia amplitude meter
   │  ├─ useVoiceCommands.js      # hotwords: "change theme X", "reset", doc/email intents
   │  └─ useAmbientAwareness.js   # AmbientLightSensor + device-motion (shake = reset)
   ├─ services/
   │  ├─ googleScriptService.js   # fetch POST w/ env fallback (edit URL at top of file)
   │  ├─ agentAPI.js              # secure-key LLM module + RAG prompt builder + offline responder
   │  └─ vectorStore.js           # local hashed-embedding vector DB (swap-in point for Chroma/Vectorite)
   └─ data/themes.js              # palettes shared by shader + CSS + voice commands
```

## Module highlights

### 1 · 3D Canvas (`AgentMesh.jsx`)
* Custom GLSL: FBM noise displaces an icosphere; a 5k-point orbital **particle circle** swirls around it.
* **Mouse responsiveness**: NDC pointer position warps vertices near the cursor, tilts/rotates the group, and drags particles toward it.
* **Dynamic color & speed**: cursor velocity is integrated each frame into `uEnergy` (0→1). Cool blue at rest → neon purple/red at hyper-speed (`mix(col, uHotColor, smoothstep(...))`). Live SPEED/FPS HUD shows the state (CALM/FLOW/HYPER).
* **Mobile**: `dpr=[1,2]`, adaptive particle count (2.2k on phones), `100svh` hero, ResizeObserver-based auto resize — no aspect breakage or lag.

### 2 · Layout & Sidebar
* The canvas *is* the hero background; all original sections keep their document flow.
* `VoicebotSidebar` slides in from the right (full-width on ≤640px), never mutating page HTML.
* Chat timeline + text input + prominent pulsing mic button + live waveform while listening/speaking.
* When the API returns `docUrl`, the chat renders an **iframe preview card** with a direct markdown link underneath.

### 3 · Voice Agent
* Web Speech API (STT/TTS) with graceful degradation; Whisper/TTS endpoints can replace `useSpeech` internals behind the same hook API.
* Local hotwords fire **before** the LLM: `change theme neon|ember|aurora|ocean|light`, `reset`, plus Google intents (`create a doc about …`, `email … to someone@x.com`, `show slides for …`).
* `agentAPI.js` sends the publishable token only; the real key lives in the backend. `vectorStore.js` gives instant private semantic retrieval (interface-compatible with ChromaDB/Vectorite swaps).
* Sensors: mic via `getUserMedia`; ambient light + motion where available (shake-to-reset).

### 4 · Cloud integrations
* **Google Workspace**: `appsScript/Code.gs.js` implements `createDoc`, `emailProject`, `summarizeSlides`; backend `/workspace/docs` lists Drive previews for modal iframes.
* **GitHub processor**: `POST /ingest/repo` accepts `.zip` up to 500MB (multer disk storage), unpacks, chunks code files, embeds into ChromaDB so the agent can discuss the project.
* **Video**: `POST /video/session` mints Daily.co rooms + meeting tokens (Agora swap is one function away).
* **Auth/scaling**: JWT middleware on every privileged route; OAuth2 login stub; Docker/nginx frontend + stateless backend → scale horizontally on AWS ECS/Vercel.

## Run it

```bash
cd portfolio-ai
npm install
npm run dev          # http://localhost:5173
```

Env (already seeded in `.env`):

```
REACT_APP_GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/AKfyc.../exec
VITE_AGENT_API_URL=          # set to your backend to enable full LLM mode
```

If your env loader fails, `googleScriptService.js` falls back to the hard-coded
URL at the top of the file — edit that single constant and everything keeps working.

## Deploying to GitHub Pages (naming & URLs)

The repo is wired so the site name, tab title, favicon, and asset URLs all match
your GitHub repo automatically:

1. **Create the repo** named e.g. `portfolio-ai` (or anything you like).
2. **Set branding (one-time):** edit in `package.json`:
   - `"homepage": "https://YOUR-GITHUB-USERNAME.github.io/portfolio-ai/"`
   - optionally add a `SITE_TITLE` var in repo **Settings → Secrets and variables → Actions → Variables**.
3. **Custom domain (optional):** create a `CNAME` file at repo root with your domain —
   the build copies it into `dist/` automatically.
4. **Deploy — two options:**
   - **GitHub Actions (recommended):** push to `main`. `.github/workflows/deploy.yml`
     builds with the correct base path derived from `GITHUB_REPOSITORY` and publishes
     `portfolio-ai/dist` via *Settings → Pages → Source: GitHub Actions*.
   - **Manual:** `git remote add origin https://github.com/YOU/portfolio-ai.git`, then
     `npm run deploy` (uses `gh-pages` to publish `dist/` to the `gh-pages` branch;
     set Pages source to that branch once).
5. **How naming works:** `scripts/site-meta.mjs` derives Vite `base` = `/<repo-name>/`
   in CI (so `/assets/...` never 404s on project pages), fills `<title>%SITE_TITLE%</title>`
   as `Brand — Repo Name`, rewrites the favicon href through `%BASE_URL%`, emits
   `dist/404.html` for SPA deep-link fallback, and carries `CNAME` into `dist/`.
   Test the project-page layout locally with `VITE_BASE=/portfolio-ai/ npm run build`.

**Notes**
* Voice recognition needs Chrome/Edge/Safari and HTTPS (or localhost); mic permission is requested on first tap.
* **After deploying, re-deploy your Apps Script:** paste the updated `appsScript/Code.gs.js` into script.google.com → Deploy → *New deployment* (Web app, Execute as: me, Access: anyone). The new `doGet ?action=listRecent` handler lets the sidebar recover the `docUrl` even though browser POSTs to Apps Script return opaque responses (a CORS limitation of the /exec redirect — the doc still gets created either way; you'll see a "check your Drive" notice if recovery isn't available).
* Apps Script must be deployed as a Web App with *Execute as: Me / Access: Anyone* for `docUrl` responses; otherwise requests are sent but the browser response is opaque (the UI tells you this).
