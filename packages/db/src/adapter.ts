/**
 * SATU PABRIK ADAPTER
 * (migrasi PostgreSQL — docs/arsitektur/07-RIWAYAT.md)
 *
 * Tiga pabrik klien — `control-db`, `platform-db`, `company-clients` — dulu
 * masing-masing memanggil konstruktor adapter dengan daftar parameter yang sama
 * diketik tiga kali. Pada penukaran mesin (15 Okt 2026) tiga tempat itu harus
 * diubah bersamaan; yang satu ketinggalan akan menyambung ke mesin lama tanpa
 * satu pun galat.
 *
 * Sekarang ketiganya memanggil `buatAdapter(url, batasKoneksi)`, dan URL-nya
 * diurai di satu tempat (`engine.ts`) — yang juga MENOLAK `mysql://`. Cabang
 * `PrismaMariaDb` dicabut di Fase E (#636, 22 Okt 2026).
 */
import { PrismaPg } from "@prisma/adapter-pg";
/* Impor RELATIF, bukan `@/lib/...`: berkas ini dipakai 28 skrip di luar Next,
   dan sebagian dijalankan `tsx` yang tidak selalu menyelesaikan alias tsconfig.
   Alias yang gagal di sana muncul sebagai "Cannot find module" saat berjalan —
   bukan saat `tsc`. */
import { uraikanUrl, type DbEngine } from "./engine";

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
 * Adapter untuk URL ini.
 *
 * ⚠ `batasKoneksi` di PostgreSQL berarti PROSES backend, bukan thread — pada
 * kotak 3,6 GB ini itulah alasan PgBouncer wajib di depan, bukan opsional
 * (docs/arsitektur/07-RIWAYAT.md).
 */
export function buatAdapter(url: string, opsi: OpsiAdapter) {
  const b = uraikanUrl(url);
  return new PrismaPg({
    host: b.host,
    port: b.port,
    user: b.user,
    password: b.password,
    database: opsi.database ?? b.database,
    max: opsi.batasKoneksi,
  });
}

/**
 * Tipe adapter yang dipulangkan `buatAdapter`.
 *
 * Dibutuhkan skrip yang menuliskan tanda tangan generik seperti
 * `new (args: { adapter: AdapterBasisData }) => T`, supaya tidak ada yang
 * menulis nama kelas adapter (memaku mesin di tingkat TIPE) di luar pabrik ini.
 */
export type AdapterBasisData = ReturnType<typeof buatAdapter>;

/** Mesin yang dituju URL — diekspor ulang supaya pemanggil tidak perlu dua impor. */
export function mesinDari(url: string): DbEngine {
  return uraikanUrl(url).mesin;
}
