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

const route = readFileSync(
  join(__dirname, "..", "src", "app", "api", "health", "route.ts"),
  "utf8"
);

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
    expect(route).toMatch(pola);
  });

  it("keempatnya dijemput BERSAMAAN, bukan berantai", () => {
    /* Probe kesiapan dipanggil Docker & Traefik pada interval pendek; empat
       pembacaan berurutan menjadikan probe itu sendiri beban yang ia ukur. */
    expect(route).toMatch(/Promise\.all\(\[\s*lastSchedulerRun\(\),/);
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
    expect(route).toMatch(/async function platform\(\)[\s\S]*?return \{ status: "unknown" \};/);
  });

  it("PT contoh yang gagal tidak mengubah status tingkat atas", () => {
    /* `status: "ok"` ditulis sebagai literal di jawabannya — tidak diturunkan
       dari bidang mana pun, jadi bidang yang merah tidak bisa menjalarinya. */
    expect(route).toMatch(/return NextResponse\.json\(\{\s*status: "ok",/);
  });
});

describe("PT contoh: satu, deterministik, dan jujur saat belum ada", () => {
  it("mengambil SATU PT, bukan semuanya", () => {
    /* Jumlah PT tumbuh seiring pelanggan; probe yang biayanya tumbuh adalah
       probe yang suatu hari menjadi beban yang ia ukur. */
    expect(route).toMatch(/controlDb\.company\.findFirst/);
    expect(route).not.toMatch(/controlDb\.company\.findMany/);
  });

  it("dipilih deterministik, supaya kegagalannya bisa ditelusuri", () => {
    expect(route).toMatch(/orderBy: \{ id: "asc" \}/);
  });

  it("belum ada PT sama sekali = `unknown`, bukan `error`", () => {
    /* Pemasangan baru belum punya satu PT pun. Menyebutnya `error` membuat
       setiap pemasangan segar terlihat sakit sejak menit pertama. */
    expect(route).toMatch(/if \(!databaseName\) return \{ status: "unknown" \};/);
  });

  it("basis data yang DISEBUT kendali tapi tak terjangkau = `error`", () => {
    /* Di sini ketidaktahuan sudah habis: kendali menyebut basis data ini ada,
       jadi tak terjangkaunya adalah kabar yang pasti. */
    expect(route).toMatch(/return \{ status: "error" \};/);
  });

  it("memakai kolam klien yang sama dengan aplikasinya", () => {
    /* Bukan koneksi baru yang dirakit sendiri: probe yang memakai jalur berbeda
       dari aplikasinya bisa hijau justru ketika aplikasinya tidak bisa
       menyambung. */
    expect(route).toMatch(/getCompanyClient\(databaseName\)/);
  });
});
