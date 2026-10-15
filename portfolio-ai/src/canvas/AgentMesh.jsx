import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

/* --------------------------------------------------------------------------
 * GLSL: vertex-displaced icosphere ("energy core")
 *  - uMouse warps the surface toward/away from the cursor ray
 *  - uEnergy (0..1) is derived from live cursor SPEED: cool blue at rest,
 *    energetic neon purple/red at hyper-speed (mixed in the fragment shader)
 * ------------------------------------------------------------------------ */
const CORE_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec2 uMouse;      // NDC mouse position (-1..1)
  uniform float uEnergy;    // 0..1 cursor speed
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying float vDisp;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i), n100 = hash(i + vec3(1,0,0));
    float n010 = hash(i + vec3(0,1,0)), n110 = hash(i + vec3(1,1,0));
    float n001 = hash(i + vec3(0,0,1)), n101 = hash(i + vec3(1,0,1));
    float n011 = hash(i + vec3(0,1,1)), n111 = hash(i + vec3(1,1,1));
    return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
               mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 dir = normalize(position);
    float t = uTime * (0.22 + uEnergy * 1.6);

    // turbulent displacement, amplified by cursor energy
    float n = fbm(dir * (2.4 + uEnergy * 2.6) + vec3(t, t * 0.7, -t * 0.4));
    float disp = (n - 0.5) * (0.22 + uEnergy * 0.85);

    // directional mouse warp: vertices facing the cursor pointer get pushed
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec4 clip = projectionMatrix * mv;
    vec2 ndc = clip.xy / max(0.0001, abs(clip.w));
    float md = length(ndc - uMouse);
    disp += exp(-md * 2.6) * (0.16 + uEnergy * 0.5);

    vec3 displaced = position + normal * disp;
    vDisp = disp;

    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vPosW = worldPos.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const CORE_FRAG = /* glsl */ `
  uniform vec3 uBaseColor;   // theme base (cool)
  uniform vec3 uAccentColor; // theme accent
  uniform vec3 uHotColor;    // hyper-speed color (neon / red)
  uniform float uEnergy;
  uniform float uTime;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying float vDisp;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float fres = pow(1.0 - max(dot(normalize(vNormalW), viewDir), 0.0), 2.3);

    vec3 col = mix(uBaseColor, uAccentColor, fres * 0.9);
    col = mix(col, uHotColor, smoothstep(0.08, 0.95, uEnergy));          // speed heat
    col += uHotColor * smoothstep(0.10, 0.42, vDisp) * (0.35 + uEnergy); // ridge glow
    col += fres * uAccentColor * (0.4 + uEnergy * 1.4);                  // rim light
    float pulse = 0.92 + 0.08 * sin(uTime * 2.0 + vDisp * 30.0);

    gl_FragColor = vec4(col * pulse, 0.94);
  }
`;

/* --------------------------------------------------------------------------
 * GLSL: orbiting particle ring — the "interactive 3D circle".
 * Points swirl around the core, are pulled toward the cursor, and shift hue
 * from cool to hot as cursor speed rises.
 * ------------------------------------------------------------------------ */
const PART_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uEnergy;
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute float aRadius;
  varying float vGlow;

  void main() {
    float ang = aSeed * 6.28318 + uTime * (0.10 + aSeed * 0.12 + uEnergy * 0.9);
    float r = aRadius * (1.0 + 0.16 * sin(uTime * (0.5 + aSeed) + aSeed * 9.0) + uEnergy * 0.28);
    vec3 p = vec3(cos(ang) * r, sin(ang * 0.8 + aSeed * 4.0) * r * 0.22, sin(ang) * r);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 clip = projectionMatrix * mv;
    vec2 ndc = clip.xy / max(0.0001, abs(clip.w));
    vec2 pull = uMouse - ndc;
    float d = length(pull);
    mv.xy += pull * exp(-d * 2.2) * (0.35 + uEnergy * 1.1); // cursor attraction

    vGlow = exp(-d * 1.6) * 0.6 + uEnergy;
    gl_PointSize = (1.6 + aSeed * 3.4 + vGlow * 4.0) * uPixelRatio * (140.0 / -mv.z);
    gl_Position = projectionMatrix * mv; // re-project after view-space pull
  }
