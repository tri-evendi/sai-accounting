/**
 * Terapkan migration basis data PLATFORM (`sai_platform`, issue #137).
 *
 *   bun run db:migrate:platform   # platform saja
 *   bun run db:migrate:all        # kendali → platform → semua perusahaan
 *
 * ══ KENAPA DIBUNGKUS, BUKAN `prisma migrate deploy` LANGSUNG ═══════════════
 * `db:migrate:all` berjalan di service `migrate` compose, dan `web` dirantai
 * `service_completed_successfully` padanya. Basis data platform bersifat
 * OPSIONAL untuk pemasangan yang belum berlangganan-lengganan (multi-PT satu
 * grup usaha, keadaan produksi hari ini): kalau ketiadaan `sai_platform`
 * menggagalkan rantai itu, deploy buku besar tersandera oleh penagihan yang
 * memang belum berdiri — kebalikan dari janji "penagihan mati ≠ login mati".
 *
 * Aturannya karena itu dua sisi, dan keduanya disengaja:
 *   • `PLATFORM_DATABASE_URL` TIDAK DISET → lewati dengan peringatan yang
 *     berisik, exit 0. Pemasangan tanpa penagihan tetap bisa deploy.
 *   • `PLATFORM_DATABASE_URL` DISET tapi migrationnya gagal → exit BUKAN NOL.
 *     URL yang diset adalah pernyataan "pemasangan ini memakai penagihan";
 *     skema platform yang tertinggal dari kodenya harus menghentikan deploy,
 *     sama seperti basis data kendali.
 *
 * Ini BERBEDA dari doktrin "konteks perusahaan yang hilang harus MELEMPAR"
 * (docs/MULTI-COMPANY.md §2) dan tidak melemahkannya: konteks perusahaan yang
 * hilang lalu jatuh ke bawaan menulis buku PT A ke PT B tanpa jejak; basis
 * data platform tidak punya "bawaan" untuk jatuh — ketiadaannya di sini
 * dilewati berisik, dan di runtime (`lib/platform-db.ts`) tetap MELEMPAR.
 */

import "dotenv/config";
import { spawnSync } from "node:child_process";

const url = process.env.PLATFORM_DATABASE_URL?.trim();

if (!url) {
  console.warn(
    "⚠ PLATFORM_DATABASE_URL belum diset — migration basis data platform DILEWATI.\n" +
      "  Pemasangan ini berjalan tanpa data langganan/penagihan (issue #137).\n" +
      "  Untuk menyediakannya: buat basis data `sai_platform`, set " +
      "PLATFORM_DATABASE_URL di .env (lihat .env.docker.example), lalu jalankan " +
      "`bun run db:migrate:platform`."
  );
  process.exit(0);
}

// `prisma` dipanggil polos, bukan lewat `npx`/`bunx`: setiap package manager
// menaruh node_modules/.bin di depan PATH saat menjalankan skrip package.json,
// jadi ini bekerja di bawah bun MAUPUN npm dan melewatkan satu proses perantara.
// Konsekuensinya skrip ini WAJIB dijalankan lewat `bun run db:migrate:platform`,
// bukan `tsx scripts/migrate-platform.ts` langsung — lihat penanganan ENOENT.
const result = spawnSync(
  "prisma",
  ["migrate", "deploy", "--config", "prisma.platform.config.ts"],
  { stdio: "inherit" }
);

if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
  console.error(
    "✗ Binary `prisma` tidak ditemukan di PATH. Jalankan lewat package manager " +
      "supaya node_modules/.bin masuk PATH:\n" +
      "    bun run db:migrate:platform"
  );
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    "✗ Migration basis data platform GAGAL. PLATFORM_DATABASE_URL diset, jadi " +
      "pemasangan ini menyatakan memakai penagihan — skema platform yang " +
      "tertinggal dari kode harus menghentikan deploy, bukan dilewati."
  );
  process.exit(result.status ?? 1);
}
