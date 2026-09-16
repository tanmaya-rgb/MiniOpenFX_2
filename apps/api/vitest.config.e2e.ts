import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // All e2e specs share one real Postgres/Redis and the single seeded
    // client (no mocking, no per-file DB isolation — see CLAUDE.md). Two
    // spec files mutating that client's balances concurrently would make
    // before/after assertions flaky, so files run one at a time.
    fileParallelism: false,
  },
});
