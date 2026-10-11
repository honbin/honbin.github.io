// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://honb.in',
  markdown: {
    shikiConfig: {
      // Dual themes that follow the OS color scheme (see global.css for the
      // media query that activates the dark variables).
      themes: {
        light: 'github-light',
        dark: 'github-dark-dimmed',
      },
    },
  },
});
