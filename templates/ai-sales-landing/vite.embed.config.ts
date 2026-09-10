/* Build du BLOC À INTÉGRER uniquement — un seul fichier JS, un seul CSS, pour
 * pouvoir tout inliner. Ne remplace pas `npm run build`. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "embed-dist",
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      input: "src/embed.tsx",
      output: {
        inlineDynamicImports: true,
        entryFileNames: "embed.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
