import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 4100 },
  ssgOptions: {
    // Emit /for-agencies/index.html instead of /for-agencies.html
    dirStyle: "nested",
  },
} as any);
