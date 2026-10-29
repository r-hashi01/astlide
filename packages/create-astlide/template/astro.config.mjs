import { defineConfig } from 'astro/config';
import astlide from '@astlide/astro';

export default defineConfig({
  integrations: [astlide()],
});
