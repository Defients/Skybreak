import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "game-engine": [
            "./src/engine/rulesEngine",
            "./src/engine/gameState",
            "./src/engine/combatEngine",
            "./src/engine/merchantEngine",
          ],
          "data": ["./src/data/items", "./src/data/classes", "./src/data/monsters"],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [],
  },
});
