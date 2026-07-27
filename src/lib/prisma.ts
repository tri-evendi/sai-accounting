/**
 * `prisma` — klien basis data PERUSAHAAN YANG SEDANG DIBUKA (issue #104).
 *
 * Bentuk impornya sengaja tidak berubah sedikit pun:
 *
 *     import { prisma } from "@/lib/prisma";
 *
 * 120 berkas menulis baris itu. Mengganti semuanya menjadi "oper klien sebagai
 * parameter" bukan pekerjaan yang sepadan, dan setiap berkas yang terlewat akan
 * menjadi jalur yang diam-diam menulis ke basis data yang salah. Jadi yang
 * berubah bukan pemanggilnya, melainkan apa yang mereka pegang: `prisma` kini
 * sebuah **Proxy** yang, pada setiap akses properti, mencari klien milik
 * perusahaan yang konteksnya sedang aktif.
 *
 * ══ TIDAK ADA BASIS DATA BAWAAN. TITIK. ════════════════════════════════════
 * Tanpa konteks perusahaan, Proxy ini MELEMPAR (`MissingCompanyContextError`).
 * Ia tidak pernah memilihkan perusahaan, tidak pernah diam-diam memakai
 * `DATABASE_URL` lama, dan tidak punya mode "kalau cuma satu perusahaan, pakai
 * saja yang itu". Alasannya ada di `company-context.ts` dan layak diulang:
 * jatuh ke basis data bawaan berarti transaksi PT A tertulis ke buku PT B tanpa
 * galat dan tanpa jejak. Halaman yang gagal terbuka hari ini jauh lebih murah
 * daripada pembukuan yang tercampur diam-diam dan baru ketahuan saat tutup buku.
 *
 * Konteksnya ditanam oleh gerbang yang memang SUDAH dilewati setiap halaman dan
 * setiap route (`requirePagePermission` / `requireApiPermission`, dijaga
 * `tests/authz-coverage.test.ts`). Kode yang lahir di luar permintaan — skrip,
 * cron, seed — membungkus pekerjaannya dengan `runWithCompany()`.
 *
 * ══ CATATAN SOAL REFERENSI YANG DISIMPAN ═══════════════════════════════════
 * Karena penyelesaiannya terjadi saat AKSES PROPERTI, `prisma.invoice` yang
 * disimpan ke variabel lalu dipakai di permintaan lain akan menunjuk klien yang
 * salah. Jangan simpan delegate; panggil `prisma.<model>` di tempat pemakaian.
 * Itu sudah jadi kebiasaan di kode ini, jadi tak ada yang perlu diubah — tapi
 * kalau nanti ada yang tergoda "mengoptimalkan", inilah alasannya jangan.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import { getCompanyClient } from "@/lib/company-clients";
import { requireCompanyContext } from "@/lib/company-context";

/** Klien milik perusahaan yang konteksnya aktif — atau melempar. */
export function currentCompanyClient(): PrismaClient {
  const context = requireCompanyContext();
  return getCompanyClient(context.databaseName);
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = currentCompanyClient();
    const value = Reflect.get(client as object, property, receiver);
    // Method Prisma (`$transaction`, `$queryRaw`, …) harus tetap terikat pada
    // kliennya, bukan pada Proxy — kalau tidak, `this` di dalamnya kosong.
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, property) {
    return Reflect.has(currentCompanyClient() as object, property);
  },
  ownKeys() {
    return Reflect.ownKeys(currentCompanyClient() as object);
  },
  getOwnPropertyDescriptor(_target, property) {
    const descriptor = Reflect.getOwnPropertyDescriptor(
      currentCompanyClient() as object,
      property
    );
    // Invarian Proxy: properti yang dilaporkan ada HARUS configurable, sebab
    // target aslinya (objek kosong) tidak memilikinya.
    return descriptor ? { ...descriptor, configurable: true } : undefined;
  },
});
