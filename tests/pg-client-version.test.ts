/**
 * KLIEN PostgreSQL TIDAK BOLEH LEBIH TUA DARI SERVERNYA
 * (migrasi PostgreSQL — docs/arsitektur/07-RIWAYAT.md)
 *
 * == CACAT YANG DIJAGA, DAN IA SUDAH TERJADI SEKALI ========================
 * `pg_dump`/`pg_dumpall` MENOLAK server yang lebih baru daripada dirinya. Itu
 * bukan peringatan, melainkan penolakan keras:
 *
 *   pg_dumpall: error: aborting because of server version mismatch
 *   detail: server version: 17.11; pg_dumpall version: 15.19
 *
 * Diukur 12 Okt 2026, di image cadangan yang baru saja dibangun: `apt-get
 * install postgresql-client` di Debian bookworm memberi versi **15**, sementara
 * service `pg` di compose adalah **17**. Jadi perkakas cadangan tidak bisa
 * mendump basis data yang hendak dicadangkannya.
 *
 * Yang membuatnya berbahaya bukan kesalahannya, melainkan WAKTUNYA: tidak ada
 * yang gagal saat membangun image, tidak ada yang gagal saat `verify`, dan
 * tidak ada yang gagal selama produksi masih MariaDB. Ia akan gagal pada
 * cadangan PERTAMA sesudah penukaran — hari ketika cadangan paling dibutuhkan
 * dan paling sedikit diperiksa.
 *
 * Arahnya penting: klien yang lebih BARU bisa mendump server yang lebih tua.
 * Jadi aturannya bukan "harus sama", melainkan **klien ≥ server**.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AKAR = process.cwd();
const dockerfile = readFileSync(join(AKAR, "Dockerfile"), "utf8");
const compose = readFileSync(join(AKAR, "docker-compose.yml"), "utf8");

/** Versi mayor server dari `image: postgres:<mayor>...` di compose. */
function mayorServer(): number | null {
  const m = /image:\s*postgres:(\d+)/.exec(compose);
  return m ? Number(m[1]) : null;
}

/**
 * SETIAP versi mayor klien yang disebut Dockerfile.
 *
 * Jamak, bukan tunggal, dan itu perbaikan yang dituntut tahap 1b: sejak jalur
 * `tenant` punya image Go-nya sendiri, `postgresql-client-<n>` muncul DUA kali
 * di berkas ini — dan pemeriksa yang membaca kecocokan PERTAMA akan meluluskan
 * image kedua yang kliennya lebih tua. Di situlah dump sungguhan dijalankan
 * sejak tahap 1b, jadi justru itu yang paling tidak boleh lolos — dan
 * rancangan §3.5 memang sudah menuntutnya sebelum image itu ada: "tes versi
 * klien `pg` ikut menunjuk image Go, karena di situlah dump dijalankan".
 */
function mayorKlien(): number[] {
  return [...perintah.matchAll(/postgresql-client-(\d+)/g)].map((m) => Number(m[1]));
}

/**
 * Dockerfile TANPA baris komentarnya.
 *
 * Dibutuhkan karena berkas itu MENJELASKAN bahaya versi klien dalam prosa —
 * tiga kali, dengan menyebut `postgresql-client` tanpa nomor — dan pemeriksa
 * yang membaca seluruh teks akan menuding penjelasan itu sebagai pelanggaran.
 * Penjaga yang menolak komentar memaksa alasannya dihapus dari tempat ia paling
 * berguna; yang diperiksa PERINTAHNYA.
 */
const perintah = dockerfile
  .split("\n")
  .filter((b) => !b.trimStart().startsWith("#"))
  .join("\n");

describe("versi klien PostgreSQL vs servernya", () => {
  it("compose menyebut versi mayor server secara eksplisit", () => {
    /* `postgres:latest` akan membuat tes ini tidak bisa menjawab apa pun — dan
       versi server yang berubah sendiri saat image di-pull adalah cara lain
       untuk sampai ke kegagalan yang sama. */
    expect(mayorServer()).not.toBeNull();
  });

  it("Dockerfile memasang klien yang DIPATOK versinya", () => {
    expect(
      mayorKlien().length,
      "`postgresql-client` tanpa nomor versi mengambil versi Debian (15 di " +
        "bookworm), yang akan MENOLAK server 17. Pakai `postgresql-client-<n>`."
    ).toBeGreaterThan(0);
    /* Tanpa nomor versi sama sekali: tangkap bentuk `postgresql-client ` dan
       `postgresql-client\n`, yang akan lolos dari pemeriksaan di atas selama
       ADA satu penyebutan lain yang bernomor. */
    expect(
      /postgresql-client(?![-\w])/.test(perintah),
      "ada `postgresql-client` tanpa nomor versi di Dockerfile"
    ).toBe(false);
  });

  it("SETIAP klien yang dipasang TIDAK lebih tua dari server", () => {
    const server = mayorServer()!;
    const semua = mayorKlien();
    expect(semua.length, "tidak ada klien bernomor di Dockerfile").toBeGreaterThan(0);
    for (const klien of semua) {
      expect(
        klien,
        `klien PostgreSQL ${klien} < server ${server}. \`pg_dump\` akan menolak ` +
          `dengan "aborting because of server version mismatch" — pada cadangan ` +
          `PERTAMA sesudah penukaran. Naikkan \`postgresql-client-${server}\` di Dockerfile.`
      ).toBeGreaterThanOrEqual(server);
    }
  });

  it("image jalur `tenant` punya kliennya sendiri", () => {
    /* Sejak tahap 1b, dump SUNGGUHAN dijalankan image `integrator` — bukan
       image `backup`. Image tanpa `pg_dump` akan gagal pada pekerjaan
       `tenant.backup` PERTAMA, dengan "executable file not found". */
    const i = dockerfile.indexOf("AS integrator");
    expect(i, "tahap `integrator` tidak ada di Dockerfile").toBeGreaterThan(-1);
    const tahap = dockerfile.slice(i);
    expect(tahap).toMatch(/postgresql-client-\d+/);
    /* Dan sertifikat TLS untuk unggahan S3: tanpanya galatnya "x509:
       certificate signed by unknown authority", yang terbaca seperti
       kredensial salah. */
    expect(tahap).toMatch(/ca-certificates/);
  });

  it("klien diambil dari PGDG, bukan dari repo Debian", () => {
    /* Debian bookworm tidak punya `postgresql-client-17`; tanpa repo PGDG,
       `apt-get install` akan gagal saat build — yang BAIK. Tapi pemeriksaan ini
       membuat alasannya terbaca, bukan ditemukan lewat build yang gagal. */
    expect(dockerfile).toMatch(/apt\.postgresql\.org/);
    expect(dockerfile).toMatch(/bookworm-pgdg/);
  });

  it("klien MariaDB tetap ada — pembukti harus bisa membaca artefak mesin lama", () => {
    /* Sesudah penukaran, cadangan terakhir dari MariaDB masih satu-satunya
       salinan dari sebelum penukaran. Image yang hanya punya klien baru akan
       menolaknya justru pada hari ia paling dibutuhkan. */
    expect(dockerfile).toMatch(/mariadb-client/);
  });
});
