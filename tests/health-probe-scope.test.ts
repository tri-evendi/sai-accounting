/**
 * CAKUPAN PROBE KESIAPAN (issue #374 · F-5).
 *
 * == Yang ditutup berkas ini ================================================
 * `/api/health` dulu hanya membuktikan basis data KENDALI terjangkau. Kendali
 * yang sehat membuktikan orang bisa masuk dan perusahaannya bisa DITEMUKAN — ia
 * tidak membuktikan bukunya bisa DIBUKA. Kredensial yang salah, migrasi yang
 * belum jalan, atau basis data PT yang tidak pernah dibuat akan lolos probe
 * lama SEPENUHNYA: `sai_control` hijau, dan setiap halaman pembukuan gagal.
 *
 * == Sifat yang paling menentukan ===========================================
 * Bidang baru DILAPORKAN, tidak IKUT MEMUTUSKAN. Doktrin #137: platform yang
 * mati tidak boleh membuat probe menyatakan aplikasinya sakit — dan satu PT
 * yang bukunya bermasalah tidak boleh menarik seluruh container keluar dari
 * rotasi, mematikan layanan bagi seluruh pelanggan lain.
 *
 * Yang menjatuhkan probe hanya kendali, sebab tanpa kendali tidak ada satu pun
 * halaman yang berguna — dan itulah definisi "belum siap" yang benar.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "src");

/**
 * Pengumpul bidangnya pindah ke `lib/health-report.ts` (#374, halaman status
 * publik): pembacanya kini DUA — route ini dan `/status` — dan dua pengukuran
 * atas mesin yang sama adalah dua jawaban yang suatu hari berbeda.
 *
 * Penjaga ini ikut pindah bersama subjeknya, dengan setiap tuntutan di bawah
 * UTUH. Yang tetap dijaga di route adalah satu-satunya hal yang memang milik
 * lapisan HTTP: 503.
 */
const report = readFileSync(join(ROOT, "lib", "health-report.ts"), "utf8");
const route = readFileSync(join(ROOT, "app", "api", "health", "route.ts"), "utf8");

