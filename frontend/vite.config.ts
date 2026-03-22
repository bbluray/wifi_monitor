import { fileURLToPath, URL } from 'node:url';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: fileURLToPath(new URL('./src/auto-imports.d.ts', import.meta.url)),
      eslintrc: {
        enabled: false,
      },
    }),
    Components({
      resolvers: [NaiveUiResolver()],
      dts: fileURLToPath(new URL('./src/components.d.ts', import.meta.url)),
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 1504,
    allowedHosts: ['o.dothings.top'],
    proxy: {
      '/api': {
        target: 'http://localhost:1503',
        changeOrigin: true,
      },
    },
  },
});
