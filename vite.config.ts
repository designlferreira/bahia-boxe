import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt": a versão nova fica esperando até a pessoa tocar em "Atualizar" (AvisoNovaVersao). Com "autoUpdate" ela só aparecia na
      // abertura seguinte, e no iPhone o app instalado quase nunca abre do zero. O registro é feito pelo próprio AvisoNovaVersao.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon-48.png", "apple-touch-icon.png"],
      // Padrão do plugin não inclui fontes: sem isto os títulos (Bebas Neue) caem numa fonte comum no app instalado sem internet.
      workbox: { // A logo entra no cache offline (Login e tela de abertura); os ícones não, o sistema os guarda na instalação.
      globPatterns: ["**/*.{js,css,html,woff2,svg,webmanifest}", "logo-bahia-boxe.png"] },
      manifest: {
        name: "Bahia Boxe",
        short_name: "Bahia Boxe",
        description: "Suas aulas de boxe",
        theme_color: "#121212",
        background_color: "#121212",
        lang: "pt-BR",
        display: "standalone",
        start_url: "/",
        // Ícones recortados da logo oficial (só o boxeador: o nome fica ilegível nesse tamanho). O iPhone usa o apple-touch-icon (link no index.html).
        // O "maskable" ocupa o quadrado inteiro: o sistema recorta no formato do ícone e o rosto fica dentro da área segura.
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
