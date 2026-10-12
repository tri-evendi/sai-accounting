/**
 * KLIEN PostgreSQL TIDAK BOLEH LEBIH TUA DARI SERVERNYA
 * (rencana migrasi — docs/arsitektur/11-RENCANA-POSTGRESQL.md §10 Fase D butir 8)
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

/** Versi mayor klien dari `postgresql-client-<mayor>` di Dockerfile. */
function mayorKlien(): number | null {
  const m = /postgresql-client-(\d+)/.exec(dockerfile);
  return m ? Number(m[1]) : null;
}

describe("versi klien PostgreSQL vs servernya", () => {
  it("compose menyebut versi mayor server secara eksplisit", () => {
    /* `postgres:latest` akan membuat tes ini tidak bisa menjawab apa pun — dan
       versi server yang berubah sendiri saat image di-pull adalah cara lain
       untuk sampai ke kegagalan yang sama. */
    expect(mayorServer()).not.toBeNull();
  });

  it("Dockerfile memasang klien yang DIPATOK versinya", () => {
    expect(
      mayorKlien(),
      "`postgresql-client` tanpa nomor versi mengambil versi Debian (15 di " +
        "bookworm), yang akan MENOLAK server 17. Pakai `postgresql-client-<n>`."
    ).not.toBeNull();
  });

  it("klien TIDAK lebih tua dari server", () => {
    const server = mayorServer()!;
    const klien = mayorKlien()!;
    expect(
      klien,
      `klien PostgreSQL ${klien} < server ${server}. \`pg_dump\` akan menolak ` +
        `dengan "aborting because of server version mismatch" — pada cadangan ` +
        `PERTAMA sesudah penukaran. Naikkan \`postgresql-client-${server}\` di Dockerfile.`
    ).toBeGreaterThanOrEqual(server);
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
