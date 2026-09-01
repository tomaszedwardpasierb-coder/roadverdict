import { defineConfig } from "vitest/config";
import path from "node:path";

// Separate from vitest.config.ts on purpose: these tests hit a real
// (emulator) Cosmos instance rather than mocking @/lib/cosmos, so they
// run in their own config/command (npm run test:integration) with their
// own global setup, instead of every ordinary `npm test` run silently
// depending on the emulator being installed and running.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/globalSetup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
