/**
 * PENJAGA tahap 1a — pelari jalur dan jalur `ledger`.
 *
 * Pelari punya empat sifat yang hilangnya TIDAK menghasilkan galat apa pun, dan
 * ketiga yang pertama hanya terlihat sebagai data yang salah berbulan-bulan
 * kemudian:
 *
 *   1. lease diperpanjang selama bekerja — tanpanya pekerjaan 30 menit diklaim
 *      pekerja kedua sementara yang pertama masih berjalan;
 *   2. lease yang hilang MENGHENTIKAN pekerjaan — tanpanya dua pekerja menulis
 *      hasil untuk satu pekerjaan;
 *   3. `failJob` tidak dipanggil setelah lease hilang — ia akan menaikkan
 *      `attempts` milik pekerjaan yang kini dipegang pekerja lain;
 *   4. SIGTERM menyelesaikan yang sedang jalan — mematikan proses di tengah
 *      tulisan menghasilkan keadaan separuh, dan rilis mengirim SIGTERM setiap
 *      kali.
 *
 * Yang dijaga BENTUK sumbernya: pelari butuh antrean hidup untuk dijalankan,
 * dan tes yang menuntut basis data tidak akan pernah jalan di gerbang ini.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JOB_LANES, KINDS_BY_LANE } from "@sai/core/generated/job-kinds";

const akar = process.cwd();
const RUNNER = readFileSync(join(akar, "workers", "runner.ts"), "utf8");
const LEDGER = readFileSync(join(akar, "workers", "ledger.ts"), "utf8");
const KONTEKS = readFileSync(join(akar, "workers", "jalur-perusahaan.ts"), "utf8");

/**
 * Buang komentar: beberapa larangan di bawah DISEBUT di komentarnya sendiri,
 * dan justru di situlah alasannya ditulis.
 *
 * Komentar blok dibuang UTUH, bukan baris-per-baris: gaya komentar di repo ini
 * tidak memakai `*` di baris lanjutan, jadi penyaring per-baris melewatkannya —
 * dan penjaga yang melewatkan komentar akan gagal karena kalimat, bukan karena
 * kode.
 */
const kode = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

describe("pelari: lease", () => {
  it("memperpanjang lease pada interval dari kontrak, bukan angka tertanam", () => {
    expect(RUNNER).toContain("setInterval(");
    // Intervalnya ditutup DENGAN konstanta kontrak, bukan angka tertanam.
    expect(RUNNER).toContain("}, LEASE_RENEW_MS);");
    expect(RUNNER).not.toMatch(/setInterval\([\s\S]*?\}, \d/);
  });

  it("lease yang hilang menghentikan pekerjaan", () => {
    expect(RUNNER).toContain("class LeaseLostError");
    expect(RUNNER).toMatch(/if \(!leaseHidup\) throw new LeaseLostError\(\)/);
  });

  it("TIDAK melaporkan kegagalan setelah lease hilang", () => {
    /* `failJob` di jalur ini akan menaikkan `attempts` milik pekerjaan yang kini
       dipegang pekerja lain — merusak hitungan percobaan orang lain. */
    const i = RUNNER.indexOf("if (e instanceof LeaseLostError)");
    expect(i).toBeGreaterThan(-1);
    /* Jendelanya dipotong di penutup cabangnya sendiri — bukan sejumlah
       karakter, yang akan menjangkau cabang berikutnya dan menguji hal lain. */
    /* Komentar di dalam cabang itu MENYEBUT `failJob` untuk menjelaskan kenapa
       ia tidak dipanggil, jadi yang diperiksa kodenya. */
    const cabang = kode(RUNNER.slice(i, RUNNER.indexOf("\n    }", i)));
    expect(cabang).not.toContain("failJob");
    expect(cabang).toContain("return;");
  });

  it("gagal memperpanjang karena DB tak terjangkau BUKAN berarti lease hilang", () => {
    /* Membedakan "jawabannya tidak" dari "tidak ada jawaban". Menganggap
       keduanya sama akan membatalkan pekerjaan yang masih sah setiap kali
       jaringan tersendat. */
    const i = RUNNER.indexOf("gagal memperpanjang lease");
    expect(i).toBeGreaterThan(-1);
    const sekitar = RUNNER.slice(Math.max(0, i - 400), i + 200);
    expect(sekitar).toContain("catch");
    expect(sekitar).not.toMatch(/leaseHidup = false;[\s\S]{0,80}gagal memperpanjang/);
  });
});

describe("pelari: penghentian yang tertib", () => {
  it("menangani SIGTERM dan SIGINT", () => {
    expect(RUNNER).toContain('process.on("SIGTERM"');
    expect(RUNNER).toContain('process.on("SIGINT"');
  });

  it("berhenti MENGKLAIM, tidak membunuh pekerjaan yang sedang jalan", () => {
    // Sinyalnya hanya mengubah kondisi lingkaran; tidak ada `process.exit`.
    expect(RUNNER).toMatch(/while \(!berhenti\)/);
    expect(kode(RUNNER)).not.toContain("process.exit");
  });
});

