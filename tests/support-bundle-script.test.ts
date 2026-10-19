/**
 * PENJAGA celah on-premise #6 — jaminan bundel diagnostik.
 *
 * Bundel diagnostik punya bentuk kegagalan yang berlawanan dengan skrip
 * cadangan. Cadangan gagal dengan TIDAK menyimpan sesuatu; bundel gagal dengan
 * MENGIRIM sesuatu. Dan kegagalannya tidak punya permukaan: bundel yang memuat
 * satu faktur terlihat persis sama dengan bundel yang tidak, sampai ia sudah
 * berada di luar mesin customer.
 *
 * Karena itu tes ini tidak cukup membaca skripnya. Untuk penyuntingan, ia
 * MENJALANKAN fungsi `sunting()` yang benar-benar dikirim — diambil langsung
 * dari berkasnya, bukan disalin ke sini — atas masukan yang dirancang bocor.
 * Salinan di tes akan ikut membeku saat skripnya berubah, dan itu kelas
 * kegagalan yang persis ingin dicegah.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const PATH_SKRIP = join(process.cwd(), "scripts", "support-bundle.sh");
const script = readFileSync(PATH_SKRIP, "utf8");

/** Ambil definisi `sunting()` dari skrip yang dikirim, lalu jalankan. */
const sunting = (masukan: string): string => {
  const awal = script.indexOf("sunting() {");
  expect(awal, "fungsi sunting() tidak ditemukan").toBeGreaterThan(-1);
  const akhir = script.indexOf("\n}\n", awal);
  expect(akhir, "penutup sunting() tidak ditemukan").toBeGreaterThan(awal);
  const fungsi = script.slice(awal, akhir + 3);
  return execFileSync("sh", ["-c", `${fungsi}\nsunting`], {
    input: masukan,
    encoding: "utf8",
  });
};

describe("bundel diagnostik: penyuntingan yang dijalankan, bukan dibaca", () => {
  it("menyunting kredensial di URI basis data", () => {
    const keluar = sunting(
      "Error: connect postgres://sai_app:R4hasi4Sekali@pg:5432/company_7 failed\n",
    );
    expect(keluar).not.toContain("R4hasi4Sekali");
    expect(keluar).toContain("<kredensial>");
  });

  it("menyunting alamat surel — pengguna DAN pelanggan tenant", () => {
    const keluar = sunting("WARN gagal kirim ke budi@pt-maju.co.id\n");
    expect(keluar).not.toContain("budi@pt-maju.co.id");
    expect(keluar).toContain("<surel>");
  });

  it("menyunting token pembawa dan JWT", () => {
    const keluar = sunting(
      'ERROR authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-DEF_123"\n',
    );
    expect(keluar).not.toContain("eyJzdWIiOiIxIn0");
    expect(keluar).not.toContain("abc-DEF_123");
  });

  it("menyunting nilai setelah kata kunci rahasia, apa pun bentuknya", () => {
    for (const baris of [
      "ERROR BACKUP_ENCRYPTION_KEY=abcd1234efgh",
      'ERROR secret: "abcd1234efgh"',
      "ERROR token=abcd1234efgh",
      "ERROR password 'abcd1234efgh'",
    ]) {
      expect(sunting(`${baris}\n`), baris).not.toContain("abcd1234efgh");
    }
  });

  it("menyunting deretan angka panjang — nominal, telepon, NPWP", () => {
    // Nominal rupiah adalah isi pembukuan. Satu baris galat yang memuatnya
    // membuat permintaan dukungan menjadi pengungkapan keuangan.
    const keluar = sunting("ERROR posting gagal: total 12500000 untuk 081234567890\n");
    expect(keluar).not.toContain("12500000");
    expect(keluar).not.toContain("081234567890");
  });

  it("TIDAK membuang yang memang dibutuhkan untuk diagnosis", () => {
    // Penyuntingan yang terlalu rakus membuat bundelnya tak berguna, dan bundel
    // tak berguna akan diganti orang dengan mengirim log mentah.
    const keluar = sunting("ERROR PrismaClientKnownRequestError P2002 di company_7\n");
    expect(keluar).toContain("PrismaClientKnownRequestError");
    expect(keluar).toContain("P2002");
    expect(keluar).toContain("company_7");
  });
});

