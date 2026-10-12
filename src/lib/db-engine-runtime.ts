/**
 * MESIN MANA YANG SEDANG DIPAKAI, DIBACA SAAT BERJALAN
 * (rencana migrasi — docs/arsitektur/11-RENCANA-POSTGRESQL.md §10 Fase D)
 *
 * `db-engine.ts` murni: ia menjawab "URL ini mesinnya apa". Berkas ini yang
 * membaca environment dan menjawab "basis data X sedang di mesin apa" — dan ia
 * dipisahkan justru supaya `db-engine.ts` tetap bisa diuji tanpa environment.
 *
 * == KENAPA TIDAK DI-CACHE ================================================
 * `process.env` dibaca setiap kali. Itu terlihat boros untuk sesuatu yang tak
 * pernah berubah saat proses hidup — tapi nilai yang di-cache pada muat-modul
 * akan tertangkap di jalur yang modulnya dimuat SEBELUM `dotenv` berjalan (skrip
 * di luar Next), lalu menjawab "mariadb" selamanya karena URL-nya belum ada
 * saat itu. Pembacaan satu variabel environment tidak terukur biayanya;
 * menjawab mesin yang salah terukur sangat mahal.
 *
 * == KENAPA TIDAK MELEMPAR SAAT URL KOSONG ================================
 * Pemasangan tanpa basis data platform itu SAH (`platform-db.ts` sudah
 * menanganinya). Jadi URL yang kosong memulangkan `mariadb` sebagai bawaan —
 * bukan menebak, melainkan mempertahankan perilaku yang sudah ada hari ini.
 * URL yang ADA tapi skemanya tak dikenali tetap MELEMPAR, lewat `db-engine.ts`.
 */
import { dbEngineDariUrl, type DbEngine } from "@/lib/db-engine";

function dariEnv(nama: string): DbEngine {
  const url = process.env[nama]?.trim();
  if (!url) return "mariadb";
  return dbEngineDariUrl(url);
}

/** Mesin basis data KENDALI (pengguna, perusahaan, keanggotaan). */
export function mesinKendali(): DbEngine {
  return dariEnv("CONTROL_DATABASE_URL");
}

/** Mesin basis data PLATFORM (langganan, tagihan, jejak putaran). */
export function mesinPlatform(): DbEngine {
  return dariEnv("PLATFORM_DATABASE_URL");
}

/** Mesin buku besar PERUSAHAAN — semuanya memakai satu template URL. */
export function mesinPerusahaan(): DbEngine {
  return dariEnv("DATABASE_URL");
}
