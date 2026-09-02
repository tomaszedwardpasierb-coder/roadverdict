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
    // Every test file here shares the SAME single Cosmos emulator
    // container - there's no per-file isolation like the mocked unit
    // suite has. Running files in parallel (vitest's default) means 3+
    // files hammer that one container's connections at once; on a
    // resource-constrained CI runner this saturates it until requests
    // start timing out at Cosmos's own ~10s server-side limit, not just
    // running slower. Serializing file execution removes the
    // cross-file contention entirely - each file gets the whole
    // container to itself.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
