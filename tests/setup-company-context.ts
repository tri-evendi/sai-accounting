/**
 * Setup global vitest: setiap berkas tes berjalan DI DALAM sebuah perusahaan
 * (issue #104).
 *
 * Sejak basis data akuntansi menjadi satu per perusahaan, kode aplikasi menolak
 * berjalan tanpa konteks perusahaan — itu justru jaring pengaman utamanya
 * (lihat `lib/company-context.ts`). Tes menguji kode yang, di dunia nyata,
 * SELALU dijalankan di dalam sebuah permintaan milik satu perusahaan; jadi di
 * sini konteks itu disediakan sekali, alih-alih membungkus ribuan pemanggilan.
 *
 * Ini TIDAK melemahkan jaringnya. Sifat "tanpa konteks harus melempar" diuji
 * secara eksplisit di `tests/company-context.test.ts`, yang keluar dari konteks
 * ini lewat `runWithoutCompany()` sebelum memeriksanya.
 */
import { beforeEach } from "vitest";
import { enterCompanyContext } from "@/lib/company-context";

export const TEST_COMPANY = {
  companyId: 1,
  slug: "pt-tes",
  databaseName: "sai_test",
} as const;

beforeEach(() => {
  enterCompanyContext(TEST_COMPANY);
});
