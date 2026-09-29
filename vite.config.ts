import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      // Padrão do plugin não inclui fontes: sem isto os títulos (Bebas Neue) caem numa fonte comum no app instalado sem internet.
      workbox: { globPatterns: ["**/*.{js,css,html,woff2,svg,webmanifest}"] },
      manifest: {
        name: "Bahia Boxe",
        short_name: "Bahia Boxe",
        description: "Gestão de aulas de boxe",
        theme_color: "#121212",
        background_color: "#121212",
        lang: "pt-BR",
        display: "standalone",
        start_url: "/",
        // PNG de verdade: o SVG declarado como 192/512 não é aceito por todos os aparelhos, e o iPhone usa o apple-touch-icon (link no index.html).
        // O "maskable" é o mesmo logo menor, com o vermelho até a borda: o sistema recorta no formato do ícone sem cortar o desenho.
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Bibliotecas pesadas e que quase nunca mudam ficam em arquivos próprios: um deploy só do código do app não invalida o cache delas,
        // e o navegador baixa em paralelo.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          query: ["@tanstack/react-query"],
          datas: ["date-fns", "date-fns-tz"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
