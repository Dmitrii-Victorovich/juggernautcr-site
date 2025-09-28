import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://juggernautcr.ru',
  base: '/',
  integrations: [preact(), react()],
});

