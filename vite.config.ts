import fs from 'node:fs';
import { marked } from 'marked';
import { createHtmlPlugin } from 'vite-plugin-html';
import { defineConfig } from 'vite';

// README einlesen & "public/" für das spätere Web-Root durch "/" ersetzen
const rawReadme = fs.readFileSync('README.md', 'utf-8');
const readmeContent = rawReadme.replaceAll('public/', '/');
const infoContent = marked.parse(readmeContent);

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
              pageTitle: 'Documentation & Info | RapidWind – ICON-D2, AROME & HRRR Weather Map',
              description: 'Documentation, technical background and project information for RapidWind, the hourly wind and weather map built on ICON-D2 RUC, AROME PI and HRRR.',
              infoContent
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
