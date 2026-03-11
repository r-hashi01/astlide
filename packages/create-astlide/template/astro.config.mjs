import { defineConfig } from 'astro/config';
import astlide from '@astlide/core';

export default defineConfig({
  integrations: [astlide()],
});
