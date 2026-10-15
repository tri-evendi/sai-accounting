/**
 * PostgreSQL ADALAH MESIN UTAMA — dan compose harus mencerminkannya
 * (rencana migrasi — docs/arsitektur/11-RENCANA-POSTGRESQL.md §10 Fase E)
 *
 * == BERKAS INI DULU MENUNTUT YANG SEBALIKNYA ==============================
 * Sampai 15 Okt 2026 ia menuntut `pg` dan `pgbouncer` **dipagari**
 * `profiles: ["postgres"]`, supaya keduanya tidak hidup sebelum penukaran.
 * Alasannya benar pada waktunya: dua mesin basis data hidup bersamaan di kotak
 * 3,6 GB berarti dua kali memori untuk nol manfaat.
 *
 * Sesudah penukaran, pagar yang sama menjadi berbahaya. Skema Prisma memakai
 * `provider = "postgresql"`, jadi klien yang dibangkitkan **hanya** bisa bicara
 * ke PostgreSQL. Service yang opsional berarti `docker compose up -d` bisa
 * menaikkan aplikasi **tanpa basis data sama sekali** — dan gejalanya bukan
 * galat saat start, melainkan setiap permintaan yang gagal sesudahnya.
 *
 * Jadi yang dijaga sekarang kebalikannya: `pg` WAJIB, dan setiap layanan yang
 * butuh basis data menunggu KESIAPANNYA — bukan kesiapan MariaDB.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const compose = readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8");

/**
 * Potongan satu service, sampai service BERIKUTNYA — bukan sampai nama yang
 * dipaku, supaya rename berikutnya tidak memecahkan tes ini.
 *
 * ⚠ Komentar dibuang lebih dulu: blok komentar yang mendahului sebuah service
 * terhitung masuk rentang service SEBELUMNYA, jadi komentar yang MENYEBUT
 * sebuah kata kunci membuat service tetangganya tampak memilikinya.
 */
function service(nama: string): string {
  const mulai = compose.indexOf(`\n  ${nama}:`);
  if (mulai < 0) return "";
  const sisa = compose.slice(mulai + 1);
  const habis = sisa.search(/\n {2}[a-z][a-z0-9-]*:$/m);
  const blok = habis > 0 ? sisa.slice(0, habis) : sisa;
  return blok
    .split("\n")
    .filter((b) => !/^\s*#/.test(b))
    .join("\n");
}

const BUTUH_BASIS_DATA = [
  "migrate",
  "app-customer",
  "app-operator",
  "job-scheduler",
  "job-conformance",
  "job-backup",
] as const;

describe("PostgreSQL sebagai mesin utama", () => {
  it("`pg` dan `pgbouncer` ADA", () => {
    expect(service("pg")).not.toBe("");
    expect(service("pgbouncer")).not.toBe("");
  });

  it.each(["pg", "pgbouncer"])("%s TIDAK dipagari profile — ia wajib hidup", (nama) => {
    expect(
      service(nama),
      "Klien Prisma dibangkitkan untuk postgresql; service ini opsional berarti " +
        "aplikasi bisa naik tanpa basis data sama sekali."
    ).not.toMatch(/profiles:/);
  });

  it.each(BUTUH_BASIS_DATA)("%s menunggu `pg` sehat, bukan `db`", (nama) => {
    const s = service(nama);
    expect(s).toMatch(/depends_on:[\s\S]*?\bpg:\s*\n\s*condition:\s*service_healthy/);
    expect(
      s,
      "menunggu MariaDB sesudah penukaran berarti menunggu mesin yang tidak lagi dipakai"
    ).not.toMatch(/depends_on:[\s\S]*?\bdb:\s*\n\s*condition:/);
  });

  it("`db` (MariaDB) MASIH ADA — ia jalan mundur selama jendela transisi", () => {
    /* Kalau ia hilang dari compose, jalan mundur hilang bersamanya — dan
       mencabutnya harus langkah yang disengaja, bukan efek samping. */
    expect(service("db")).not.toBe("");
    expect(service("db")).toMatch(/image:\s*mariadb/);
  });

  it("PgBouncer memakai pooling TRANSACTION, bukan session", () => {
    /* Dengan `session`, satu koneksi aplikasi memegang satu proses backend
       selama hidupnya — dan seluruh alasan PgBouncer ada (puncak 62 koneksi
       terukur pada mesin 3,6 GB) hilang tanpa satu pun tanda. */
    expect(service("pgbouncer")).toMatch(/POOL_MODE:\s*transaction/);
  });

  it("PostgreSQL diinisialisasi dengan --data-checksums", () => {
    /* TIDAK bisa dinyalakan setelah inisialisasi; tanpa itu kerusakan halaman
       cakram terbaca sebagai data yang sah. */
    expect(service("pg")).toMatch(/--data-checksums/);
  });

  it("volume `pg_data` dideklarasikan", () => {
    expect(compose).toMatch(/^ {2}pg_data:$/m);
  });

  it("`migrate` menyambung LANGSUNG ke `pg`, melewati PgBouncer", () => {
    /*
     * Prisma Migrate mengambil `pg_advisory_lock` supaya dua proses tidak
     * memigrasikan satu basis data bersamaan. Kunci itu terikat SESI; PgBouncer
     * `transaction` pooling memberi backend berbeda tiap transaksi. Jadi kunci
     * diambil lalu lepas bersama transaksinya, dan percobaan berikutnya
     * menunggu kunci yang tidak punya pemilik:
     *
     *   P1002 — Timed out trying to acquire a postgres advisory lock
     *
     * Terukur 15 Okt 2026: `migrate` gagal, dan karena `app-*` bergantung
     * padanya lewat `depends_on`, aplikasi tidak naik sama sekali.
     *
     * Yang dijaga bukan sekadar "ada @pg:" — melainkan bahwa service ini tidak
     * menyisakan satu pun sambungan lewat pooler. Satu dari tiga yang tertinggal
     * akan menggantung hanya untuk basis data itu, dan gejalanya terbaca seperti
     * migrasi yang lambat, bukan migrasi yang salah sambung.
     */
    const s = service("migrate");
    for (const v of ["DATABASE_URL", "CONTROL_DATABASE_URL", "PLATFORM_DATABASE_URL"]) {
      const baris = s.split("\n").find((b) => b.trim().startsWith(`${v}:`));
      expect(baris, `${v} harus ditimpa di service migrate`).toBeDefined();
      expect(baris).toContain("@pg:5432");
      expect(baris).not.toContain("pgbouncer");
    }
  });

  it("aplikasi TETAP lewat pooler — penimpaan itu hanya untuk migrate", () => {
    /* Kalau penimpaannya menyebar ke `app-*`, seluruh alasan PgBouncer ada
       (puncak 62 koneksi pada kotak 3,6 GB) hilang tanpa satu pun tanda. */
    for (const nama of ["app-customer", "app-operator"]) {
      expect(service(nama)).not.toMatch(/DATABASE_URL:.*@pg:5432/);
    }
  });

  it("volume MariaDB `db_data` TIDAK dihapus", () => {
    /* Membuang volumenya membuang jalan mundurnya, dan itu tidak bisa dibatalkan. */
    expect(compose).toMatch(/^ {2}db_data:$/m);
  });
});
