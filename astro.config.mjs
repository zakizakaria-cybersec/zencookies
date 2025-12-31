// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://zencookies.pages.dev',
  output: 'server',
  adapter: cloudflare(),
  integrations: [sitemap()],
  devToolbar: {
    enabled: false
  }
});
