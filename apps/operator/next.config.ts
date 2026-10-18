import { createRequire } from "node:module";
import path from "node:path";
import type { NextConfig } from "next";

import { securityHeaders } from "../../packages/core/src/security-headers";

/*
 * KONSOL OPERATOR sebagai aplikasi Next tersendiri (monorepo Fase 3d, dok 14).
 *
 * Akar repo dipakai DUA kali, dan keduanya wajib:
 *   • `turbopack.root` — Turbopack tidak menyelesaikan berkas di luar akarnya,
 *     dan `packages/*` ada dua tingkat di atas aplikasi ini;
 *   • `outputFileTracingRoot` — tanpa ini keluaran `standalone` hanya
 *     menelusuri `apps/operator`, dan image-nya mati saat memuat `@sai/*`.
 * Konsekuensinya, `server.js` standalone ada di `.next/standalone/apps/operator/`.
 */
const AKAR = path.join(import.meta.dirname, "..", "..");
const isProduction = process.env.NODE_ENV === "production";

/* Versi dari package.json AKAR — kedua aplikasi digelar dari SHA yang sama. */
const { version: appVersion } = createRequire(import.meta.url)("../../package.json") as {
  version: string;
};

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: AKAR,
  transpilePackages: ["@sai/db", "@sai/core", "@sai/ui", "@sai/billing", "@sai/platform"],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  // Sama dengan aplikasi pelanggan: typecheck dijalankan `bun run verify` di
  // akar (satu program `tsc` untuk seluruh repo), bukan di dalam `next build`.
  typescript: {
    ignoreBuildErrors: true,
  },
  modularizeImports: {
    "@ant-design/icons": { transform: "@ant-design/icons/{{member}}" },
  },
  turbopack: {
    root: AKAR,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(isProduction) }];
  },
};

export default nextConfig;
