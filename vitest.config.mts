import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // src/lib/prisma.ts throws at import time without this. Tests never open a
    // connection — they drive the engine through an in-memory fake client.
    env: { DATABASE_URL: "mysql://test:test@127.0.0.1:3306/test" },
  },
});
