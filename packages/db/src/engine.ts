/**
 * MESIN BASIS DATA MANA — DIPUTUSKAN DARI URL, DI SATU TEMPAT
 * (migrasi PostgreSQL — docs/arsitektur/07-RIWAYAT.md)
 *
 * == KENAPA SATU TEMPAT ====================================================
 * Ada TIGA pabrik klien (`control-db`, `platform-db`, `company-clients`), satu
 * pembatas laju, satu penyedia basis data, dan beberapa skrip. Kalau
 * masing-masing memutuskan sendiri mesinnya apa, maka pada penukaran nanti ada
 * enam tempat yang bisa ketinggalan — dan yang ketinggalan tidak akan melempar
 * galat: ia akan menyambung ke mesin yang SALAH, atau tidak menyambung sama
 * sekali dengan pesan yang menyesatkan.
 *
 * == KENAPA DARI URL, BUKAN DARI SAKELAR ENV ==============================
 * Sakelar terpisah (`DB_ENGINE=postgres`) bisa menyimpang dari URL-nya: satu
 * disetel, satunya lupa. Lalu aplikasinya menyambung ke mesin yang satu sambil
 * mengirim SQL mesin yang lain, dan pesan galatnya tidak menyebut penyebabnya.
 *
 * Sejak Fase E (#636) mesinnya tinggal PostgreSQL, dan berkas ini tetap ada
 * untuk satu tugas: MENOLAK URL `mysql://` dengan pesan yang jelas.
 *
 * URL-nya SUDAH menyatakan mesinnya. Satu sumber kebenaran, nol kemungkinan
 * menyimpang.
 *
 * Murni dan tanpa impor: dipakai kode aplikasi (Next) MAUPUN skrip di luar Next,
 * alasan yang sama dengan `conformance-heartbeat.ts`.
 */

/**
 * Sejak Fase E (#636, 22 Okt 2026) hanya ada SATU mesin. Tipenya dipertahankan
 * sebagai literal tunggal, bukan dilipat jadi `string`: pemanggil yang masih
 * membandingkan `=== "mariadb"` gagal di `tsc`, bukan diam-diam selalu salah.
 */
export type DbEngine = "postgresql";

/** Skema URL yang dikenali, dipetakan ke mesinnya. */
const SKEMA: Record<string, DbEngine> = {
  "postgres:": "postgresql",
  "postgresql:": "postgresql",
};

/**
 * Skema mesin yang SUDAH DICABUT. Dikenali hanya untuk ditolak dengan pesan
 * yang menyebut sebabnya: `.env` lama yang masih memuat `mysql://` lebih baik
 * berhenti dengan "MariaDB sudah dicabut" daripada dengan "skema tak dikenal"
 * yang membuat orang mencari salah ketik.
 */
const SKEMA_DICABUT = new Set(["mysql:", "mariadb:"]);

/**
 * Mesin apa yang dituju URL ini.
 *
 * MELEMPAR untuk skema yang tidak dikenali, tidak pernah menebak — dan
 * MELEMPAR untuk `mysql://`/`mariadb://`: MariaDB dicabut di Fase E (#636).
 * Satu-satunya jalan kembali ke sana adalah memulihkan dump terakhirnya ke
 * image lama, bukan mengganti URL.
 */
export function dbEngineDariUrl(url: string): DbEngine {
  let protokol: string;
  try {
    protokol = new URL(url).protocol.toLowerCase();
  } catch {
    throw new Error("URL basis data tidak sah — mesinnya tidak bisa ditentukan.");
  }
  if (SKEMA_DICABUT.has(protokol)) {
    throw new Error(
      `URL basis data ber-skema "${protokol}" ditolak: MariaDB sudah dicabut (#636, Okt 2026). ` +
        "Arahkan URL ini ke PostgreSQL (postgres://…)."
    );
  }
  const mesin = SKEMA[protokol];
  if (!mesin) {
    throw new Error(
      `Skema URL basis data tidak dikenali: "${protokol}". ` +
        `Yang didukung: ${Object.keys(SKEMA).join(", ")}.`
    );
  }
  return mesin;
}

/** Port bawaan bila URL-nya tidak menyebutkan port. */
export const PORT_BAWAAN = 5432;

/**
 * Bagian URL yang dibutuhkan adapter & operasi server, diurai sekali.
 *
 * Kata sandi di-`decodeURIComponent`: sandi yang memuat `@` atau `/` WAJIB
 * ter-encode di dalam URL, dan meneruskannya apa adanya ke driver menghasilkan
 * "access denied" yang penyebabnya tidak akan pernah terlihat dari pesannya.
 */
export interface BagianKoneksi {
  mesin: DbEngine;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function uraikanUrl(url: string): BagianKoneksi {
  const mesin = dbEngineDariUrl(url);
  const u = new URL(url);
  return {
    mesin,
    host: u.hostname,
    port: Number(u.port) || PORT_BAWAAN,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}
