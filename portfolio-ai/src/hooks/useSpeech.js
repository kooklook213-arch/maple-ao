import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useSpeech — Web Speech API wrapper (STT + TTS) with graceful degradation.
 *  - start()/stop(): microphone recognition; onresult fires partial + final text.
 *  - speak(text): agent voice output (interruptible).
 *  - levelRef: live 0..1 mic energy for the sidebar waveform visualizer.
 *  - error: surfaced to the UI so users know WHY the mic refused (permission
 *    denied, unsupported browser, no HTTPS, etc.) instead of silently failing.
 */
export default function useSpeech({ lang = 'en-US', onFinal = () => {}, onPartial = () => {} } = {}) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const supported = Boolean(SR);

  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const levelRef = useRef(0); // consumed by the visualizer without re-renders
  const listeningRef = useRef(false);
  const gotResultRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  const onPartialRef = useRef(onPartial);
  onFinalRef.current = onFinal;
  onPartialRef.current = onPartial;

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    levelRef.current = 0;
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);

  /** Live mic amplitude -> levelRef (0..1) via AnalyserNode. */
  const startMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      audioCtxRef.current = ctx;
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
    listeningRef.current = false;
    recRef.current && recRef.current.stop();
    setListening(false);
    stopMeter();
  }, [stopMeter]);

  const start = useCallback(() => {
    if (!supported) {
      setError('Voice input isn’t supported in this browser — try Chrome, Edge or Safari, or type your message below.');
      return;
    }
    if (listeningRef.current) return stop();

    // Secure-context guard: Web Speech mic requires HTTPS or localhost.
    if (window.isSecureContext === false) {
      setError('Microphone needs a secure connection (HTTPS). Open this site over https:// or use “localhost” while developing.');
      return;
    }

    setError(null);
    gotResultRef.current = false;

    const rec = new SR();
    rec.lang = lang;
    // continuous:true keeps Chrome's recognizer alive across pauses between
    // words (with continuous:false Chrome often times out before you finish).
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => { listeningRef.current = true; setListening(true); setInterim(''); startMeter(); };
    rec.onresult = (e) => {
      gotResultRef.current = true;
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const transcript = r[0].transcript.trim();
          // Stop capture as soon as we have a final utterance, then dispatch.
          listeningRef.current = false;
          rec.stop();
          setInterim('');
          if (transcript) onFinalRef.current(transcript);
          return;
        } else partial += r[0].transcript;
      }
      if (partial) setInterim(partial);
      onPartialRef.current(partial);
    };
    rec.onend = () => {
      listeningRef.current = false;
      setListening(false);
      stopMeter();
      // Nothing heard at all (permission never granted / too quiet) -> nudge.
      if (!gotResultRef.current) {
        setError('Didn’t catch that. Check the mic permission (🔒 icon → Microphone → Allow), tap the mic again and speak.');
      }
    };
    rec.onerror = (e) => {
      listeningRef.current = false;
      setListening(false);
      stopMeter();
      const msgs = {
        'not-allowed': 'Microphone blocked. Click the padlock in the address bar → allow Microphone, then try again.',
        'service-not-allowed': 'Your OS/browser blocked the speech service (often happens in incognito mode). Try a normal window.',
        'no-speech': 'No speech detected — tap the mic and speak clearly.',
        'audio-capture': 'No microphone found. Plug one in or pick an input device in system settings.',
        network: 'Speech recognition needs internet access (Chrome sends audio to Google’s servers). Check your connection.',
        aborted: '',
      };
      const msg = msgs[e.error] ?? `Voice input error: ${e.error}`;
      if (msg) setError(msg);
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      // InvalidStateError when called twice rapidly — safe to ignore.
    }
  }, [supported, stop, lang, startMeter, stopMeter, SR]);

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

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => () => {
    listeningRef.current = false;
    recRef.current && recRef.current.abort();
    stopMeter();
    cancelSpeech();
  }, [stopMeter, cancelSpeech]); // eslint-disable-line

  return { supported, listening, speaking, interim, error, start, stop, speak, cancelSpeech, clearError, levelRef };
}
