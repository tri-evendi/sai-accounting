/**
 * PENJAGA #374 — jaminan skrip cadangan.
 *
 * Skrip cadangan punya sifat aneh: ia berjalan hijau setiap hari selama
 * bertahun-tahun, dan kesalahannya baru ketahuan pada satu hari ketika kita
 * paling tidak bisa menanggungnya. Tidak ada permukaan yang berubah warna
 * ketika seseorang menukar urutan dua langkah di dalamnya.
 *
 * Karena itu yang dijaga di sini bukan "apakah ia jalan" — itu urusan latihan
 * pemulihan — melainkan URUTAN dan SYARAT yang membuat kegagalannya tidak
 * berbahaya. Idiom sapuan sumber yang sama dengan `tests/no-public-uploads.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const script = readFileSync(join(process.cwd(), "scripts", "backup.sh"), "utf8");
const compose = readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8");

/** Posisi sebuah langkah di dalam skrip — untuk menguji URUTANNYA. */
const at = (needle: string): number => {
  const i = script.indexOf(needle);
  expect(i, `tidak ditemukan di backup.sh: ${needle}`).toBeGreaterThan(-1);
  return i;
};

describe("skrip cadangan: syarat yang menolak berjalan (#374)", () => {
  it("berhenti pada galat pertama, bukan melanjutkan setengah jalan", () => {
    // Tanpa ini, `mariadb-dump` yang gagal tetap diikuti tar, enkripsi, dan
    // unggah — menghasilkan "cadangan" berisi arsip kosong yang lampunya hijau.
    expect(script).toMatch(/^set -eu$/m);
  });

  it("menolak berjalan tanpa kunci enkripsi", () => {
    // Isinya seluruh pembukuan setiap pelanggan. Cadangan tanpa sandi yang
    // dikirim ke penyimpanan objek adalah kebocoran yang kita jadwalkan sendiri.
    expect(script).toContain('BACKUP_ENCRYPTION_KEY:-');
    expect(script).toMatch(/BACKUP_ENCRYPTION_KEY[\s\S]{0,200}die/);
  });

  it("menolak berjalan tanpa tujuan di luar mesin ini", () => {
    // Cadangan yang tinggal di mesin yang sama bukan cadangan — mesin itu juga
    // yang bisa mati.
    expect(script).toMatch(/BACKUP_S3_BUCKET[\s\S]{0,200}die/);
  });

  it("mencadangkan SELURUH basis data, bukan daftar yang diketik tangan", () => {
    // Daftar yang diketik tangan pasti tertinggal saat pelanggan baru mendaftar
    // — dan cadangan "hampir semua" adalah janji yang diingkari diam-diam.
    expect(script).toContain("--all-databases");
    expect(script).toContain("--single-transaction");
  });

  it("berkas di luar basis data ikut (#367 dokumen, #370 jejak)", () => {
    expect(script).toContain("documents");
    expect(script).toContain("audit");
  });
});

describe("skrip cadangan: urutan yang membuat kegagalan tidak berbahaya", () => {
  it("menyandikan SEBELUM mengirim, tidak pernah sesudah", () => {
    expect(at("openssl enc")).toBeLessThan(at("aws s3 cp"));
  });

  it("memangkas PALING AKHIR, setelah unggahan berhasil", () => {
    // Memangkas lebih dulu bisa meninggalkan kita tanpa cadangan sama sekali:
    // yang lama sudah dibuang, yang baru gagal naik.
    expect(at("aws s3 cp")).toBeLessThan(at("aws s3 rm"));
  });

  it("unggahan yang gagal MENGHENTIKAN skrip sebelum pemangkasan", () => {
    const upload = script.slice(at("aws s3 cp"), at("aws s3 rm"));
    expect(upload).toContain("die");
  });

  it("sidik jari dihitung dan ikut dikirim", () => {
    // AES-256-CBC tidak membawa pemeriksaan keutuhan sendiri: tanpa berkas
    // .sha256 di sebelahnya, arsip yang rusak di tengah jalan baru ketahuan
    // pada hari kita paling tidak ingin menemukannya.
    expect(script).toContain("sha256sum");
    expect(script).toContain(".sha256");
  });
});

describe("skrip cadangan: kredensial tidak pernah terlihat", () => {
  it("kata sandi basis data lewat berkas opsi, bukan argumen", () => {
    // Argumen baris perintah terbaca siapa pun yang bisa menjalankan `ps` di
    // dalam container.
    expect(script).toContain("--defaults-extra-file");
    expect(script).not.toMatch(/-p\$\{?DB_ROOT_PASSWORD/);
    expect(script).not.toMatch(/--password=\$/);
  });

  it("kunci enkripsi lewat environment, bukan argumen", () => {
    expect(script).toContain("-pass env:BACKUP_ENCRYPTION_KEY");
    expect(script).not.toMatch(/-pass\s+pass:/);
  });

  it("berkas kerja dibuang apa pun yang terjadi", () => {
    // Termasuk berkas opsi yang memuat kata sandi root.
    expect(script).toContain("trap cleanup EXIT");
  });
});

describe("layanan cadangan di compose (#374)", () => {
  const service = compose.slice(compose.indexOf("\n  backup:"), compose.indexOf("\n  web:"));

  it("ada, dan hidup lagi setelah restart mesin", () => {
    expect(service).toContain("restart: unless-stopped");
  });

  it("volumenya HANYA-BACA", () => {
    // Layanan yang tugasnya menyalin tidak punya satu alasan pun untuk bisa
    // menulis — dan bendera ini menghapus seluruh kelas kecelakaan di mana
    // skrip cadangan justru merusak yang dicadangkannya.
    expect(service).toContain("/app/data/documents:ro");
    expect(service).toContain("/app/data/audit:ro");
  });

  it("satu cadangan gagal tidak mematikan jadwal berikutnya", () => {
    expect(service).toContain("|| true");
  });
});