describe("bundel diagnostik: allowlist, bukan daftar sensor", () => {
  it("log diambil dengan grep ke pola diagnostik, lalu disunting", () => {
    // Urutan dua pipa ini yang menentukan: grep DULU (buang yang tak dikenal),
    // sunting SESUDAHNYA (bersihkan yang lolos). Dibalik, setiap baris log
    // customer melewati penyuntingan dan yang tak tersunting ikut terkirim.
    expect(script).toMatch(
      /docker compose logs[\s\S]{0,200}grep -E "\$POLA_DIAGNOSTIK"[\s\S]{0,60}\| sunting/,
    );
  });

  it("setiap berkas yang dirakit melewati sunting", () => {
    // Satu blok yang lupa `| sunting` adalah satu berkas mentah di dalam arsip.
    const penulisan = [...script.matchAll(/> "\$KERJA\/([a-z-]+\.txt)"/g)].map((m) => m[1]);
    expect(penulisan.length).toBeGreaterThanOrEqual(5);
    for (const berkas of penulisan) {
      if (berkas === "manifes.txt") continue; // ditulis skrip sendiri, bukan keluaran perintah
      expect(
        script,
        `${berkas} dirakit tanpa melewati sunting`,
      ).toMatch(new RegExp(`\\| sunting > "\\$KERJA/${berkas.replace(".", "\\.")}"`));
    }
  });
});

describe("bundel diagnostik: yang tidak boleh ikut", () => {
  it("hanya NAMA variabel lingkungan, bukan nilainya", () => {
    expect(script).toMatch(/env 2>\/dev\/null \| cut -d= -f1/);
  });

  it("tidak pernah membaca BARIS tabel pembukuan", () => {
    // Pembeda yang dijaga: statistik perencana & katalog sistem boleh, SELECT
    // dari tabel pembukuan tidak. `n_live_tup` memberi angka tanpa isi.
    expect(script).toContain("pg_stat_user_tables");
    expect(script).toContain("n_live_tup");
    expect(script).not.toMatch(/select \*/i);
    for (const tabel of ["journal_lines", "invoices", "customers", "accounts", "payments"]) {
      expect(script, `menyentuh tabel pembukuan: ${tabel}`).not.toContain(tabel);
    }
  });

  it("tidak menyentuh berkas lisensi, dokumen, atau arsip cadangan", () => {
    // Yang dijaga: tidak ada PERINTAH yang membaca jalur-jalur itu. Menyebutnya
    // di manifes justru wajib — di situlah customer membaca bahwa ia tidak ikut.
    const baris = script
      .split("\n")
      .filter((l) => !/^\s*#/.test(l) && !/^\s*echo /.test(l));
    for (const jalur of ["licence", "license", "lisensi", "data/documents", "backup_archive"]) {
      const kena = baris.filter((l) => l.includes(jalur));
      expect(kena, `perintah menyentuh ${jalur}: ${kena.join(" | ")}`).toHaveLength(0);
    }
  });

  it("hanya MEMBACA — tidak ada perintah yang mengubah keadaan", () => {
    for (const perintah of [
      "docker compose up",
      "docker compose down",
      "docker compose restart",
      "docker compose build",
      "insert into",
      "update ",
      "delete from",
      "drop ",
    ]) {
      const pakai = new RegExp(`^(?!\\s*#).*${perintah}`, "mi");
      expect(script, `mengubah keadaan: ${perintah}`).not.toMatch(pakai);
    }
  });
});

describe("bundel diagnostik: bisa dibaca sebelum dikirim", () => {
  it("merakit manifes yang menyebut apa yang TIDAK ikut", () => {
    // Bundel yang isinya tak bisa diperiksa pengirimnya akan ditahan, lalu
    // diganti dengan tangkapan layar — dan diagnosisnya kembali ke nol.
    expect(script).toContain("manifes.txt");
    expect(script).toContain("YANG SENGAJA TIDAK IKUT");
    expect(script).toMatch(/BACA .*manifes\.txt/);
  });

  it("punya --dry-run yang tidak menulis apa pun", () => {
    const i = script.indexOf('if [ "$DRY" = "1" ]');
    const j = script.indexOf('mkdir -p "$KERJA');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i); // keluar sebelum direktori dibuat
    expect(script.slice(i, j)).toContain("exit 0");
  });

  it("berhenti pada galat pertama", () => {
    expect(script).toMatch(/^set -eu$/m);
  });
});
