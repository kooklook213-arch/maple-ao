import { useEffect, useRef, useState } from 'react';

/**
 * useAmbientAwareness — contextual sensor feeds for the agent:
 *   • AmbientLightSensor (if available) -> "dayMode" hint (bright room → light theme bias)
 *   • DeviceMotion (iOS permission flow handled) -> shake gesture = "reset" hotword
 * Everything degrades silently when APIs are missing/denied.
 */
export default function useAmbientAwareness({ onShake = () => {} } = {}) {
  const [lux, setLux] = useState(null);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const lastShake = useRef(0);
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  // --- Ambient light ---
  useEffect(() => {
    let sensor;
    try {
      if ('AmbientLightSensor' in window) {
        sensor = new window.AmbientLightSensor({ frequency: 1 });
        sensor.onreading = () => setLux(Math.round(sensor.illuminance));
        sensor.onerror = () => setLux(null);
        sensor.start();
      }
    } catch { /* permission or support issue */ }
    return () => { try { sensor && sensor.stop(); } catch {} };
  }, []);

  // --- Motion (shake to reset) ---
  useEffect(() => {
    const handler = (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
      const now = Date.now();
      if (mag > 24 && now - lastShake.current > 1200) { lastShake.current = now; onShakeRef.current(); }
    };
    if (motionEnabled) {
      window.addEventListener('devicemotion', handler);
      return () => window.removeEventListener('devicemotion', handler);
    }
  }, [motionEnabled]);

  const enableMotion = async () => {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const res = await DeviceMotionEvent.requestPermission();
        setMotionEnabled(res === 'granted');
      } catch { setMotionEnabled(false); }
    } else setMotionEnabled(true);
  };

  return { lux, motionEnabled, enableMotion, dayMode: lux != null && lux > 250 };
}
