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

  it("tanpa tujuan di luar mesin ia TETAP mencadangkan — ke cakram, dan berkata apa adanya", () => {
    // ══ TES INI DULU MENUNTUT YANG SEBALIKNYA ════════════════════════════════
    // Sampai 12 Okt 2026 ia menuntut `BACKUP_S3_BUCKET[\s\S]{0,200}die` — tanpa
    // bucket, skripnya harus MENOLAK berjalan. Niatnya benar ("cadangan yang
    // tinggal di mesin yang sama bukan cadangan") tapi akibatnya terukur dan
    // buruk: produksi menjalankan 54 putaran dengan NOL artefak, dan satu-satunya
    // jaring adalah dump tangan yang kebetulan diambil saat rilis.
    //
    // Penolakan itu melindungi dari SATU bentuk kegagalan — kehilangan mesin —
    // dengan membiarkan kita tanpa pertahanan terhadap semua bentuk lain:
    // `DROP TABLE` keliru, migrasi yang merusak, kerusakan logis. Itu mayoritas
    // kejadian yang sungguh terjadi.
    //
    // Yang dijaga SEKARANG bukan lagi "menolak", melainkan "tidak pernah
    // mengklaim lebih dari yang benar".
    expect(script).toMatch(/MODE=lokal/);
    expect(script).toMatch(/BACKUP_LOCAL_DIR/);
  });

  it("putaran lokal dicatat `lokal`, BUKAN `ok` — satu kata yang menentukan kejujurannya", () => {
    // `backupHealth` mencari keberhasilan dengan `where: { status: "ok" }`.
    // Kalau putaran lokal ikut menulis `ok`, `lastSuccessAt` terisi, umurnya
    // terhitung segar, dan permukaan kesehatan berkata TERLINDUNGI untuk keadaan
    // yang satu kehilangan mesin saja sudah cukup menghapus data dan salinannya
    // sekaligus. Ini satu-satunya baris yang mencegah itu.
    expect(script).toMatch(/rekam lokal/);
    expect(script).toMatch(/MODE" = "s3"[\s\S]{0,120}rekam ok/);
  });

  it("mode lokal berbunyi di log, tidak menyelinap", () => {
    // Jaring sementara yang dipasang diam-diam adalah jaring yang dilupakan
    // sebagai permanen.
    expect(script).toMatch(/BACKUP_S3_BUCKET belum diset[\s\S]{0,200}TIDAK menyelamatkan/);
  });

  it("salinan lokal ditulis lewat berkas sementara, lalu dipindahkan", () => {
    // `cp` yang terputus di tengah meninggalkan berkas setengah yang NAMANYA
    // tampak sah — dan nama yang tampak sah itulah yang akan dipercaya pada hari
    // pemulihan. `mv` dalam satu filesystem bersifat atomik.
    expect(script).toMatch(/\.partial/);
    expect(script).toMatch(/mv "\$\{DEST\}\/\.\$\(basename "\$SEALED"\)\.partial"/);
  });

  it("pemangkasan lokal TIDAK PERNAH membuang salinan terbaru", () => {
    // Aturan yang tidak ada di jalur S3, dan harus ada di sini: di S3 retensi 30
    // hari tanpa pengecualian aman karena sumber lain masih ada; di cakram ini
    // direktori itu satu-satunya yang ada. Sebuah mesin yang mati sebulan lalu
    // hidup kembali tidak boleh menyalakan pemangkas yang menghapus salinan
    // terakhirnya sendiri.
    expect(script).toMatch(/TERBARU=/);
    expect(script).toMatch(/\[ "\$base" = "\$TERBARU" \] && continue/);
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

describe("skrip cadangan: tujuan diturunkan dari URL, bukan sakelar sendiri", () => {
  /*
   * == CACAT YANG DIJAGA DI SINI, DAN IA SUDAH TERJADI ======================
   * Mesinnya sudah diturunkan dari `DATABASE_URL`; HOST-nya tidak — ia berdiri
   * sendiri sebagai `: "${DB_HOST:=db}"`. Sesudah penukaran PostgreSQL 15 Okt
   * 2026, skrip ini memakai perkakas yang BENAR terhadap host yang SALAH:
   *
   *   pg_dumpall: error: connection to server at "db" (172.19.0.2), port 5432
   *   failed: Connection refused
   *
   * Yang membuatnya mahal bukan galatnya — galatnya jelas. Yang mahal adalah
   * ia tidak terlihat di mana pun kecuali di `/api/health`: container tetap
   * "Up", penjadwal tetap `ok`, dan tidak ada satu pun cadangan otomatis yang
   * berhasil selama berjam-jam.
   */
  /*
   * ⚠ Komentar DIBUANG lebih dulu. Komentar yang menjelaskan cacat ini
   * mengutip `DB_HOST:=db` apa adanya, dan tes yang memindai mentah akan
   * membaca penjelasannya sebagai pelanggaran. Pola ini sudah menggigit EMPAT
   * kali di repo ini — tes yang menghukum dokumentasi yang baik akan membuat
   * orang menghapus dokumentasinya.
   */
  const kode = script
    .split("\n")
    .filter((b) => !/^\s*#/.test(b))
    .join("\n");

  /** Cabang `then` dan `else` dari percabangan mesin, terpisah. */
  const cabang = (() => {
    const mulai = kode.indexOf('if [ "$MESIN" = "postgres" ]');
    const sisa = kode.slice(mulai);
    const iElse = sisa.indexOf("\nelse\n");
    const iFi = sisa.indexOf("\nfi\n");
    return { pg: sisa.slice(0, iElse), maria: sisa.slice(iElse, iFi) };
  })();

  it("percabangan mesinnya ketemu — penjaga atas tes ini sendiri", () => {
    expect(cabang.pg.length).toBeGreaterThan(50);
    expect(cabang.maria.length).toBeGreaterThan(20);
  });

  it("host, port, peran, dan sandi PostgreSQL diambil dari DATABASE_URL", () => {
    expect(kode).toMatch(/DATABASE_URL#\*:\/\//);
    expect(cabang.pg).toMatch(/DB_HOST:=\$_host/);
    expect(cabang.pg).toMatch(/DB_PORT:=\$_port/);
  });

  it("`db` hanya boleh menjadi bawaan di cabang MariaDB", () => {
    /* Bawaan `db` yang berdiri di luar percabangan berlaku untuk KEDUA mesin —
       itulah bentuk persis cacat yang sudah terjadi. */
    expect(cabang.pg, "cabang PostgreSQL tidak boleh menyebut host `db`").not.toMatch(
      /DB_HOST:=db/
    );
    expect(cabang.maria).toMatch(/DB_HOST:=db/);
  });

  it("peran PostgreSQL TIDAK dipaku `postgres`", () => {
    /* Peran super di pemasangan ini bernama `sai`. Nama yang dipaku gagal di
       setiap pemasangan yang menamainya lain — termasuk yang ini. */
    expect(kode).not.toMatch(/--username=postgres\b/);
    expect(kode).toMatch(/--username="\$DB_USER"/);
  });

  it("kredensial di URL di-decode sebelum dipakai", () => {
    /* Sandi ter-persen-encode gagal hanya ketika ia kebetulan memuat `@`
       atau `%` — yaitu gagal belakangan, pada sandi yang berbeda, jauh dari
       perubahan yang menyebabkannya. Dua skrip di repo ini sudah kena. */
    expect(kode).toMatch(/uri_decode/);
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
  // Nama layanan di-rename saat pemisahan bidang: `backup` → `job-backup`,
  // dan `web` → `app-customer` + `app-operator`. Potongan diambil sampai
  // layanan BERIKUTNYA, bukan sampai nama yang dipaku — supaya rename
  // berikutnya tidak memecahkan tes ini lagi.
  const service = (() => {
    const mulai = compose.indexOf("\n  job-backup:");
    const sisa = compose.slice(mulai + 1);
    const habis = sisa.search(/\n {2}[a-z][a-z0-9-]*:$/m);
    return habis > 0 ? sisa.slice(0, habis) : sisa;
  })();

  it("ada, dan hidup lagi setelah restart mesin", () => {
    expect(service).toContain("restart: unless-stopped");
  });

  it("volume yang DICADANGKAN tetap hanya-baca", () => {
    // Layanan yang tugasnya menyalin tidak punya satu alasan pun untuk bisa
    // menulis ke SUMBERNYA — dan bendera ini menghapus seluruh kelas kecelakaan
    // di mana skrip cadangan justru merusak yang dicadangkannya.
    //
    // Sejak 12 Okt 2026 ia punya satu mount yang bisa ditulis (`cadangan`), dan
    // justru karena itu tes ini menjadi lebih penting, bukan kurang: yang boleh
    // ditulis hanya TUJUAN, tidak pernah sumbernya.
    expect(service).toContain("/app/data/documents:ro");
    expect(service).toContain("/app/data/audit:ro");
  });

  it("punya tepat SATU mount yang bisa ditulis, dan itu tujuannya sendiri", () => {
    const mounts = service
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^- \w+:\/app\//.test(l));
    const bisaDitulis = mounts.filter((l) => !l.endsWith(":ro"));
    expect(bisaDitulis).toEqual(["- cadangan:/app/data/cadangan"]);
  });

  it("satu cadangan gagal tidak mematikan jadwal berikutnya", () => {
    expect(service).toContain("|| true");
  });
});

describe("pembukti pemulihan: harus bisa membaca artefak yang BENAR-BENAR ada (12 Okt 2026)", () => {
  const prover = readFileSync(join(process.cwd(), "scripts/prove-backup-restore.ts"), "utf8");

  it("tidak lagi berhenti hanya karena BACKUP_S3_BUCKET kosong", () => {
    /*
     * Cacat yang hampir lolos: `backup.sh` belajar menyimpan ke cakram, tapi
     * pembuktinya masih menuntut bucket. Hasilnya jaring yang TIDAK BISA
     * dibuktikan — dan aturan repo ini jelas, cadangan yang belum pernah dibuka
     * bukan cadangan. Pembuktian yang tidak bisa membaca satu-satunya artefak
     * yang ada tidak membuktikan apa pun.
     */
    expect(prover).not.toMatch(/if \(!bucket\) fail/);
    expect(prover).toContain("BACKUP_LOCAL_DIR");
    expect(prover).toContain("sumberLokal");
  });

  it("artefak lokal DISALIN ke direktori kerja, tidak dibuka di tempatnya", () => {
    // Dekripsi menulis hasilnya di sebelah berkas sumbernya, dan direktori
    // cadangan adalah satu-satunya tempat artefak itu ada. Pembuktian tidak
    // boleh menyentuh apa yang dibuktikannya.
    expect(prover).toContain("copyFileSync");
  });

  it("langkah pembuktiannya SAMA untuk kedua sumber — yang diuji artefaknya", () => {
    // Satu sidik jari, satu dekripsi, satu pemeriksaan kelengkapan basis data.
    // Dua jalur pembuktian akan menyimpang, dan yang menyimpang akan dipercaya
    // justru pada hari ia salah.
    expect(prover.match(/createHash\("sha256"\)/g) ?? []).toHaveLength(1);
    expect(prover.match(/"enc", "-d"/g) ?? []).toHaveLength(1);
  });

  it("mode lokal MENGUMUMKAN batasnya, bukan lulus diam-diam", () => {
    expect(prover).toMatch(/TIDAK menyelamatkan dari kehilangan mesin/);
  });
});
