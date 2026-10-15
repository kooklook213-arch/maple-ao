/**
 * Theme palettes shared by the 3D shader, CSS variables and voice commands.
 * "Change theme <name>" hotwords map onto these keys.
 */
export const THEMES = {
  ocean:  { name: 'ocean',  base: '#1d4ed8', accent: '#38bdf8', hot: '#22d3ee', label: 'Ocean Blue' },
  neon:   { name: 'neon',   base: '#7c3aed', accent: '#b026ff', hot: '#ff2ec4', label: 'Neon Purple' },
  ember:  { name: 'ember',  base: '#dc2626', accent: '#ff5470', hot: '#ffb199', label: 'Ember Red' },
  aurora: { name: 'aurora', base: '#059669', accent: '#2ee6a8', hot: '#a7f3d0', label: 'Aurora Green' },
  light:  { name: 'light',  base: '#2456e6', accent: '#60a5fa', hot: '#f472b6', label: 'Daylight' },
};

export const DEFAULT_THEME = 'ocean';

/** Resolve loose voice input like "NEON purple" / "the ember one" to a theme key. */
export function resolveTheme(spoken) {
  const s = String(spoken || '').toLowerCase();
  if (/reset|default|ocean|blue/.test(s)) return s.includes('reset') && !s.includes('blue') ? DEFAULT_THEME : 'ocean';
  if (/neon|purple|violet|magenta/.test(s)) return 'neon';
  if (/ember|red|fire|orange/.test(s)) return 'ember';
  if (/aurora|green|emerald|matrix/.test(s)) return 'aurora';
  if (/light|day|white|sun/.test(s)) return 'light';
  if (THEMES[s]) return s;
  return null;
}
