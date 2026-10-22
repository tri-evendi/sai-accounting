/**
 * PENJAGA jalur `interactive` — ekspor berantre (rancangan §5, tahap 1c).
 *
 * ══ SATU ATURAN YANG MENGIKAT SELURUH BERKAS INI ═══════════════════════════
 * `jobs` hidup di basis data KENDALI, dan kendali **tidak memuat satu angka
 * akuntansi pun** (`@sai/core/control-db`). Menaruh muatan laporan di sana
 * membatalkan janji isolasi fisik #104 pada saat itu juga — dan ia akan
 * bekerja sempurna sampai hari seseorang membaca `jobs.payload` dan menemukan
 * neraca empat PT di dalam satu tabel bersama.
 *
 * Karena itu muatan pekerjaan membawa PARAMETER, dan pekerjanya MENGHITUNG
 * ULANG dari buku PT. Penjaga pertama di bawah itulah yang menahannya.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO, tanpaKomentar } from "./akar-sumber";
import { EXPORT_MAX_ROWS, EXPORT_QUEUE_HANDOFF_ROWS } from "@sai/core/export-limits";

const pekerja = readFileSync(join(AKAR_REPO, "workers/interactive.ts"), "utf8");
const ruteEkspor = readFileSync(join(AKAR_REPO, "src/app/api/reports/export/route.ts"), "utf8");
const berkasLaporan = readFileSync(join(AKAR_REPO, "src/lib/report-files.ts"), "utf8");
const konteks = readFileSync(join(AKAR_REPO, "workers/jalur-perusahaan.ts"), "utf8");
const compose = readFileSync(join(AKAR_REPO, "docker-compose.yml"), "utf8");

describe("muatan pekerjaan: PARAMETER, bukan angka", () => {
  it("penerbit mengirim `reportId` + `params`, bukan muatan laporannya", () => {
    const i = ruteEkspor.indexOf("await publishJob({");
    expect(i, "penerbitan tidak ada di rute ekspor").toBeGreaterThan(-1);
    const badan = ruteEkspor.slice(i, ruteEkspor.indexOf("});", i));
    expect(badan).toMatch(/payload: \{ reportId: report\.id, params \}/);
    /* `payload` (muatan laporan, berisi angka) TIDAK boleh ikut. */
    expect(badan).not.toMatch(/\bpayload: payload\b|\.\.\.payload|sheet\b/);
  });

  it("pekerja MENGHITUNG ULANG, tidak membaca angka dari muatan", () => {
    expect(pekerja).toContain("buildReportPayload(report, params)");
    /* Kalau suatu hari muatan dipakai sebagai sumber angka, yang jatuh di sini
       adalah baris ini — bukan isolasi #104 di produksi. */
    const kode = tanpaKomentar(pekerja);
    expect(kode).not.toMatch(/muatan\.(rows|totalDebit|sheet|payload\b)/);
  });

  it("muatannya hanya punya dua medan yang dibaca", () => {
    const i = pekerja.indexOf("interface MuatanEkspor");
    expect(i).toBeGreaterThan(-1);
    const badan = pekerja.slice(i, pekerja.indexOf("}", i));
    expect(badan).toContain("reportId");
    expect(badan).toContain("params");
    expect(badan.split("\n").filter((b) => b.includes("?:"))).toHaveLength(2);
  });
});

