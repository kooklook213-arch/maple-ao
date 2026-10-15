import fs from 'node:fs';
import path from 'node:path';
import { siteMeta, writeDistHelpers } from './site-meta.mjs';

/**
 * Vite plugin: GitHub Pages naming + branding.
 * - closeBundle: copies dist/index.html -> dist/404.html (SPA deep-link fallback)
 *   and carries a root CNAME into dist for custom domains.
 */
export function githubPages() {
  let resolvedConfig = null;
  return {
    name: 'github-pages-naming',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config;
    },
    transformIndexHtml(html) {
      const { title } = siteMeta();
      return html.replace(/%SITE_TITLE%/g, title);
    },
    closeBundle() {
      if (!resolvedConfig) return;
      writeDistHelpers(path.resolve(resolvedConfig.root, resolvedConfig.build.outDir));
    },
  };
}
