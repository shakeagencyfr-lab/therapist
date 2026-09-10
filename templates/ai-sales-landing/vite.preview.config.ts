/* Build d'APERÇU uniquement — produit un bundle unique, sans découpage, pour
 * pouvoir tout inliner dans une seule page HTML autonome. Ne remplace pas
 * `npm run build`, qui reste le build de production pré-rendu. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "preview-dist",
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: "app.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
