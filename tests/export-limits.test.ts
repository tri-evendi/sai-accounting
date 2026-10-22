/**
 * PENJAGA — batas ekspor & periode laporan (03 §4).
 *
 * Yang dijaga di sini bukan "ada batasnya", melainkan DI MANA batas itu berdiri.
 * Tiga kesalahan penempatan sudah pernah membuat batas semacam ini tidak
 * membatasi apa pun, dan ketiganya lulus pembacaan sambil lalu:
 *
 *   • batas sesudah `request.json()` — badan permintaan sudah dimaterialkan
 *     dan diurai, jadi prosesnya mati sebelum validator pertama dibaca;
 *   • batas yang hanya memeriksa `content-length` — header itu tidak ada pada
 *     permintaan ber-*chunked encoding*, dan pada yang lain ia cuma pernyataan
 *     pengirim;
 *   • batas periode di satu dari dua pembaca periode — `?g=custom` adalah
 *     pintu samping ke rentang yang sama.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXPORT_MAX_BODY_BYTES,
  EXPORT_MAX_COLUMNS,
  EXPORT_MAX_ROWS,
  REPORT_MAX_PERIOD_DAYS,
  clampPeriodStart,
  periodSpanDays,
} from "@sai/core/export-limits";
import { readBoundedText } from "@/lib/request-body";
import { resolvePeriod, resolveAsOf } from "@/lib/report-catalog";

const akar = process.cwd();
const baca = (...p: string[]) => readFileSync(join(akar, ...p), "utf8");

const kode = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

const RUTE = kode(baca("src", "app", "api", "reports", "export", "route.ts"));
const SKEMA = kode(baca("src", "lib", "validations", "report-export.ts"));
const STOK = kode(baca("src", "lib", "stock-period.ts"));
const KATALOG = kode(baca("src", "lib", "report-catalog.ts"));

describe("rentang periode: aritmetika kalender, bukan jam lokal", () => {
  it("hari kalender dihitung INKLUSIF", () => {
    expect(periodSpanDays("2026-01-01", "2026-01-01")).toBe(1);
    expect(periodSpanDays("2026-01-01", "2026-01-31")).toBe(31);
  });

  it("tahun kabisat terhitung penuh", () => {
    expect(periodSpanDays("2024-01-01", "2024-12-31")).toBe(366);
    expect(periodSpanDays("2025-01-01", "2025-12-31")).toBe(365);
  });

  it("melewati batas DST tetap utuh", () => {
    // 29 Maret 2026, hari pergantian waktu musim panas di Eropa. Aritmetika
    // pada tengah malam LOKAL akan kehilangan satu jam di sini, dan
    // pembulatannya sudah cukup untuk memotong satu hari dari rentang panjang.
    expect(periodSpanDays("2026-03-28", "2026-03-30")).toBe(3);
    expect(periodSpanDays("2026-01-01", "2026-12-31")).toBe(365);
  });

  it("tanggal tak terurai → NaN, bukan angka karangan", () => {
    expect(Number.isNaN(periodSpanDays("bukan-tanggal", "2026-01-01"))).toBe(true);
  });
});

describe("clampPeriodStart: memendekkan AWAL, tidak pernah akhirnya", () => {
  it("rentang yang sudah muat dibiarkan apa adanya", () => {
    expect(clampPeriodStart("2026-01-01", "2026-12-31")).toBe("2026-01-01");
  });

  it("rentang keterlaluan dipendekkan tepat ke batasnya", () => {
    const dipendekkan = clampPeriodStart("1900-01-01", "2026-10-20");
    expect(periodSpanDays(dipendekkan, "2026-10-20")).toBe(REPORT_MAX_PERIOD_DAYS);
  });

  it("retensi sepuluh tahun TIDAK ikut terpotong", () => {
    // Angka batasnya diturunkan dari retensi wajib pembukuan, jadi laporan
    // sepanjang retensi itu harus lolos utuh — bila tidak, batas ini menolak
    // laporan yang justru wajib bisa dijawab oleh bukunya.
    expect(clampPeriodStart("2016-10-21", "2026-10-20")).toBe("2016-10-21");
    expect(periodSpanDays("2016-10-21", "2026-10-20")).toBeLessThanOrEqual(
      REPORT_MAX_PERIOD_DAYS
    );
  });
});

describe("resolvePeriod: perilaku lama utuh, tiga lubang tertutup", () => {
  const kini = new Date("2026-10-20T12:00:00+07:00"); // 20 Okt 2026, jam Jakarta

  it("tanpa parameter tetap tahun-berjalan, persis seperti sebelumnya", () => {
    const p = resolvePeriod(undefined, undefined, kini);
    expect(p.fromISO).toBe("2026-01-01");
    expect(p.toISO).toBe("2026-10-20");
  });

  it("periode sah diteruskan apa adanya", () => {
    const p = resolvePeriod("2026-03-01", "2026-03-31", kini);
    expect([p.fromISO, p.toISO]).toEqual(["2026-03-01", "2026-03-31"]);
  });

  it("tanggal ngawur jatuh ke bawaan", () => {
    expect(resolvePeriod("2026-02-30", undefined, kini).fromISO).toBe("2026-01-01");
    expect(resolvePeriod(undefined, "sampah", kini).toISO).toBe("2026-10-20");
  });

  it("rentang terbalik DITUKAR, bukan dibiarkan kosong", () => {
    const p = resolvePeriod("2026-09-01", "2026-03-01", kini);
    expect([p.fromISO, p.toISO]).toEqual(["2026-03-01", "2026-09-01"]);
    expect(p.from.getTime()).toBeLessThan(p.to.getTime());
  });

  it("`?to=` sendirian di tahun lain tidak melahirkan rentang terbalik", () => {
    const p = resolvePeriod(undefined, "2025-05-01", kini);
    expect([p.fromISO, p.toISO]).toEqual(["2025-01-01", "2025-05-01"]);
  });

  it("rentang keterlaluan dipendekkan, dan AKHIRNYA dipertahankan", () => {
    const p = resolvePeriod("1900-01-01", "2026-10-20", kini);
    expect(p.toISO).toBe("2026-10-20");
    expect(periodSpanDays(p.fromISO, p.toISO)).toBe(REPORT_MAX_PERIOD_DAYS);
  });

  it("`from`/`to` yang dipulangkan SELALU terurut", () => {
    const kasus: [string | undefined, string | undefined][] = [
      [undefined, undefined],
      ["2026-09-01", "2026-03-01"],
      ["1900-01-01", "2026-10-20"],
      [undefined, "2025-05-01"],
      ["2026-02-30", "2026-01-15"],
      ["2027-01-01", "2026-01-01"],
    ];
    for (const [a, b] of kasus) {
      const p = resolvePeriod(a, b, kini);
      expect(p.fromISO <= p.toISO).toBe(true);
      expect(p.from.getTime()).toBeLessThanOrEqual(p.to.getTime());
    }
  });

  it("resolveAsOf tetap jatuh ke hari ini, dan itu yang diberitahukan penyaring", () => {
    expect(resolveAsOf("2026-02-30", kini).asOfISO).toBe("2026-10-20");
    expect(resolveAsOf("2026-05-01", kini).asOfISO).toBe("2026-05-01");
  });
});

describe("batas periode berdiri di KEDUA pembaca periode", () => {
  it("`resolvePeriod` memanggil clampPeriodStart", () => {
    expect(KATALOG).toContain("clampPeriodStart(");
  });

  it("`resolveStockPeriod` (`g=custom`) juga — pintu sampingnya tertutup", () => {
    expect(STOK).toContain("clampPeriodStart(");
  });
});

describe("readBoundedText: dua lapis, dan lapis pertama saja tidak cukup", () => {
  const badan = (teks: string, header?: string) =>
    new Request("https://contoh.test/x", {
      method: "POST",
      headers: header === undefined ? {} : { "content-length": header },
      body: teks,
    });

  it("badan di bawah batas dibaca utuh", async () => {
    const r = await readBoundedText(badan('{"a":1}'), 1024);
    expect(r).toEqual({ ok: true, text: '{"a":1}' });
  });

  it("`content-length` yang jelas kebesaran ditolak tanpa membaca", async () => {
    const r = await readBoundedText(badan("xxxx", "999999"), 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.declared).toBe(true);
  });

  it("header yang BOHONG tetap tertangkap oleh hitungan byte", async () => {
    // Header menyatakan muat; isinya tidak. Tanpa lapis kedua, inilah jalan
    // masuknya — dan ia tidak butuh alat apa pun selain satu header.
    const r = await readBoundedText(badan("0123456789abcdef", "4"), 8);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.declared).toBe(false);
  });

  it("tanpa `content-length` sama sekali, byte-nya tetap dihitung", async () => {
    const r = await readBoundedText(badan("0123456789"), 4);
    expect(r.ok).toBe(false);
  });

  it("menghitung BYTE, bukan karakter", async () => {
    // "é" dua byte, "漢" tiga. Batas yang menghitung `length` string akan
    // meloloskan badan tiga kali lebih besar daripada yang diizinkannya.
    const r = await readBoundedText(badan("漢漢漢"), 8);
    expect(r.ok).toBe(false);
    const s = await readBoundedText(badan("漢漢漢"), 9);
    expect(s).toEqual({ ok: true, text: "漢漢漢" });
  });

  it("tanpa badan sama sekali → teks kosong, bukan galat", async () => {
    const r = await readBoundedText(new Request("https://contoh.test/x"), 10);
    expect(r).toEqual({ ok: true, text: "" });
  });
});

describe("rute ekspor: batas ada SEBELUM urai, dan dihitung pada lembarnya", () => {
  it("badan dibaca lewat pembaca berbatas, bukan `request.json()`", () => {
    expect(RUTE).toContain("readBoundedText(request, EXPORT_MAX_BODY_BYTES)");
    expect(RUTE).not.toContain("await request.json()");
  });

  it("baris dihitung pada `SheetModel`, bukan pada muatannya", () => {
    // Penghitung per-jenis-laporan akan melewatkan laporan kedua belas yang
    // ditambahkan orang lain; `sheet.rows` dilewati semua laporan.
    expect(RUTE).toContain("sheet.rows.length > EXPORT_MAX_ROWS");
  });

  it("keduanya menjawab 413, bukan 400", () => {
    const limaBelas = RUTE.match(/status: 413/g) ?? [];
    expect(limaBelas.length).toBe(2);
  });

  it("pemeriksaan baris berdiri SEBELUM buku kerja dirakit", () => {
    expect(RUTE.indexOf("EXPORT_MAX_ROWS")).toBeLessThan(RUTE.indexOf("buildWorkbookBuffer(["));
  });
});

describe("skema muatan: tidak ada array tak berbatas di batas kepercayaan", () => {
  it("setiap `z.array(` yang tersisa memang berbatas", () => {
    const telanjang = SKEMA.split("\n").filter(
      (l) => l.includes("z.array(") && !l.includes(".max(")
    );
    expect(telanjang).toEqual([]);
  });

  it("array baris memakai pembantu bersama, bukan `.max()` yang disalin", () => {
    expect(SKEMA).toContain("z.array(item).max(EXPORT_MAX_ROWS)");
    expect(SKEMA.match(/\brows\(/g)?.length ?? 0).toBeGreaterThanOrEqual(10);
  });

  it("pilihan kolom punya batasnya sendiri", () => {
    expect(SKEMA).toContain("max(EXPORT_MAX_COLUMNS)");
  });
});

describe("kedua batas kapasitas konsisten satu sama lain", () => {
  /*
   * Invarian yang ditulis di `export-limits.ts` dan mudah rusak tanpa suara:
   * batas byte yang lebih ketat daripada yang dibutuhkan batas baris membuat
   * batas baris tak pernah tercapai — dan pengguna menerima galat yang menyebut
   * sebab yang salah ("terlalu banyak baris" padahal yang ditolak byte-nya).
   */
  const BYTE_PER_BARIS_TERLEBAR = 240;

  it("batas byte memuat batas baris pada baris laporan terlebar", () => {
    expect(EXPORT_MAX_BODY_BYTES).toBeGreaterThan(EXPORT_MAX_ROWS * BYTE_PER_BARIS_TERLEBAR);
  });

  it("batas baris tetap diperlukan: batas byte sendiri jauh lebih longgar", () => {
    const BYTE_PER_BARIS_TERMURAH = 40;
    expect(EXPORT_MAX_BODY_BYTES / BYTE_PER_BARIS_TERMURAH).toBeGreaterThan(EXPORT_MAX_ROWS);
  });

  it("batas baris tinggal di bawah batas Excel sendiri", () => {
    expect(EXPORT_MAX_ROWS).toBeLessThan(1_048_576);
  });

  it("batas kolom jauh di atas laporan terlebar, tapi tetap berbatas", () => {
    expect(EXPORT_MAX_COLUMNS).toBeGreaterThan(12);
    expect(EXPORT_MAX_COLUMNS).toBeLessThan(1_000);
  });
});

describe("kalimatnya ada di ketiga kamus", () => {
  const kunci = ["exportTooLarge", "exportPayloadTooLarge", "periodAdjusted", "asOfAdjusted"];
  for (const lokal of ["id", "en", "zh"]) {
    it(`${lokal} memuat keempat kunci`, () => {
      const kamus = JSON.parse(
        baca("packages", "core", "src", "i18n", "dictionaries", `${lokal}.json`)
      ) as { reports: Record<string, string> };
      for (const k of kunci) expect(kamus.reports[k]).toBeTypeOf("string");
    });
  }

  it("pemberitahuan periode menyebut periode yang DIPAKAI", () => {
    const kamus = JSON.parse(
      baca("packages", "core", "src", "i18n", "dictionaries", "id.json")
    ) as { reports: Record<string, string> };
    expect(kamus.reports.periodAdjusted).toContain("{from}");
    expect(kamus.reports.periodAdjusted).toContain("{to}");
    expect(kamus.reports.asOfAdjusted).toContain("{date}");
  });
});
