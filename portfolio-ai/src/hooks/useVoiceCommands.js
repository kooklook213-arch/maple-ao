import { useCallback, useRef } from 'react';
import { resolveTheme } from '../data/themes';

/**
 * useVoiceCommands — local hotword parser that runs BEFORE the LLM.
 * Returns null when the utterance is ordinary conversation (let the agent handle it).
 *
 * Supported commands:
 *   "change theme neon|ember|aurora|ocean|light"  -> { type:'theme', theme }
 *   "reset" / "reset scene" / "back to default"   -> { type:'reset' }
 *   "create/make a doc about <project>"           -> { type:'createDoc', project }
 *   "email <project> to someone@x.com"            -> { type:'email', project, to }
 *   "show/preview slides for <project>"           -> { type:'slides', project }
 */
export default function useVoiceCommands({ onTheme, onReset }) {
  const cbRef = useRef({ onTheme, onReset });
  cbRef.current = { onTheme, onReset };

  return useCallback((raw) => {
    const text = String(raw || '').toLowerCase().trim();
    if (!text) return null;

    // ---- theme hotwords ----
    let m = text.match(/(?:change|set|switch)(?:\s+(?:the\s+))?theme(?:\s+(?:to|in))?\s+([\w\s-]+)/);
    if (m) {
      const theme = resolveTheme(m[1]);
      if (theme) { cbRef.current.onTheme?.(theme); return { type: 'theme', theme }; }
    }
    if (/^(theme|palette)\s+([\w\s-]+)$/.test(text)) {
      const theme = resolveTheme(RegExp.$2);
      if (theme) { cbRef.current.onTheme?.(theme); return { type: 'theme', theme }; }
    }

    // ---- reset hotwords ----
    if (/\b(reset|restore|calm down|back to (default|baseline|normal))\b/.test(text) && !/doc|email/.test(text)) {
      cbRef.current.onReset?.();
      return { type: 'reset' };
    }

    // ---- google workspace intents ----
    m = text.match(/(?:create|make|generate|draft)(?:\s+(?:me\s+)?(?:a|an))?[\s-]*(?:google[\s-]*)?doc(?:ument)?(?:\s+(?:about|for|on))?\s*(.*)/);
    if (m) return { type: 'createDoc', project: m[1].trim() || 'portfolio overview' };

    m = text.match(/(?:email|send)(?:\s+(?:it|this))?[\s\S]*?\bto\s+([\w.+-]+@[\w-]+\.\w+)/);
    if (m) {
      const subjectPart = text.replace(m[0], '').replace(/^(email|send)\b/, '').trim();
      return { type: 'email', to: m[1], project: subjectPart || 'portfolio overview' };
    }

    m = text.match(/(?:slides?|deck|presentation)(?:\s+(?:for|about|of))?\s*(.*)/);
    if (m && /show|preview|open|display|slides|deck/.test(text)) {
      return { type: 'slides', project: m[1].trim() || '' };
    }

    return null; // not a hotword — route to the LLM
  }, []);
}
