import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { siteMeta } from './scripts/site-meta.mjs';
import { githubPages } from './scripts/vite-plugin-gh-pages.mjs';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load every env var regardless of prefix so BOTH VITE_* and REACT_APP_*
  // are available via import.meta.env (the sidebar reads REACT_APP_GOOGLE_SCRIPT_URL).
  const env = loadEnv(mode, process.cwd(), '');
  // GitHub Pages: base auto-derives to /<repo-name>/ in CI (GITHUB_REPOSITORY),
  // or set VITE_BASE="/my-repo/" locally to test the project-page URL structure.
  const { base } = siteMeta();
  return {
    plugins: [react(), githubPages()],
    base,
    define: {
      'process.env.REACT_APP_GOOGLE_SCRIPT_URL': JSON.stringify(env.REACT_APP_GOOGLE_SCRIPT_URL || ''),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    envPrefix: ['VITE_', 'REACT_APP_'],
    server: { port: 5173 },
    build: { chunkSizeWarningLimit: 1200 },
  };
});
