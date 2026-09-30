import { defineConfig } from 'astro/config';
// SITE and BASE_PATH come from the deploy (GitHub Pages serves the site under /pablito/); locally the defaults apply.
export default defineConfig({
  site: process.env.SITE ?? 'https://pablito.example',
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'always',
});
