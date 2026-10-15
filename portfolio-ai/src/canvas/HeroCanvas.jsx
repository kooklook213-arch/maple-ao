import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import AgentMesh from './AgentMesh';

/** CSS/SVG fallback shown if WebGL is unavailable or the context crashes. */
function CanvasFallback() {
  return (
    <div className="hero-canvas" style={{ display: 'grid', placeItems: 'center' }} aria-hidden="true">
      <svg width="260" height="260" viewBox="0 0 100 100" style={{ opacity: 0.7 }}>
        <circle cx="50" cy="50" r="30" fill="none" stroke="var(--accent)" strokeWidth="0.6">
          <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="14s" repeatCount="indefinite" />
        </circle>
        <circle cx="50" cy="50" r="18" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="0.5" />
        <circle cx="80" cy="50" r="1.6" fill="var(--accent)">
          <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="6s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
}

/**
 * HeroCanvas — the landing 3D canvas.
 * Mobile responsiveness:
 *   • dpr clamped to [1,2] so retina phones don't render 3x pixels
 *   • R3F auto-resizes on viewport change (ResizeObserver) — no aspect breakage
 *   • `touch-action:none` lets touch drags warp the mesh without page scroll fights
 *   • adaptive particle density lives inside AgentMesh
 * Resilience:
 *   • If WebGL init fails or the GPU kills the context ("webglcontextlost"),
 *     we swap in an animated SVG fallback instead of leaving a black void.
 */
export default function HeroCanvas({ theme, resetSignal }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <CanvasFallback />;

  return (
    <div
      className="hero-canvas"
      aria-hidden="true"
      onWebGLContextLost={(e) => { e.preventDefault(); setFailed(true); }}
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            setFailed(true);
          });
        }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.4} />
          <AgentMesh theme={theme} resetSignal={resetSignal} />
        </Suspense>
      </Canvas>
    </div>
  );
}