`;

const PART_FRAG = /* glsl */ `
  uniform vec3 uAccentColor;
  uniform vec3 uHotColor;
  uniform float uEnergy;
  varying float vGlow;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float m = smoothstep(0.5, 0.05, length(uv));
    vec3 col = mix(uAccentColor, uHotColor, clamp(vGlow * 0.55 + uEnergy, 0.0, 1.0));
    gl_FragColor = vec4(col, m * (0.5 + min(vGlow, 0.5)));
  }
`;

export default function AgentMesh({ theme, resetSignal }) {
  const coreRef = useRef();
  const partRef = useRef();
  const groupRef = useRef();
  const { viewport } = useThree();

  // mutable interaction state (never triggers React re-renders)
  const state = useRef({
    mouse: new THREE.Vector2(0, 0), target: new THREE.Vector2(0, 0),
    last: new THREE.Vector2(0, 0), energy: 0, rotY: 0, rotX: 0,
    scale: 1, scaleTarget: 1, clockResetAt: -1e9, hudT: 0,
  });

  // live telemetry for the HUD (throttled re-renders ~3/s)
  const [hud, setHud] = useState({ energy: 0, fps: 60 });
  const hudCbRef = useRef(null);
  hudCbRef.current = setHud;

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2() },
    uEnergy: { value: 0 },
    uBaseColor: { value: new THREE.Color('#1d4ed8') },
    uAccentColor: { value: new THREE.Color('#38bdf8') },
    uHotColor: { value: new THREE.Color('#b026ff') },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
  }), []);

  // ---- theme transitions (smooth color lerp toward active palette) ----
  const targets = useMemo(() => ({
    base: new THREE.Color(theme.base),
    accent: new THREE.Color(theme.accent),
    hot: new THREE.Color(theme.hot),
  }), [theme]);

  // ---- pointer tracking with real-time speed -> energy calculation ----
  // NOTE: must use VIEWPORT coordinates (window.innerWidth/Height), not the
  // canvas size prop — the hero canvas is only part of the page, so dividing
  // clientY by the canvas height pushed uMouse far outside NDC range, which
  // made the cursor-warp term (exp(-md*2.6)) collapse to ~0 everywhere and
  // the mesh looked dead/black.
  useEffect(() => {
    const onMove = (cx, cy) => {
      const s = state.current;
      s.target.set(
        (cx / Math.max(1, window.innerWidth)) * 2 - 1,
        -(cy / Math.max(1, window.innerHeight)) * 2 + 1,
      );
    };
    const mm = (e) => onMove(e.clientX, e.clientY);
    const tm = (e) => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); };
    window.addEventListener('pointermove', mm);
    window.addEventListener('touchmove', tm, { passive: true });
    return () => { window.removeEventListener('pointermove', mm); window.removeEventListener('touchmove', tm); };
  }, []);

  // ---- "Reset" hotword: ease everything back to baseline ----
  useEffect(() => {
    if (resetSignal == null) return;
    const s = state.current;
    s.scaleTarget = 1;
    s.energy = 0;
    s.clockResetAt = performance.now();
  }, [resetSignal]);

  const geometry = useMemo(() => {
    // NOTE: IcosahedronGeometry detail is subdivision level — detail 32 would
    // explode to ~47M triangles and hard-crash the WebGL context (black page).
    // detail 6 (~20k verts) keeps displacement smooth even on mobile GPUs.
    const geo = new THREE.IcosahedronGeometry(1.05, 6);
    geo.computeVertexNormals();
    return geo;
  }, []);

  const particles = useMemo(() => {
    const mobile = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 640;
    const COUNT = mobile ? 2200 : 5200; // adaptive density for mobile perf
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    const rad = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      seed[i] = Math.random();
      rad[i] = 1.6 + Math.pow(Math.random(), 1.6) * 2.4;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aRadius', new THREE.BufferAttribute(rad, 1));
    return g;
  }, []);

  useFrame(({ clock }, delta) => {
    const s = state.current;
    const t = clock.getElapsedTime();

    // cursor velocity (px/frame in NDC units) -> smoothed energy 0..1
    const dx = s.target.x - s.last.x, dy = s.target.y - s.last.y;
    // clamp delta: after a tab-switch back, `delta` can be huge (seconds),
    // which would divide the movement by a giant dt and spike SPEED% to 100
    // for no reason (mesh flares red then looks broken).
    const dt = Math.min(Math.max(delta, 0.001), 0.1);
    const speed = Math.min(1, Math.hypot(dx, dy) / dt * 0.28);
    s.energy += (speed - s.energy) * Math.min(1, dt * 4.5);
    s.last.copy(s.target);

    // eased mouse follow (mesh shifts & rotates toward cursor)
    s.mouse.lerp(s.target, Math.min(1, delta * 3.2));

    const sinceReset = performance.now() - s.clockResetAt;
    const resetting = sinceReset < 1400 ? 1 - sinceReset / 1400 : 0;

    uniforms.uTime.value = t;
    uniforms.uMouse.value.copy(s.mouse);
    uniforms.uEnergy.value = s.energy * (1 - resetting);
    uniforms.uPixelRatio.value = viewport.dpr;
    uniforms.uBaseColor.value.lerp(targets.base, Math.min(1, delta * 2.5));
    uniforms.uAccentColor.value.lerp(targets.accent, Math.min(1, delta * 2.5));
    uniforms.uHotColor.value.lerp(targets.hot, Math.min(1, delta * 2.5));

    // rotation: idle spin + speed boost + cursor tilt
    s.rotY += delta * (0.12 + s.energy * 1.8);

    // throttled telemetry for the HUD (~3 updates/sec)
    s.hudT += delta;
    if (s.hudT > 0.33 && hudCbRef.current) {
      s.hudT = 0;
      hudCbRef.current({ energy: s.energy, fps: Math.round(1 / Math.max(delta, 0.001)) });
    }
    if (coreRef.current) {
      coreRef.current.rotation.y = s.rotY;
      coreRef.current.rotation.x = s.mouse.y * 0.5 + Math.sin(t * 0.2) * 0.08;
      coreRef.current.rotation.z = -s.mouse.x * 0.35;
    }
    if (partRef.current) {
      partRef.current.rotation.y = -s.rotY * 0.35;
      partRef.current.rotation.x = s.mouse.y * 0.3;
    }
    if (groupRef.current) {
      groupRef.current.position.x = s.mouse.x * 0.85;
      groupRef.current.position.y = s.mouse.y * 0.55;
      s.scale = THREE.MathUtils.lerp(s.scale, s.scaleTarget + s.energy * 0.16, Math.min(1, delta * 4));
      groupRef.current.scale.setScalar(s.scale * (1 - resetting * 0.12));
    }
  });

  return (
    <>
      <group ref={groupRef}>
        <mesh ref={coreRef} geometry={geometry} frustumCulled={false}>
          <shaderMaterial vertexShader={CORE_VERT} fragmentShader={CORE_FRAG} uniforms={uniforms} transparent />
        </mesh>
        <points ref={partRef} geometry={particles} frustumCulled={false}>
          <shaderMaterial
            key="parts"
            vertexShader={PART_VERT}
            fragmentShader={PART_FRAG}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      </group>
      {/* live cursor-speed telemetry overlay */}
      <Hud target={hud} />
    </>
  );
}

/* HUD is rendered INSIDE the hero canvas wrapper (never portaled to
   document.body — that injected a fixed dark layer over the whole page). */
function Hud({ target }) {
  const pct = Math.round((target.energy || 0) * 100);
  const hue = Math.round(210 - (target.energy || 0) * 180); // blue -> red shift
  return (
    <div className="hud" aria-live="polite">
      <span>SPEED <b style={{ color: `hsl(${hue} 90% 65%)` }}>{pct}%</b></span>
      <span>FPS <b>{target.fps}</b></span>
      <span>STATE <b>{pct > 65 ? 'HYPER' : pct > 25 ? 'FLOW' : 'CALM'}</b></span>
    </div>
  );
}
