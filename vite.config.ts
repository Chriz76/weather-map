import fs from 'node:fs';
import { resolve } from 'node:path';
import { createHtmlPlugin } from 'vite-plugin-html';
import { defineConfig, type Plugin } from 'vite';

/**
 * Extra HTML pages that live at the project root and are only built by Vite in
 * production. `vite-plugin-html` runs in SPA mode and rewrites every `text/html`
 * request to `index.html`, which makes those pages unreachable in `vite dev`.
 * Serving them here — before that rewrite middleware — keeps dev and production
 * identical without touching the build pipeline.
 */
const devContentPages = new Map<string, string>([
  ['/info', 'info.html'],
  ['/info.html', 'info.html'],
  ['/icon-d2-ruc', 'icon-d2-ruc.html'],
  ['/icon-d2-ruc.html', 'icon-d2-ruc.html'],
  ['/arome-pi', 'arome-pi.html'],
  ['/arome-pi.html', 'arome-pi.html'],
  ['/hrrr-conus', 'hrrr-conus.html'],
  ['/hrrr-conus.html', 'hrrr-conus.html'],
  ['/rrfs', 'rrfs.html'],
  ['/rrfs.html', 'rrfs.html'],
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
          // Static, JavaScript-free documentation page (English). Content is part of
          // the file itself, so no template data is injected here.
          filename: 'info.html',
          template: './info.html'
        },
        {
          // Static, JavaScript-free content page (German) for the ICON-D2 RUC model.
          filename: 'icon-d2-ruc.html',
          template: './icon-d2-ruc.html'
        },
        {
          // Static, JavaScript-free content page (French) for the AROME PI model.
          filename: 'arome-pi.html',
          template: './arome-pi.html'
        },
        {
          // Static, JavaScript-free content page (English) for the HRRR model.
          filename: 'hrrr-conus.html',
          template: './hrrr-conus.html'
        },
        {
          // Static, JavaScript-free content page (English) for the RRFS model.
          // Draft: built and reachable, but not linked from anywhere yet.
          filename: 'rrfs.html',
          template: './rrfs.html'
        }
      ],
      minify: true
    })
  ],
  server: {
    port: 3000
  }
});
