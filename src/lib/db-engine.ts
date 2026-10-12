/**
 * MESIN BASIS DATA MANA — DIPUTUSKAN DARI URL, DI SATU TEMPAT
 * (rencana migrasi — docs/arsitektur/11-RENCANA-POSTGRESQL.md §10 Fase D)
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
 * disetel, satunya lupa. Lalu aplikasinya menyambung ke MariaDB sambil mengirim
 * SQL PostgreSQL, dan pesan galatnya tidak akan menyebut penyebabnya.
 *
 * URL-nya SUDAH menyatakan mesinnya. Satu sumber kebenaran, nol kemungkinan
 * menyimpang.
 *
 * Murni dan tanpa impor: dipakai kode aplikasi (Next) MAUPUN skrip di luar Next,
 * alasan yang sama dengan `conformance-heartbeat.ts`.
 */

export type DbEngine = "mariadb" | "postgresql";

/** Skema URL yang dikenali, dipetakan ke mesinnya. */
const SKEMA: Record<string, DbEngine> = {
  "mysql:": "mariadb",
  "mariadb:": "mariadb",
  "postgres:": "postgresql",
  "postgresql:": "postgresql",
};

/**
 * Mesin apa yang dituju URL ini.
 *
 * MELEMPAR untuk skema yang tidak dikenali, tidak pernah menebak. Menebak
 * "mariadb" sebagai bawaan berarti satu salah ketik pada URL PostgreSQL akan
 * diam-diam menyambung ke mesin lama — dan pada hari penukaran, "sebagian
 * layanan masih di mesin lama" adalah keadaan terburuk yang mungkin: data
 * tertulis ke dua tempat sekaligus.
 */
export function dbEngineDariUrl(url: string): DbEngine {
  let protokol: string;
  try {
    protokol = new URL(url).protocol.toLowerCase();
  } catch {
    throw new Error("URL basis data tidak sah — mesinnya tidak bisa ditentukan.");
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
export function portBawaan(mesin: DbEngine): number {
  return mesin === "postgresql" ? 5432 : 3306;
}

/**
 * Bagian URL yang dibutuhkan kedua adapter, diurai sekali.
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
    port: Number(u.port) || portBawaan(mesin),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}
