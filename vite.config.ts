/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tinyflowDevServer } from "./src/server/devServerPlugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Server-side workflow execution - bundles only run on server
    tinyflowDevServer(),
  ],
  // Only expose VITE_ prefixed env vars to client (secrets stay server-side)
  envPrefix: ["VITE_"],
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
