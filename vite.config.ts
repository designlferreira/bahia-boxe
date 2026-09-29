import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      // Padrão do plugin não inclui fontes: sem isto os títulos (Bebas Neue) caem numa fonte comum no app instalado sem internet.
      workbox: { globPatterns: ["**/*.{js,css,html,woff2,svg,webmanifest}"] },
      manifest: {
        name: "Bahia Boxe",
        short_name: "Bahia Boxe",
        description: "Gestão de aulas de boxe",
        theme_color: "#121212",
        background_color: "#121212",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/favicon.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/favicon.svg", sizes: "512x512", type: "image/svg+xml" },
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