describe("probe menyebut keempat bidangnya", () => {
  /* Kriteria selesai #374: "menyebut kendali, platform, satu PT contoh, dan
     denyut penjadwal". Dibaca dari SUMBERNYA — pola yang sama dengan penjaga
     `scheduler-heartbeat`, yang sudah lebih dulu menjaga `scheduler:` begitu. */
  it.each([
    ["control", /control:/],
    ["platform", /platform: platformStatus/],
    ["company", /company: companyStatus/],
    ["scheduler", /scheduler: schedulerStatus/],
  ])("menyebut `%s`", (_nama, pola) => {
    expect(report).toMatch(pola);
  });

  it("keempatnya dijemput BERSAMAAN, bukan berantai", () => {
    /* Probe kesiapan dipanggil Docker & Traefik pada interval pendek; empat
       pembacaan berurutan menjadikan probe itu sendiri beban yang ia ukur. */
    expect(report).toMatch(/Promise\.all\(\[\s*lastSchedulerRun\(\),/);
  });
});

describe("hanya KENDALI yang boleh menjatuhkan probe", () => {
  it("kendali tak terjangkau → 503", () => {
    expect(route).toMatch(/status: "error", database: "unreachable" \}, \{ status: 503 \}/);
  });

  it("tidak ada 503 kedua di berkas ini", () => {
    /*
     * Inti doktrin #137, dan cara termudah melanggarnya adalah menambahkan satu
     * `503` lagi untuk platform atau PT — yang mengubah kegagalan penagihan
     * (atau kegagalan SATU pelanggan) menjadi pemadaman bagi semua.
     */
    expect(route.match(/status: 503/g) ?? []).toHaveLength(1);
  });

  it("platform yang gagal menjawab `unknown`, bukan melempar", () => {
    expect(report).toMatch(/async function platform\(\)[\s\S]*?return \{ status: "unknown" \};/);
  });

  it("PT contoh yang gagal tidak mengubah status tingkat atas", () => {
    /* `status: "ok"` ditulis sebagai literal di jawabannya — tidak diturunkan
       dari bidang mana pun, jadi bidang yang merah tidak bisa menjalarinya. */
    expect(report).toMatch(/return \{\s*status: "ok",/);
  });
});

describe("PT contoh: satu, deterministik, dan jujur saat belum ada", () => {
  it("mengambil SATU PT, bukan semuanya", () => {
    /* Jumlah PT tumbuh seiring pelanggan; probe yang biayanya tumbuh adalah
       probe yang suatu hari menjadi beban yang ia ukur. */
    expect(report).toMatch(/controlDb\.company\.findFirst/);
    expect(report).not.toMatch(/controlDb\.company\.findMany/);
  });

  it("dipilih deterministik, supaya kegagalannya bisa ditelusuri", () => {
    expect(report).toMatch(/orderBy: \{ id: "asc" \}/);
  });

  it("belum ada PT sama sekali = `unknown`, bukan `error`", () => {
    /* Pemasangan baru belum punya satu PT pun. Menyebutnya `error` membuat
       setiap pemasangan segar terlihat sakit sejak menit pertama. */
    expect(report).toMatch(/if \(!databaseName\) return \{ status: "unknown" \};/);
  });

  it("basis data yang DISEBUT kendali tapi tak terjangkau = `error`", () => {
    /* Di sini ketidaktahuan sudah habis: kendali menyebut basis data ini ada,
       jadi tak terjangkaunya adalah kabar yang pasti. */
    expect(report).toMatch(/return \{ status: "error" \};/);
  });

  it("memakai kolam klien yang sama dengan aplikasinya", () => {
    /* Bukan koneksi baru yang dirakit sendiri: probe yang memakai jalur berbeda
       dari aplikasinya bisa hijau justru ketika aplikasinya tidak bisa
       menyambung. */
    expect(report).toMatch(/getCompanyClient\(databaseName\)/);
  });
});

/**
 * KEBOCORAN YANG DITUTUP 5 SEPTEMBER 2026 (issue #374).
 *
 * `/api/health` ada di `isPublicPath` — ia HARUS begitu, sebab Docker dan
 * Traefik memanggilnya tanpa kredensial. Akibatnya seluruh isinya terbaca siapa
 * pun yang tahu alamatnya, dan medan `backup.lastError` datang APA ADANYA dari
 * skrip cadangan. Yang benar-benar terbit hari itu, dari domain produksi:
 *
 *   "lastError": "BACKUP_S3_BUCKET belum diset — cadangan yang tinggal di
 *                 mesin yang sama bukan cadangan."
 *
 * Itu bukan status layanan. Itu pemberitahuan kepada internet anonim bahwa
 * pemasangan ini tidak punya salinan di luar server.
 *
 * Rambu yang dilanggar sudah ada dan sudah ditegakkan untuk tetangganya: #317
 * membatasi surel menjadi `mail.status` saja, tanpa host maupun sumber
 * konfigurasi. Medan cadangan lahir belakangan dan tidak ikut menerimanya.
 */
describe("probe publik tidak menerbitkan sebab kegagalan cadangan (#374)", () => {
  it("`lastError` dibuang sebelum jawabannya dirakit", () => {
    /* Bentuknya pembongkaran, bukan `delete`: medan BARU pada `BackupHealth`
       ikut terbawa keluar dengan sendirinya, dan medan yang kelak tidak boleh
       terbit harus disebut namanya di sini. */
    expect(report).toMatch(/function tanpaSebab\(\{ lastError: \w+, \.\.\.\w+ \}/);
    expect(report).toMatch(/backup: PublicBackupHealth/);
  });

  it("tidak ada jalan lain yang meloloskan `BackupHealth` utuh ke jawabannya", () => {
    /* Kedua titik balik `lastBackup()` harus melewati penyaringnya. Satu yang
       terlewat sudah cukup: jalur `catch` justru yang aktif ketika platform
       bermasalah, yaitu saat isinya paling mungkin menarik perhatian. */
    expect(report.match(/return tanpaSebab\(/g) ?? []).toHaveLength(2);
    expect(report).not.toMatch(/return backupHealth\(/);
  });

  it("STATUS-nya tetap terbit — menghapusnya memulihkan kesunyian yang #374 akhiri", () => {
    /* Pemantauan luar tidak punya cara lain mengetahui cadangan berhenti
       berjalan. Yang dicabut sebabnya, bukan kabarnya. */
    expect(report).toMatch(/backup: backupStatus/);
  });
});