describe("ambang penyerahan: tiga angka, tiga arti", () => {
  it("ambang penyerahan di BAWAH plafon penolakan", () => {
    /* Kalau terbalik, penyerahannya tak pernah tercapai dan ekspor besar tetap
       ditolak — penyerahan yang ada di kode tapi tidak di perilaku. */
    expect(EXPORT_QUEUE_HANDOFF_ROWS).toBeLessThan(EXPORT_MAX_ROWS);
  });

  it("dan jaraknya tidak sempit", () => {
    /* Ambang yang hampir menyentuh plafon berarti jendela "diserahkan" nyaris
       kosong: hampir setiap ekspor besar langsung ditolak, dan jalur antrean
       menjadi kode yang terlihat hidup. */
    expect(EXPORT_MAX_ROWS / EXPORT_QUEUE_HANDOFF_ROWS).toBeGreaterThanOrEqual(5);
  });

  it("rute menyerahkan LEBIH DULU, menolak kemudian", () => {
    /*
     * Urutannya menentukan: penolakan yang diperiksa lebih dulu membuat setiap
     * ekspor di atas plafon ditolak padahal ia bisa diserahkan.
     *
     * ⚠ Versi pertama penjaga ini HAMPA, dan mutasinya lolos: ia membandingkan
     * `indexOf("EXPORT_QUEUE_HANDOFF_ROWS")`, yang juga cocok dengan baris
     * IMPOR di kepala berkas — jadi posisinya selalu lebih kecil apa pun
     * urutan percabangannya. Yang dibandingkan sekarang kondisi `if`-nya
     * sendiri.
     */
    const serah = ruteEkspor.indexOf("if (sheet.rows.length > EXPORT_QUEUE_HANDOFF_ROWS)");
    const tolak = ruteEkspor.indexOf("if (sheet.rows.length > EXPORT_MAX_ROWS)");
    expect(serah, "percabangan penyerahan tidak ada").toBeGreaterThan(-1);
    expect(tolak, "percabangan penolakan tidak ada").toBeGreaterThan(-1);
    expect(serah).toBeLessThan(tolak);
  });

  it("tanpa `?id=` ia tetap menolak, bukan menerbitkan pekerjaan yang pasti gagal", () => {
    /* Muatan tanpa asal tidak bisa dihitung ulang siapa pun. */
    expect(ruteEkspor).toMatch(/reportById\(url\.searchParams\.get\("id"\)/);
    expect(ruteEkspor).toMatch(/if \(report && isExportable\(report\)\)/);
  });

  it("gerbang izin laporan diperiksa SEBELUM menerbitkan (#355)", () => {
    const i = ruteEkspor.indexOf("EXPORT_QUEUE_HANDOFF_ROWS");
    const badan = ruteEkspor.slice(i, ruteEkspor.indexOf("await publishJob({", i));
    expect(badan).toContain("canEffective(authz.session.user, report.permission)");
  });

  it("TANPA `dedupeKey` — dua klik memang dua pekerjaan", () => {
    /* Ekspor tidak punya akibat yang perlu dijaga idempoten (§4): yang hilang
       hanya berarti pengguna mengklik lagi. `dedupeKey` di sini justru akan
       membuat klik kedua tidak menghasilkan apa pun. */
    const i = ruteEkspor.indexOf("await publishJob({");
    const badan = ruteEkspor.slice(i, ruteEkspor.indexOf("});", i));
    expect(tanpaKomentar(badan)).not.toContain("dedupeKey");
  });
});

describe("pekerja: konteks perusahaan, dan bedanya dari jalur `ledger`", () => {
  it("masuk konteks lewat satu pembantu bersama", () => {
    /* Langkah ini sudah ada di jalur `ledger`; dua salinan akan menyimpang
       pada aturan multi-perusahaan yang paling mahal bila dilanggar. */
    expect(pekerja).toContain("dalamKonteksPerusahaan(");
    const ledger = readFileSync(join(AKAR_REPO, "workers/ledger.ts"), "utf8");
    expect(ledger).toContain("dalamKonteksPerusahaan(");
  });

  it("konteks yang HILANG melempar, tidak jatuh ke basis data bawaan", () => {
    /* Jatuh ke bawaan berarti transaksi PT A tertulis ke buku PT B tanpa galat
       dan tanpa jejak (#104). */
    expect(konteks).toMatch(/harus MELEMPAR/);
    expect(konteks).toMatch(/tidak pernah jatuh ke basis data bawaan/);
    expect(konteks).toContain("runWithCompany(");
  });

  it("registry dibaca ULANG, muatan tidak dipercaya", () => {
    /* Muatan datang dari penerbit dan bisa BASI: perusahaan yang slug-nya
       berubah atau yang sudah dihapus tidak boleh menentukan basis data mana. */
    expect(konteks).toContain("controlDb.company.findUnique");
    expect(konteks).toMatch(
      /select: \{ id: true, slug: true, \.\.\.COMPANY_DATABASE_TARGET_SELECT, isActive: true \}/
    );
  });

  it("perusahaan NONAKTIF: ditolak jalur `ledger`, diterima jalur `interactive`", () => {
    /*
     * Bedanya bukan selera. Jalur `ledger` MENULIS buku, jadi memposting ke
     * buku yang tidak bisa dibuka adalah angka yang tidak akan dilihat siapa
     * pun sampai ia dibuka lagi. Jalur `interactive` hanya MEMBACA, dan
     * mengekspor buku yang akan diarsipkan adalah justru alasan orang
     * menonaktifkannya.
     */
    const ledger = readFileSync(join(AKAR_REPO, "workers/ledger.ts"), "utf8");
    expect(ledger).toMatch(/dalamKonteksPerusahaan\(companyId, true,/);
    expect(pekerja).toMatch(/dalamKonteksPerusahaan\(ctx\.job\.companyId, false,/);
  });

  it("laporan yang hilang dari katalog MELEMPAR, tidak dilewati", () => {
    /* Pekerjaan yang diam-diam tidak menghasilkan apa pun akan terbaca `done`
       dengan `result_ref` kosong — dan tombol unduhnya 404 tanpa sebab. */
    expect(pekerja).toMatch(/tidak ada di katalog atau tidak dapat diekspor/);
  });

  it("pembatalan diperiksa SESUDAH hitung, SEBELUM tulis", () => {
    const hitung = pekerja.indexOf("buildWorkbookBuffer");
    const batal = pekerja.indexOf("ctx.cancelled()");
    const tulis = pekerja.indexOf("writeJobResult(");
    expect(hitung).toBeLessThan(batal);
    expect(batal).toBeLessThan(tulis);
  });

  it("nama berkasnya dari sumber yang SAMA dengan rute sinkron", () => {
    /* Nama berkas yang berbeda antara ekspor sinkron dan berantre adalah dua
       nama untuk satu laporan. */
    expect(pekerja).toContain("STATEMENT_TITLES");
    expect(ruteEkspor).toContain("STATEMENT_TITLES");
  });

  it("mengklaim HANYA `report.export`", () => {
    /* `document.generate` belum punya penerbit; pelari mengklaim hanya yang
       punya handler, dan `tests/kind-punya-pengklaim.test.ts` menolak `kind`
       yang DITERBITKAN tanpa pengklaim. */
    const i = pekerja.indexOf("handlers: {");
    const badan = pekerja.slice(i, pekerja.indexOf("\n  },", i));
    expect(badan).toContain('"report.export"');
    expect(tanpaKomentar(badan)).not.toContain('"document.generate"');
  });
});

describe("klien menunggu DI RUTE HASIL, bukan di rute status kedua", () => {
  it("202 ditangani, dan ia menunggu di alamat hasilnya", () => {
    expect(berkasLaporan).toMatch(/res\.status === 202/);
    expect(berkasLaporan).toMatch(/\/jobs\/\$\{encodeURIComponent\(kind\)\}\/\$\{jobId\}\/result/);
  });

  it("TIDAK ada rute status terpisah", () => {
    /*
     * Rute hasil sudah menjawab 409 `job_not_done` beserta statusnya. Rute
     * status kedua akan punya penjaga izinnya sendiri yang bisa menyimpang
     * dari penjaga unduhannya — dan yang menyimpang di antara keduanya adalah
     * kebocoran.
     */
    expect(tanpaKomentar(berkasLaporan)).not.toMatch(/\/jobs\/[^/]*\/status|\/api\/jobs\//);
  });

  it("409 melanjutkan penantian, status lain MENGHENTIKANNYA", () => {
    expect(berkasLaporan).toMatch(/res\.status !== 409/);
    expect(berkasLaporan).toMatch(/keadaan\.status === "dead"/);
  });

  it("ada BATAS waktu menunggu, dan pekerjaannya tidak dibatalkan olehnya", () => {
    /* Tab yang memeriksa setiap dua detik tanpa henti masih memeriksa besok
       pagi. Sesudah batas, pekerjaannya TETAP berjalan dan berkasnya tetap
       bisa diunduh nanti — yang berakhir hanya penantian ini. */
    expect(berkasLaporan).toContain("BATAS_TUNGGU_MS");
    expect(berkasLaporan).toMatch(/Berkasnya tidak hilang/);
  });

  it("alamat hasilnya menuntut sepasang slug (#489)", () => {
    /* Hasil pekerjaan selalu milik satu PT, dan `<a download>` tidak membawa
       header lingkup. */
    expect(berkasLaporan).toContain("parseTenantPath(window.location.pathname)");
    expect(berkasLaporan).toMatch(/bukan jalur bertenant/);
  });
});

describe("layanan di compose", () => {
  const svc = (() => {
    const mulai = compose.indexOf("\n  svc-interactive:");
    expect(mulai, "svc-interactive tidak ada di compose").toBeGreaterThan(-1);
    const sisa = compose.slice(mulai + 1);
    const habis = sisa.search(/\n {2}[a-z][a-z0-9-]*:$/m);
    return habis > 0 ? sisa.slice(0, habis) : sisa;
  })();

  it("penulis volume `hasil` hanya pelari jalur `interactive` — Node dan Go", () => {
    expect(svc).toMatch(/- hasil:\/app\/data\/hasil$/m);
    /* `app-customer` memasangnya hanya-baca: aplikasi men-stream byte-nya dan
       tidak punya satu alasan pun untuk menulisnya. Sejak tahap 1d jalur
       `interactive` punya DUA pelari (`svc-interactive` Node, mengklaim
       `report.export`; `svc-interactive-go`, mengklaim `report.export_go`),
       dan keduanya — HANYA keduanya — menulis hasil. */
    const pemilik = (i: number) =>
      [...compose.slice(0, i).matchAll(/\n {2}([a-z][a-z0-9-]*):\n/g)].at(-1)?.[1];
    const penulis = [...compose.matchAll(/- hasil:\/app\/data\/hasil(?!:ro)/g)].map((m) =>
      pemilik(m.index!)
    );
    expect(penulis.sort()).toEqual(["svc-interactive", "svc-interactive-go"]);
  });

  it("TIDAK memasang dokumen maupun jejak audit", () => {
    /* Jalur ini membaca BUKU, bukan berkas. Mount yang tidak dibutuhkan adalah
       permukaan yang tidak perlu ada. */
    expect(svc).not.toContain("documents:/app/data");
    expect(svc).not.toContain("audit:/app/data");
  });

  it("lewat PgBouncer, bukan langsung ke `pg`", () => {
    /* Ia membaca buku SATU PT per pekerjaan lewat klien per-perusahaan — bukan
       mencacah seluruh basis data seperti jalur `tenant`. */
    expect(svc).not.toMatch(/CONTROL_DATABASE_URL:\s*postgres:\/\/[^\n]*@pg:/);
    const dep = svc.slice(svc.indexOf("depends_on:"));
    expect(dep).toContain("pgbouncer");
  });

  it("hidup lagi setelah restart, dan punya jendela berhenti", () => {
    expect(svc).toContain("restart: unless-stopped");
    expect(svc).toMatch(/stop_grace_period:/);
  });

  it("menunggu migration selesai", () => {
    expect(svc).toContain("service_completed_successfully");
  });
});
