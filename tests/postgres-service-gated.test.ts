/**
 * PostgreSQL DI COMPOSE HARUS TETAP TIDAK AKTIF SAMPAI PENUKARAN
 * (rencana migrasi — docs/arsitektur/11-RENCANA-POSTGRESQL.md §10 Fase D butir 9)
 *
 * == CACAT YANG DIJAGA ====================================================
 * Service `pg` dan `pgbouncer` ada di `docker-compose.yml` supaya penukaran
 * kelak tidak dimulai dengan menulis ulang compose di bawah tekanan. Tapi
 * keduanya TIDAK boleh hidup sebelum penukaran, dan alasannya terukur:
 *
 *   • Dua mesin basis data yang hidup bersamaan di kotak 3,6 GB berarti dua
 *     kali memori basis data untuk nol manfaat — mesin ini pernah sampai
 *     ~41 MB memori bebas.
 *   • Lebih buruk: PostgreSQL yang hidup dan KOSONG di sebelah MariaDB yang
 *     berisi adalah cara termudah menukar `DATABASE_URL` ke basis data kosong
 *     lalu mengira aplikasinya rusak.
 *
 * Satu baris `profiles:` yang terhapus saat merge mengubah keduanya menjadi
 * service bawaan, dan `docker compose up -d` berikutnya akan menyalakannya.
 * Tidak ada galat; hanya dua container tambahan yang tak seharusnya ada.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const compose = readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8");

/**
 * Potongan satu service, sampai service BERIKUTNYA — bukan sampai nama yang
 * dipaku, supaya rename berikutnya tidak memecahkan tes ini.
 *
 * ⚠ KOMENTAR DIBUANG LEBIH DULU, dan itu bukan kerapian. Blok komentar yang
 * mendahului sebuah service terhitung masuk rentang service SEBELUMNYA — jadi
 * komentar di `pg` yang menjelaskan `profiles:` membuat `db` tampak dipagari.
 * Ketahuan saat tes ini pertama dijalankan, dan ini kedua kalinya pola yang
 * sama menggigit hari ini (lihat `pg-trigger-parity.test.ts`).
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

describe("service PostgreSQL: ada, tapi tidak aktif", () => {
  it("keduanya ADA — definisinya tidak boleh hilang ke cabang atau dokumen", () => {
    /* Penjaga atas tes ini sendiri: kalau service-nya hilang, pemeriksaan
       `profiles` di bawah akan lulus dengan sepi karena tidak ada yang diperiksa. */
    expect(service("pg")).not.toBe("");
    expect(service("pgbouncer")).not.toBe("");
  });

  it.each(["pg", "pgbouncer"])("%s dipagari `profiles: [postgres]`", (nama) => {
    expect(service(nama)).toMatch(/profiles:\s*\["postgres"\]/);
  });

  it.each(["db", "app-customer", "app-operator", "job-scheduler", "job-backup"])(
    "%s TIDAK dipagari — ia memang harus hidup",
    (nama) => {
      expect(service(nama)).not.toMatch(/profiles:/);
    }
  );

  it("PgBouncer memakai pooling TRANSACTION, bukan session", () => {
    /* Dengan `session`, satu koneksi aplikasi memegang satu proses backend
       selama hidupnya — dan seluruh alasan PgBouncer ada di sini (puncak 62
       koneksi pada mesin 3,6 GB) hilang tanpa satu pun tanda. */
    expect(service("pgbouncer")).toMatch(/POOL_MODE:\s*transaction/);
  });

  it("PostgreSQL diinisialisasi dengan --data-checksums", () => {
    /* TIDAK bisa dinyalakan setelah inisialisasi. Satu-satunya kesempatan adalah
       saat volume dibuat; tanpa itu kerusakan halaman cakram terbaca sebagai
       data yang sah — pada pembukuan, itu kelas kerusakan terburuk. */
    expect(service("pg")).toMatch(/--data-checksums/);
  });

  it("volume `pg_data` dideklarasikan — volume yatim membuat data hilang diam-diam", () => {
    expect(compose).toMatch(/^ {2}pg_data:$/m);
  });

  it("`pg` punya healthcheck — `depends_on` tanpa itu hanya menunggu proses, bukan kesiapan", () => {
    expect(service("pg")).toMatch(/pg_isready/);
    expect(service("pgbouncer")).toMatch(/condition:\s*service_healthy/);
  });
});
