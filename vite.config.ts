import fs from 'node:fs';
import { resolve } from 'node:path';
import { marked } from 'marked';
import { createHtmlPlugin } from 'vite-plugin-html';
import { defineConfig, type Plugin } from 'vite';

// README einlesen & "public/" für das spätere Web-Root durch "/" ersetzen
const rawReadme = fs.readFileSync('README.md', 'utf-8');
const readmeContent = rawReadme.replaceAll('public/', '/');
const infoContent = marked.parse(readmeContent);

/**
 * Extra HTML pages that live at the project root and are only built by Vite in
 * production. `vite-plugin-html` runs in SPA mode and rewrites every `text/html`
 * request to `index.html`, which makes those pages unreachable in `vite dev`.
 * Serving them here — before that rewrite middleware — keeps dev and production
 * identical without touching the build pipeline.
 */
const devContentPages = new Map<string, string>([
  ['/icon-d2-ruc', 'icon-d2-ruc.html'],
  ['/icon-d2-ruc.html', 'icon-d2-ruc.html'],
]);

const serveDevContentPages = (): Plugin => ({
  name: 'dev-serve-content-pages',
  enforce: 'pre',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const pathname = (req.url ?? '').split('?')[0];
      const template = devContentPages.get(pathname);

      if (!template || !req.headers.accept?.includes('text/html')) {
        next();
        return;
      }

      const file = resolve(__dirname, template);
      if (!fs.existsSync(file)) {
        next();
        return;
      }

      server
        .transformIndexHtml(pathname, fs.readFileSync(file, 'utf-8'))
        .then((html) => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        })
        .catch(next);
    });
  },
});

export default defineConfig({
  plugins: [
    serveDevContentPages(),
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
              pageTitle: 'Documentation & Info | RapidWind – ICON-D2, AROME & HRRR Weather Map',
              description: 'Documentation, technical background and project information for RapidWind, the hourly wind and weather map built on ICON-D2 RUC, AROME PI and HRRR.',
              infoContent
            }
          }
        },
        {
          // Static, JavaScript-free content page (German) for the ICON-D2 RUC model.
          filename: 'icon-d2-ruc.html',
          template: './icon-d2-ruc.html'
        }
      ],
      minify: true
    })
  ],
  server: {
    port: 3000
  }
});
