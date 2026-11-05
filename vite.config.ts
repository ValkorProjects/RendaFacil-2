import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // https://vite-pwa-org.netlify.app/guide/
    VitePWA({
      // New service workers take over as soon as they are downloaded.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'RendaFacil',
        short_name: 'RendaFacil',
        description: 'RendaFacil web app',
        lang: 'en',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Matches the icon backdrop, so the launch splash screen is seamless.
        background_color: '#0b1220',
        theme_color: '#0b1220',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // Keep development requests on the current Vite module graph.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
