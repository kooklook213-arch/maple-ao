import fs from 'node:fs';
import path from 'node:path';

/**
 * GitHub Pages name/branding injection.
 * Reads (in priority order): SITE_TITLE, GITHUB_REPOSITORY ("user/repo"), VITE_BASE, .env values.
 * - Derives a safe /repo-name/ base path so assets load on https://<user>.github.io/<repo>/
 * - Provides the title used to fill the %SITE_TITLE% token in index.html
 */
export function siteMeta(root = process.cwd()) {
  const env = process.env;

  // Base path for GitHub project pages: "/<repo>/"
  const repoName = env.GITHUB_REPOSITORY ? env.GITHUB_REPOSITORY.split('/')[1] : null;
  const base = env.VITE_BASE || (repoName ? `/${repoName}/` : '/');

  // Human-readable title: explicit SITE_TITLE > "Brand — Repo Name" > default
  const brand = env.VITE_BRAND || 'Aether';
  const readable = repoName
    ? repoName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Interactive 3D AI Portfolio';
  const title = env.SITE_TITLE || `${brand} — ${readable}`;

  return { base: base.startsWith('/') ? base : `/${base}`, title };
}

export function writeDistHelpers(distDir) {
  // 404.html copy of index.html -> deep links on GH Pages fall back to the SPA shell
  const index = path.join(distDir, 'index.html');
  if (fs.existsSync(index)) {
    fs.copyFileSync(index, path.join(distDir, '404.html'));
  }
  // CNAME support: if you keep a custom-domain file at repo root, carry it into dist
  const cname = path.resolve(distDir, '..', 'CNAME');
  if (fs.existsSync(cname)) {
    fs.copyFileSync(cname, path.join(distDir, 'CNAME'));
  }
  return { ok: true };
}
