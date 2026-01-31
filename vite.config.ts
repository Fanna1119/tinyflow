/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Expose TINYFLOW_ and OPENAI_ prefixed env vars to the client
  envPrefix: ["VITE_", "TINYFLOW_", "OPENAI_"],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/__tests__/**",
        "src/ui/**",
        "src/main.tsx",
        "src/App.tsx",
      ],
    },
    testTimeout: 10000,
  },
});
