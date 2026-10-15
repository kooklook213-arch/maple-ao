import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import AgentMesh from './AgentMesh';

/**
 * HeroCanvas — the landing 3D canvas.
 * Mobile responsiveness:
 *   • dpr clamped to [1,2] so retina phones don't render 3x pixels
 *   • R3F auto-resizes on viewport change (ResizeObserver) — no aspect breakage
 *   • `touch-action:none` lets touch drags warp the mesh without page scroll fights
 *   • adaptive particle density lives inside AgentMesh
 */
export default function HeroCanvas({ theme, resetSignal }) {
  return (
    <div className="hero-canvas" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.4} />
          <AgentMesh theme={theme} resetSignal={resetSignal} />
        </Suspense>
      </Canvas>
    </div>
  );
}
