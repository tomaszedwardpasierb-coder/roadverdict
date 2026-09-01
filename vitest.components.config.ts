import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Separate from vitest.config.ts on purpose: component tests render real
// React trees and need a DOM (jsdom) plus the React JSX transform, neither
// of which the plain-Node unit/API suite wants or needs. Kept in its own
// command (npm run test:components) so the fast unit suite stays fast and
// untouched.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/components/**/*.test.tsx"],
    setupFiles: ["./tests/components/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
