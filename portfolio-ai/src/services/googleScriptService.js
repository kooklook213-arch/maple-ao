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
 * Apps Script /exec 302-redirects to googleusercontent.com without CORS
 * headers, so we POST as a no-cors simple request (payload always lands) and
 * recover createDoc results by polling the Web App's GET listRecent action.
 */
export async function callGoogleScript(payload) {
  const body = JSON.stringify(payload);

  try {
    // Apps Script /exec 302-redirects to googleusercontent.com, which does NOT
    // re-send CORS headers -> a 'cors' fetch usually throws even when the Web
    // App itself is fine. So we POST as 'text/plain' (simple request, no
    // preflight) with mode:'no-cors': the payload ALWAYS reaches your script;
    // the response is just opaque. Then we recover the result out-of-band:
    await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
  } catch (err) {
    console.warn('[googleScript] POST failed:', err);
    return { ok: false, error: String(err) };
  }

    // Best-effort result recovery: poll Drive for the newest matching Doc.
    // Works only if you've also deployed the small `listRecent` GET action in
    // Code.gs (see appsScript/Code.gs.js). Falls back to the opaque notice.
    if (payload?.action === 'createDoc' && payload.title) {
      const found = await findDocByTitle(payload.title);
      if (found) return found;
    }

    return { ok: true, opaque: true, note: 'Request sent (opaque response — check your inbox/Drive).' };
}

/** Poll Drive (via the Apps Script GET endpoint) for a doc created just now. */
async function findDocByTitle(title) {
  const params = new URLSearchParams({ action: 'listRecent', title });
  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise((r) => setTimeout(r, 2500)); // Docs take a beat to index
    try {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
      const data = await res.json();
      const hit = Array.isArray(data?.docs) && data.docs.length ? data.docs[0] : null;
      if (hit?.docUrl) return { ok: true, docUrl: hit.docUrl, editUrl: hit.editUrl };
    } catch { /* cross-origin GET may be blocked — that's fine, keep trying/fallback */ }
  }
  return null;
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
