import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { createHtmlPlugin } from 'vite-plugin-html';
import { defineConfig } from 'vite';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const readmePath = path.join(repoRoot, 'README.md');

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const renderImage = (href: string, title: string | null, text: string): string => {
  if (!href || /^https?:\/\//i.test(href) || href.startsWith('data:')) {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<img src="${href}" alt="${escapeHtml(text)}"${titleAttr}>`;
  }

  const cleanHref = href.split('#')[0].split('?')[0];
  const assetPath = path.resolve(repoRoot, cleanHref.replace(/^\//, ''));

  if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${titleAttr}>`;
  }
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  const assetName = path.basename(assetPath);

  return `<img src="/${assetName}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy">`;
};

const renderReadme = (): string => {
  const renderer = new marked.Renderer();
  renderer.image = ({ href, title, text }) => renderImage(href, title, text);

  return marked.parse(fs.readFileSync(readmePath, 'utf8'), {
    renderer
  });
};

const infoContent = renderReadme();

export default defineConfig({
  plugins: [
    createHtmlPlugin({
      pages: [
        {
          filename: 'index.html',
          template: './index.html'
        },
        {
          filename: 'info.html',
          template: './info.html',
          injectOptions: {
            data: {
              description: 'Documentation, technical background, and project information for the ICON-D2 RUC and AROME PI wind map.',
              infoContent,
              pageTitle: 'Documentation & Info | ICON-D2 RUC & Arome PI Weather Map'
            }
          }
        }
      ],
      minify: true
    })
  ],
  server: {
    port: 3000
  }
});
