import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = process.env.GITHUB_PAGES === 'true' ? '/oficina-inteligente/' : '/';
  return {
    base,
    resolve: {
      alias: [{ find: /^react-native$/, replacement: 'react-native-web' }],
      extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
    },
    define: {
      __VITE_SUPABASE_URL__: JSON.stringify(process.env.SUPABASE_URL ?? env.SUPABASE_URL ?? ''),
      __VITE_SUPABASE_ANON_KEY__: JSON.stringify(process.env.SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? ''),
      global: 'globalThis',
    },
    esbuild: { jsx: 'automatic' },
    plugins: [VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Oficina Inteligente',
        short_name: 'Oficina',
        description: 'Gestão profissional para oficinas mecânicas.',
        lang: 'pt-BR',
        start_url: base,
        display: 'standalone',
        background_color: '#f4f7fb',
        theme_color: '#10243a',
        icons: [
          { src: `${base}pwa-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: `${base}pwa-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/^\/(?:oficina-inteligente\/)?politica-de-privacidade\.html$/],
      },
    })],
  };
});
