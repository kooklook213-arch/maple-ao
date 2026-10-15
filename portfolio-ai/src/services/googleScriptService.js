/**
 * googleScriptService.js
 * ---------------------------------------------------------------------------
 * Environment Fallback Logic (Crucial): a single, easily-editable variable at
 * the very top of the file so the sidebar keeps working even if the env loader
 * fails. Vite exposes import.meta.env; we also read process.env defensively
 * for CRA-style setups. The hard-coded URL is the final fallback.
 * ---------------------------------------------------------------------------
 */

// >>> EDIT THIS IF YOUR ENV LOADER FAILS <<<
const GOOGLE_SCRIPT_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_GOOGLE_SCRIPT_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.REACT_APP_GOOGLE_SCRIPT_URL) ||
  "https://script.google.com/macros/s/AKfycbxWo1gqppk-CgXoRtBwO1Gs6GkhNKOVbyXC5Z2WWimq_dVbVjA3Fx7nrR8SZOMcgttayA/exec";

/**
 * Low-level POST to the Apps Script Web App.
 * Apps Script redirects /exec -> googleusercontent.com; following redirects
 * with mode 'cors' can throw on some browsers, so we try cors first and fall
 * back to 'no-cors' best-effort ping.
 */
export async function callGoogleScript(payload) {
  const body = JSON.stringify(payload);

  // Preferred: text/plain avoids a CORS preflight against Apps Script.
  try {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { ok: true, raw: text }; }
  } catch (err) {
    console.warn('[googleScript] cors attempt failed, retrying no-cors:', err);
    try {
      await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body });
      return { ok: true, opaque: true, note: 'Request sent (opaque response — check your inbox/Drive).' };
    } catch (err2) {
      return { ok: false, error: String(err2) };
    }
  }
}

/** Create a Google Doc preview. Resolves with { docUrl, editUrl } on success. */
export async function createDocPreview(title, content) {
  return callGoogleScript({ action: 'createDoc', title, content });
}

/** Email project info via the owner's Gmail (Apps Script MailApp). */
export async function emailProject({ to, subject, body }) {
  return callGoogleScript({ action: 'emailProject', to, subject, body });
}

/** Summarize + embed a Google Slides deck. */
export async function summarizeSlides(deckId) {
  return callGoogleScript({ action: 'summarizeSlides', deckId });
}

/** Health check. */
export const pingGoogleScript = () => callGoogleScript({ action: 'ping' });

export { GOOGLE_SCRIPT_URL };
