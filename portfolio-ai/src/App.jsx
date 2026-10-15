import { useCallback, useEffect, useState } from 'react';
import HeroCanvas from './canvas/HeroCanvas';
import VoicebotSidebar from './sidebar/VoicebotSidebar';
import useAmbientAwareness from './hooks/useAmbientAwareness';
import { THEMES, DEFAULT_THEME } from './data/themes';
import { PROJECTS } from './services/vectorStore';

/**
 * App — Layout wrapper.
 *  • The 3D canvas occupies the hero/front page as the ambient core interface.
 *  • ALL original page content (about / work sections / footer) stays in its
 *    normal document flow — the sidebar is injected purely as an overlay.
 *  • Voice "reset" hotword -> resetSignal counter consumed by AgentMesh.
 */
export default function App() {
  const [themeName, setThemeName] = useState(DEFAULT_THEME);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  const theme = THEMES[themeName] || THEMES[DEFAULT_THEME];

  /* sync palette to CSS variables + data-theme for UI chrome */
  useEffect(() => {
    document.documentElement.dataset.theme = themeName;
  }, [themeName]);

  const handleThemeChange = useCallback((t) => { if (THEMES[t]) setThemeName(t); }, []);
  const handleReset = useCallback(() => { setResetSignal((n) => n + 1); setThemeName(DEFAULT_THEME); }, []);

  /* ambient awareness: shake gesture resets the scene (mobile) */
  const ambient = useAmbientAwareness({ onShake: handleReset });

  return (
    <>
      {/* ================= HERO / FRONT PAGE (content preserved) ============ */}
      <section className="hero">
        <HeroCanvas theme={theme} resetSignal={resetSignal} />

        <div className="hero-content">
          <span className="kicker">Creative Engineer · AI Systems · WebGL</span>
          <h1>Building living<br />digital presence.</h1>
          <p className="sub">
            Move your cursor fast — the core reacts to your energy. Then open the mic and
            let the agent fetch docs, send emails, or repaint the universe for you.
          </p>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => setSidebarOpen(true)}>🎙 Talk to the AI</button>
            <a className="btn" href="#work">View work ↓</a>
            <button
              className="btn icon"
              title="Cycle palette"
              onClick={() => {
                const keys = Object.keys(THEMES);
                setThemeName(keys[(keys.indexOf(themeName) + 1) % keys.length]);
              }}>◐</button>
            {!ambient.motionEnabled && 'DeviceMotionEvent' in window && (
              <button className="btn icon" title="Enable shake-to-reset" onClick={ambient.enableMotion}>⇅</button>
            )}
          </div>
        </div>
      </section>

      {/* ================= ORIGINAL PAGE CONTENT (untouched flow) =========== */}
      <section className="section" id="about">
        <h2>About <span>/</span> Presence</h2>
        <div className="grid">
          <div className="card"><span className="tag">Frontend</span><h3>Real-time 3D interfaces</h3><p>React Three Fiber, custom GLSL pipelines and interaction design that treats the cursor as an instrument.</p></div>
          <div className="card"><span className="tag">AI Agents</span><h3>Voice-native assistants</h3><p>Web Speech + Whisper/TTS bridges, local hotword engines and RAG memory over private vector stores.</p></div>
          <div className="card"><span className="tag">Cloud</span><h3>Google Workspace &amp; GitHub glue</h3><p>Apps Script Web Apps, Docs/Slides previews, repo ingestion pipelines embedding code into ChromaDB.</p></div>
        </div>
      </section>

      <section className="section" id="work">
        <h2>Selected <span>Work</span></h2>
        <div className="grid">
          {PROJECTS.map((p) => (
            <article className="card" key={p.id}>
              <span className="tag">{p.stack[0]}</span>
              <h3>{p.title}</h3>
              <p>{p.blurb}</p>
              <p style={{ marginTop: '.8rem', fontSize: '.78rem' }}>{p.stack.join(' · ')}</p>
            </article>
          ))}
        </div>
        {/* Example of a Google Slides preview iframe inside a portfolio modal/page */}
        <div className="card" style={{ marginTop: '2rem' }}>
          <span className="tag">Live Doc Preview</span>
          <h3>Deck embed slot</h3>
          <p>Ask the agent: “show slides for nebula engine”. Decks render here via the summarizeSlides action.</p>
          {/* <iframe className="doc-frame" src="https://docs.google.com/presentation/d/DECK_ID/embed" title="Project deck" /> */}
        </div>
      </section>

      <footer className="site-footer">
        © {new Date().getFullYear()} YOUR NAME · React · Three.js · Web Speech · Google Apps Script — all voice data processed locally where possible.
      </footer>

      {/* ================= INJECTED AI VOICEBOT SIDEBAR (overlay only) ====== */}
      {!sidebarOpen && (
        <button className="fab" onClick={() => setSidebarOpen(true)} aria-label="Open AI assistant">✦</button>
      )}
      <VoicebotSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onThemeChange={handleThemeChange}
        onReset={handleReset}
      />
    </>
  );
}
