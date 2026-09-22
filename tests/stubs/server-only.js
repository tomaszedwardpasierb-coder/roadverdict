// Place at: tests/stubs/server-only.js
//
// The real "server-only" package throws unconditionally unless the
// bundler sets the special "react-server" export condition - Next.js's
// own webpack build does this automatically, but Vitest/Node doesn't,
// so every test importing a file with `import "server-only"` at the top
// (cosmos.ts, blobStorage.ts, vaultDocument.ts) would otherwise throw
// even for legitimate server-side test usage. Aliased in vitest.config.ts
// and vitest.components.config.ts to this empty no-op instead.
export {};