describe("pelari: kontrak dan pelari harus sepakat", () => {
  it("`kind` tanpa handler dicatat sebagai galat, bukan diabaikan", () => {
    /* Baris yang diklaim-lalu-dilepas tanpa catatan akan diputar oleh setiap
       pekerja yang lewat, selamanya, tanpa pernah mati. */
    const i = RUNNER.indexOf("const handler = handlers[job.kind]");
    expect(i).toBeGreaterThan(-1);
    const cabang = RUNNER.slice(i, i + 700);
    expect(cabang).toContain("failJob");
    expect(cabang).toMatch(/kontrak dan pelari tidak sepakat/);
  });

  it("jalur tunggal-instans dipagari advisory lock yang lepas sendiri", () => {
    /* Kunci yang disimpan sebagai BARIS akan tertinggal setelah OOM dan
       memblokir pengganti yang sehat; advisory lock lepas saat koneksi mati. */
    expect(RUNNER).toContain("pg_try_advisory_lock");
    expect(RUNNER).toMatch(/singleInstance/);
  });

  it("pagar itu TIDAK memikul kebenaran — `dedupeKey` yang melakukannya", () => {
    expect(RUNNER).toMatch(/TIDAK memikul\s*\n?\s*\*?\s*kebenaran/);
  });
});

describe("jalur `ledger`: pintu posting tetap tunggal (I-2)", () => {
  it("hanya menangani kind milik jalur `ledger`", () => {
    for (const kind of KINDS_BY_LANE.ledger) {
      expect(LEDGER, kind).toContain(`"${kind}"`);
    }
    expect(LEDGER).toMatch(/lane: "ledger"/);
  });

  it("setiap kind jalur `ledger` punya handler", () => {
    // `kind` tanpa handler menumpuk sebagai baris tanpa pengklaim.
    const blok = LEDGER.slice(LEDGER.indexOf("handlers: {"));
    for (const kind of KINDS_BY_LANE.ledger) expect(blok, kind).toContain(`"${kind}"`);
  });

  it("jalur ini tunggal-instans di kontrak", () => {
    expect(JOB_LANES.ledger.singleInstance).toBe(true);
  });

  it("MENDELEGASIKAN ke mesin posting yang ada, tidak mengulang aturannya", () => {
    /* Kalau aturan akuntansi mulai disalin ke sini, dua implementasi akan hidup
       berdampingan — kelas kegagalan yang I-2 ada untuk mencegah. */
    expect(LEDGER).toContain("runRecurringForCompany");
    const k = kode(LEDGER);
    for (const tanda of ["createInvoiceInTx", "journalLine", "postForSource", "$transaction"]) {
      expect(k, `jalur ledger menulis sendiri: ${tanda}`).not.toContain(tanda);
    }
  });

  /*
   * ⚠ Tiga penjaga di bawah menjaga sifat yang PINDAH, bukan sifat yang baru.
   *
   * Sampai tahap 1c langkah "masuk ke konteks perusahaan" ditulis di dalam
   * `workers/ledger.ts`. Tahap 1c menambah jalur kedua yang membutuhkannya
   * persis sama (`interactive`), jadi ia diangkat ke `workers/jalur-perusahaan.ts`
   * — dua salinan akan menyimpang pada aturan multi-perusahaan yang paling
   * mahal bila dilanggar.
   *
   * Yang dijaga karena itu DUA hal sekaligus: bahwa pembantunya memuat
   * sifatnya, DAN bahwa jalur `ledger` memang memakainya. Menjaga yang pertama
   * saja akan meluluskan `ledger.ts` yang diam-diam berhenti memanggilnya.
   */
  it("WAJIB `runWithCompany`, dan konteks yang hilang MELEMPAR", () => {
    /* Jatuh ke basis data bawaan berarti transaksi PT A tertulis ke buku PT B
       tanpa galat dan tanpa jejak (#104). */
    expect(KONTEKS).toContain("runWithCompany");
    expect(KONTEKS).toMatch(/tidak ada di registry kendali[\s\S]{0,200}melempar/);
    expect(LEDGER, "jalur ledger berhenti memakai pembantunya").toContain(
      "dalamKonteksPerusahaan("
    );
  });

  it("`slug`/`databaseName` dibaca dari registry kendali, bukan dari payload", () => {
    // Payload datang dari penerbit dan bisa basi: perusahaan yang slug-nya
    // berubah tidak boleh menentukan ke basis data mana pekerjaan ini menulis.
    expect(KONTEKS).toContain("controlDb.company.findUnique");
    const i = KONTEKS.indexOf("runWithCompany(");
    const pakai = KONTEKS.slice(i, i + 300);
    /* Sejak tahap 4 konteksnya dirakit `companyContextOf` dari baris registry
       — nama basis data DAN instansnya, dua-duanya dari kendali. */
    expect(pakai).toContain("companyContextOf(company)");
    expect(pakai).not.toMatch(/p\.databaseName|payload\.databaseName/);
  });

  it("tanggal posting datang dari PENERBIT, bukan dibaca saat dikerjakan", () => {
    /* Pekerjaan yang diterbitkan tengah malam lalu dikerjakan setelah antrean
       padat tidak boleh memposting dengan tanggal hari berikutnya — selisih
       satu hari pada dokumen berulang adalah selisih PERIODE pembukuan. */
    expect(LEDGER).toMatch(/p\.today/);
    expect(LEDGER).toMatch(/payload tanpa `companyId`/);
  });

  it("perusahaan nonaktif tidak diposting", () => {
    /* Nonaktif berarti "tidak bisa dibuka", dan memposting ke buku yang tidak
       bisa dibuka adalah angka yang tidak akan dilihat siapa pun sampai ia
       dibuka lagi. Jalur `ledger` meneruskan `true`; jalur `interactive` yang
       hanya MEMBACA meneruskan `false`, dan bedanya diuji di
       `tests/jalur-interactive.test.ts`. */
    expect(KONTEKS).toMatch(/tolakNonaktif[\s\S]{0,200}nonaktif/);
    expect(LEDGER).toMatch(/dalamKonteksPerusahaan\(companyId, true,/);
  });
});
