/**
 * PENJAGA fan-out migration per perusahaan (#104; *bounded concurrency* §6).
 *
 * ══ KENAPA SIFATNYA DIJAGA DARI TEKS, BUKAN DIJALANKAN ═════════════════════
 * Menjalankan skrip ini menuntut 17 basis data perusahaan dan `prisma` di
 * PATH. Yang dijaga di sini karena itu SIFATNYA — idiom yang sama dengan
 * `tests/backup-script.test.ts` dan `tests/contract-jobs.test.ts` — dan
 * sifat-sifat di bawah dipilih karena hilangnya TIDAK menghasilkan galat apa
 * pun: ia hanya membuat rilis lebih lambat, atau log rilis tidak bisa dibaca,
 * atau satu buku tertinggal di skema lama tanpa ada yang menyadarinya.
 *
 * ══ INVARIAN I-1 ═══════════════════════════════════════════════════════════
 * "Jumlah tenant tidak boleh menambah pekerjaan *wall-clock*." Loop berurutan
 * melanggarnya secara langsung: ratusan `migrate deploy` satu per satu **di
 * setiap rilis**. Penjaga pertama di bawah itulah yang menahannya kembali.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO } from "./akar-sumber";

const skrip = readFileSync(join(AKAR_REPO, "scripts", "migrate-all-companies.ts"), "utf8");

/** Teks tanpa komentar — penjaga "TIDAK ADA" wajib memakainya. */
const kode = skrip
  .split("\n")
  .filter((b) => {
    const t = b.trimStart();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  })
  .join("\n");

