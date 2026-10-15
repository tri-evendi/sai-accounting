/**
 * SATU PABRIK ADAPTER UNTUK KEDUA MESIN
 * (rencana migrasi — docs/arsitektur/11-RENCANA-POSTGRESQL.md §10 Fase D)
 *
 * Tiga pabrik klien — `control-db`, `platform-db`, `company-clients` — dulu
 * masing-masing memanggil `new PrismaMariaDb({...})` dengan daftar parameter
 * yang sama diketik tiga kali. Pada penukaran mesin, tiga tempat itu harus
 * diubah bersamaan; yang satu ketinggalan akan menyambung ke mesin lama tanpa
 * satu pun galat.
 *
 * Sekarang ketiganya memanggil `buatAdapter(url, batasKoneksi)`, dan mesinnya
 * diputuskan dari URL (`db-engine.ts`). Penukaran = mengubah URL, titik.
 *
 * == KENAPA IMPOR PostgreSQL ADA DI ATAS, BUKAN DINAMIS ====================
 * `@prisma/adapter-pg` diimpor statis meski produksi hari ini MariaDB. Impor
 * dinamis (`await import`) akan membuat fungsi ini `async`, dan itu menjalar ke
 * ketiga pabrik klien beserta setiap pemanggilnya — perubahan besar demi
 * menghemat satu modul yang beberapa ratus kilobyte.
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaPg } from "@prisma/adapter-pg";
/* Impor RELATIF, bukan `@/lib/...`: berkas ini dipakai 28 skrip di luar Next,
   dan sebagian dijalankan `tsx` yang tidak selalu menyelesaikan alias tsconfig.
   Alias yang gagal di sana muncul sebagai "Cannot find module" saat berjalan —
   bukan saat `tsc`. */
import { uraikanUrl, type DbEngine } from "./db-engine";

export interface OpsiAdapter {
  /** Batas koneksi per klien. */
  batasKoneksi: number;
  /**
   * Nama basis data yang MENIMPA yang ada di URL.
   *
   * Dipakai pola satu-template-banyak-buku: satu URL membawa kredensial & host,
   * lalu tiap perusahaan menyambung ke basis datanya sendiri (#104).
   */
  database?: string;
}

/**
 * Adapter yang cocok untuk URL ini.
 *
 * ⚠ `batasKoneksi` berarti hal yang BERBEDA di kedua mesin, dan itu bukan
 * detail: MariaDB memakai thread per koneksi, PostgreSQL memakai PROSES. Angka
 * yang wajar di MariaDB bisa menjadi puluhan proses backend di PostgreSQL —
 * pada kotak 3,6 GB ini itulah alasan PgBouncer menjadi wajib, bukan opsional
 * (docs/arsitektur/11-RENCANA-POSTGRESQL.md §9.5). Angkanya dibiarkan sama di
 * sini dengan sengaja: yang mengubahnya harus PgBouncer di depan, bukan nilai
 * yang diam-diam berbeda per mesin.
 */
export function buatAdapter(url: string, opsi: OpsiAdapter) {
  const b = uraikanUrl(url);

  if (b.mesin === "postgresql") {
    return new PrismaPg({
      host: b.host,
      port: b.port,
      user: b.user,
      password: b.password,
      database: opsi.database ?? b.database,
      max: opsi.batasKoneksi,
    });
  }

  return new PrismaMariaDb({
    host: b.host,
    port: b.port,
    user: b.user,
    password: b.password,
    database: opsi.database ?? b.database,
    connectionLimit: opsi.batasKoneksi,
  });
}

/**
 * Tipe adapter yang dipulangkan `buatAdapter` — union kedua mesin.
 *
 * Dibutuhkan skrip yang menuliskan tanda tangan generik seperti
 * `new (args: { adapter: AdapterBasisData }) => T`. Sebelumnya mereka menulis
 * `PrismaMariaDb` di situ, yang MEMAKU mesin di tingkat TIPE — dan tipe yang
 * memaku mesin akan menolak adapter yang benar saat mesinnya berganti.
 */
export type AdapterBasisData = ReturnType<typeof buatAdapter>;

/** Mesin yang dituju URL — diekspor ulang supaya pemanggil tidak perlu dua impor. */
export function mesinDari(url: string): DbEngine {
  return uraikanUrl(url).mesin;
}
