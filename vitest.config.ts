import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  // tsconfig keeps JSX as "preserve" for Next.js; tests that render components need the automatic runtime.
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"] },
});