describe("fan-out: beberapa perusahaan dimigrasikan BERSAMAAN", () => {
  it("bukan lagi satu loop berurutan atas seluruh daftar", () => {
    /* `for (const company of companies)` yang membungkus `spawnSync` adalah
       bentuk yang dilarang I-1: *wall-clock* tumbuh mengikuti jumlah tenant. */
    expect(kode).not.toMatch(/for \(const company of companies\)[\s\S]{0,400}spawnSync/);
  });

  it("punya kumpulan pelaksana yang dibatasi", () => {
    expect(kode).toMatch(/Promise\.all\(/);
    expect(kode).toContain("batasSerentak()");
  });

  it("pelaksana mengambil dari KURSOR bersama, bukan dari potongan yang dibagi rata", () => {
    /* Perusahaan tidak sama besar. Pembagian rata membuat satu pelaksana
       selesai lebih dulu lalu menganggur sementara yang lain masih punya
       giliran — paralelisme yang terbaca di kode tapi tidak di jam dinding. */
    expect(kode).toMatch(/kursor\+\+/);
  });

  it("batasnya kecil secara bawaan, dan berplafon", () => {
    /* Tiap pelaksana satu proses Prisma CLI plus satu backend PostgreSQL, dan
       migration berjalan SEMENTARA aplikasi masih melayani. Kotak ini ~3,6 GB
       dibagi enam aplikasi, dan repo ini sudah pernah kehilangan proses ke
       OOM-killer. Angka besar di sini adalah OOM yang kita jadwalkan sendiri,
       pada langkah rilis yang paling tidak boleh gagal separuh jalan. */
    const i = skrip.indexOf("function batasSerentak()");
    expect(i, "batasSerentak tidak ada").toBeGreaterThan(-1);
    const badan = skrip.slice(i, skrip.indexOf("\n}", i));
    expect(badan).toContain("COMPANY_MIGRATE_CONCURRENCY");
    expect(badan).toMatch(/return 2;/);
    expect(badan).toMatch(/> 8/);
  });

  it("nilai yang salah tulis BERBUNYI, tidak diam-diam jatuh ke bawaan", () => {
    /* Angka salah tulis yang diam-diam jatuh ke bawaan membuat orang mengira
       ia sedang menjalankan sesuatu yang lain — dan ia akan menyimpulkan hal
       yang salah dari waktu yang diukurnya. */
    const i = skrip.indexOf("function batasSerentak()");
    const badan = skrip.slice(i, skrip.indexOf("\n}", i));
    expect(badan.match(/console\.warn/g) ?? []).toHaveLength(2);
  });
});

describe("fan-out: log rilis tetap bisa dibaca", () => {
  it("keluaran tiap perusahaan DITANGKAP, bukan diwariskan ke terminal", () => {
    /* Dengan `stdio: "inherit"`, N proses Prisma menulis ke terminal yang sama
       dan hasilnya saling menyisip — tidak bisa dibaca justru pada hari satu di
       antaranya gagal. */
    expect(kode).not.toMatch(/stdio:\s*"inherit"/);
    expect(kode).toMatch(/encoding:\s*"utf8"/);
  });

  it("label dicetak DI ATAS keluarannya, dengan nomor pelaksananya", () => {
    /* Supaya potongan log mana pun bisa ditelusuri ke bukunya — dan supaya dua
       blok yang bersebelahan tidak terbaca sebagai satu. */
    expect(kode).toMatch(/\[p\$\{nomor\}\] migrate deploy/);
  });

  it("urutan laporan kegagalan DITETAPKAN, bukan urutan selesai", () => {
    /* Dengan beberapa pelaksana, urutan selesai berubah tiap putaran — dan
       ringkasan yang urutannya berubah membuat dua rilis yang hasilnya sama
       terbaca berbeda. */
    expect(kode).toMatch(/failures\.sort\(/);
  });
});

describe("fan-out: kegagalan satu perusahaan tidak menggantung yang lain (#104)", () => {
  it("kegagalan dicatat lalu pelaksananya LANJUT", () => {
    /* Persyaratan eksplisit #104: kalau skrip berhenti pada perusahaan pertama
       yang gagal, perusahaan sesudahnya ditinggalkan pada skema LAMA sementara
       aplikasinya sudah versi baru — satu basis data bermasalah menjatuhkan
       seluruh pemasangan. */
    expect(kode).toMatch(/failures\.push\(/);
    expect(kode).not.toMatch(/result\.status !== 0[\s\S]{0,200}process\.exit/);
  });

  it("exit code akhirnya bukan nol bila ada yang gagal", () => {
    /* Yang berhasil sudah benar-benar naik, tapi CI/deploy tetap harus tahu. */
    expect(kode).toMatch(/failures\.length > 0[\s\S]{0,600}process\.exit\(1\)/);
  });

  it("perusahaan NONAKTIF ikut dimigrasikan", () => {
    /* Nonaktif berarti "tidak bisa dibuka", bukan "boleh tertinggal": begitu ia
       diaktifkan lagi, skemanya harus sudah sesuai dengan aplikasi yang sedang
       berjalan. */
    expect(kode).not.toMatch(/where:\s*\{[^}]*isActive/);
    expect(kode).toMatch(/nonaktif/);
  });

  it("registry kosong MENOLAK, bukan sukses dengan nol pekerjaan", () => {
    /* Naik dengan registry kosong menghasilkan aplikasi yang terlihat sehat
       tapi menolak setiap orang yang masuk — dan orang akan mencari
       penyebabnya di tempat yang salah. Service `migrate` dirantai
       `service_completed_successfully`, jadi exit bukan-nol menahan `web`. */
    expect(kode).toMatch(/companies\.length === 0[\s\S]{0,1200}process\.exit\(1\)/);
  });
});

describe("fan-out: penerap migration tetap TUNGGAL", () => {
  it("yang menerapkan tetap `prisma migrate deploy`", () => {
    /* §3.5: Prisma tetap pemilik skema. Penerap kedua wajib menulis baris
       `_prisma_migrations` dalam format yang persis sama — termasuk
       checksum-nya — dan dua penulis pembukuan skema yang menyimpang TIDAK
       menghasilkan galat: `migrate deploy` berikutnya akan menerapkan ulang,
       atau melaporkan drift, pada basis data yang sebenarnya benar. */
    expect(kode).toMatch(/spawnSync\("prisma", \["migrate", "deploy"\]/);
    expect(kode).not.toMatch(/_prisma_migrations/);
  });

  it("tidak ada SQL migration yang dirangkai di skrip ini", () => {
    // Ia mengorkestrasi, tidak menerapkan.
    expect(kode).not.toMatch(/\bCREATE TABLE\b|\bALTER TABLE\b|\$executeRaw/);
  });
});
