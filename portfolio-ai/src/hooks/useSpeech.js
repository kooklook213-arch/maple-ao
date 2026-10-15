import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useSpeech — Web Speech API wrapper (STT + TTS) with graceful degradation.
 *  - start()/stop(): microphone recognition; onresult fires partial + final text.
 *  - speak(text): agent voice output (interruptible).
 *  - levelRef: live 0..1 mic energy for the sidebar waveform visualizer.
 */
export default function useSpeech({ lang = 'en-US', onFinal = () => {}, onPartial = () => {} } = {}) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const supported = Boolean(SR);

  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const recRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(0);
  const levelRef = useRef(0); // consumed by the visualizer without re-renders
  const onFinalRef = useRef(onFinal);
  const onPartialRef = useRef(onPartial);
  onFinalRef.current = onFinal;
  onPartialRef.current = onPartial;

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    levelRef.current = 0;
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
  }, []);

  /** Live mic amplitude -> levelRef (0..1) via AnalyserNode. */
  const startMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        levelRef.current = Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      /* mic meter is optional; recognition still works */
    }
  }, []);

  const stop = useCallback(() => {
    recRef.current && recRef.current.stop();
    setListening(false);
    stopMeter();
  }, [stopMeter]);

  const start = useCallback(() => {
    if (!supported) { console.warn('SpeechRecognition unsupported in this browser.'); return; }
    if (listening) return stop();
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => { setListening(true); setInterim(''); startMeter(); };
    rec.onresult = (e) => {
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { setInterim(''); onFinalRef.current(r[0].transcript.trim()); }
        else partial += r[0].transcript;
      }
      if (partial) setInterim(partial);
      onPartialRef.current(partial);
    };
    rec.onend = () => { setListening(false); stopMeter(); };
    rec.onerror = (e) => { console.warn('Speech error:', e.error); setListening(false); stopMeter(); };
    recRef.current = rec;
    rec.start();
  }, [supported, listening, stop, lang, startMeter, stopMeter]);

  const speak = useCallback((text, { interrupt = true } = {}) => {
    if (!('speechSynthesis' in window) || !text) return;
    if (interrupt) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).slice(0, 700));
    u.rate = 1.03; u.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find((v) => /en[-_]US/i.test(v.lang) && /google|samantha|aria|zira/i.test(v.name)) || voices[0] || null;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, []);

  const cancelSpeech = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => () => { stop(); cancelSpeech(); }, [stop, cancelSpeech]); // eslint-disable-line

  return { supported, listening, speaking, interim, start, stop, speak, cancelSpeech, levelRef };
}
