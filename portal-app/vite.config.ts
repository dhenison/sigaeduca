import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig({
  base: '/portal/',
  build: {
    outDir: '../portal',
    emptyOutDir: true,
    rollupOptions: {output: {manualChunks: {ionic: ['@ionic/react'], supabase: ['@supabase/supabase-js']}}}
  },
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'SIGA EDUCA — Portal do Aluno',
      short_name: 'SIGA EDUCA',
      lang: 'pt-BR',
      start_url: '/portal/',
      scope: '/portal/',
      display: 'standalone',
      theme_color: '#00236f',
      background_color: '#f8fafc',
      icons: [
        {src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any'},
        {src: 'icon-192.png', sizes: '192x192', type: 'image/png'},
        {src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable'}
      ]
    },
    workbox: {
      maximumFileSizeToCacheInBytes: 4000000,
      globPatterns: ['**/*.{js,css,html,svg,woff2,png}'],
      navigateFallback: '/portal/index.html'
    }
  })]
});
