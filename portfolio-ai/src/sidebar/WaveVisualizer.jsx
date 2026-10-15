import { useEffect, useRef } from 'react';

/**
 * WaveVisualizer — real-time audio bars driven by useSpeech().levelRef.
 * Reads the mic energy ref inside rAF and mutates DOM heights directly,
 * so it stays 60fps without re-rendering React on every animation frame.
 */
export default function WaveVisualizer({ levelRef, active }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    let raf;
    const bars = wrapRef.current ? Array.from(wrapRef.current.querySelectorAll('.bar')) : [];
    const phases = bars.map((_, i) => i * 0.7);
    const tick = (t) => {
      const lvl = active && levelRef.current ? levelRef.current.current || 0 : 0;
      bars.forEach((bar, i) => {
        const wave = Math.abs(Math.sin(t / 240 + phases[i])) * 0.5 + 0.5;
        const h = active ? 4 + lvl * 34 * wave + Math.random() * lvl * 8 : 6;
        bar.style.height = `${Math.min(38, h)}px`;
        bar.style.opacity = active ? String(0.55 + lvl * 0.45) : '0.5';
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, levelRef]);

  return (
    <div className={`ai-viz ${active ? '' : 'idle'}`} ref={wrapRef} aria-hidden="true">
      {Array.from({ length: 28 }).map((_, i) => <span key={i} className="bar" />)}
    </div>
  );
}
