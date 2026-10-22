/**
 * Batas periode IDENTIK di zona proses mana pun.
 *
 * Produksi memasang `TZ=Asia/Jakarta`; server on-premise customer, CI, dan
 * kotak pengembang tidak menjamin itu. Setiap pembantu batas periode di bawah
 * dihitung ulang di beberapa zona proses DALAM satu proses tes (Node membaca
 * ulang `process.env.TZ` begitu ia diubah), lalu dibandingkan dengan instan
 * tertulis — instan yang sama persis dengan yang dihasilkan kode lama di
 * bawah `TZ=Asia/Jakarta`, jadi produksi tidak berubah perilaku.
 *
 * Bentuk simpan yang dipakai di sini sama dengan basis data: kolom
 * `TIMESTAMP(3)` tanpa zona yang ditulis Prisma dalam UTC. Tanggal dari
 * formulir (`new Date("YYYY-MM-DD")`) = 00:00Z; tanggal yang ditulis sistem
 * lewat pembuat lokal di produksi = 00:00 WIB = 17:00Z hari sebelumnya.
 */
import { afterAll, describe, expect, it } from "vitest";

import { businessDate, businessParts } from "@sai/core/business-date";
import { fiscalYearBounds, fiscalYearHasEnded, fiscalYearOf } from "@/lib/year-close";
import { periodBounds, periodOf } from "@/lib/period";
import { monthBounds, previousMonth } from "@/lib/monthly-routine";
import { comparisonDate, comparisonRange } from "@/lib/statement-compare";
import { resolveStockPeriod } from "@/lib/stock-period";
import { monthRange } from "@/lib/dashboard-summary";
import { settlementRateDate } from "@/lib/posting/rates";
import { ageInDays } from "@/lib/receivables";
import { chartPeriodStart, monthKey } from "@/lib/chart-data";

const ZONES = ["Asia/Jakarta", "UTC", "America/New_York", "Asia/Shanghai", "Pacific/Kiritimati"];
const ASAL_TZ = process.env.TZ;
afterAll(() => {
  if (ASAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ASAL_TZ;
});

/** Jalankan `fn` di setiap zona; hasilnya wajib sama di semuanya. */
function sama<T>(fn: () => T): T {
  const hasil = ZONES.map((z) => {
    process.env.TZ = z;
    return { z, v: JSON.parse(JSON.stringify(fn())) as T };
  });
  for (const { z, v } of hasil) expect(v, `zona ${z}`).toEqual(hasil[0].v);
  return hasil[0].v;
}

describe("harness", () => {
  it("benar-benar berganti zona — kalau tidak, setiap `sama` di bawah lulus kosong", () => {
    const lokal = ZONES.map((z) => {
      process.env.TZ = z;
      return new Date(2026, 0, 1).getTime();
    });
    expect(new Set(lokal).size).toBe(ZONES.length);
  });
});

const iso = (r: { start: Date; end: Date }) => [r.start.toISOString(), r.end.toISOString()];
/** Dari formulir: `new Date("YYYY-MM-DD")` = 00:00Z. */
const dariFormulir = (s: string) => new Date(s);
/** Ditulis sistem di produksi lewat pembuat lokal: 00:00 WIB = 17:00Z sehari sebelumnya. */
const dariSistem = (s: string) => new Date(`${s}T00:00:00+07:00`);

describe("fiscalYearBounds — sama di setiap zona proses", () => {
  it("tahun buku kalender: hari pertama 00:00 WIB s.d. hari terakhir 23:59:59.999 WIB", () => {
    for (const awal of [dariFormulir("2020-01-01"), dariSistem("2020-01-01")]) {
      expect(sama(() => iso(fiscalYearBounds(awal, 2026)))).toEqual([
        "2025-12-31T17:00:00.000Z",
        "2026-12-31T16:59:59.999Z",
      ]);
    }
  });

  it("tahun buku mulai pertengahan tahun (1 Juli) berakhir 30 Juni tahun berikutnya", () => {
    for (const awal of [dariFormulir("2021-07-01"), dariSistem("2021-07-01")]) {
      expect(sama(() => iso(fiscalYearBounds(awal, 2026)))).toEqual([
        "2026-06-30T17:00:00.000Z",
        "2027-06-30T16:59:59.999Z",
      ]);
    }
  });

  it("tahun kabisat: tahun buku mulai 1 Maret memuat 29 Februari", () => {
    expect(sama(() => iso(fiscalYearBounds(dariFormulir("2020-03-01"), 2027)))).toEqual([
      "2027-02-28T17:00:00.000Z",
      "2028-02-29T16:59:59.999Z", // 29 Feb 2028 23:59:59.999 WIB
    ]);
    expect(sama(() => iso(fiscalYearBounds(dariFormulir("2020-03-01"), 2028)))).toEqual([
      "2028-02-29T17:00:00.000Z",
      "2029-02-28T16:59:59.999Z",
    ]);
  });

  it("hari pertama dan terakhir tahun buku jatuh di tahun buku itu, bukan tetangganya", () => {
    const awal = dariFormulir("2021-07-01");
    const r = sama(() => ({
      pertamaFormulir: fiscalYearOf(awal, dariFormulir("2026-07-01")),
      pertamaSistem: fiscalYearOf(awal, dariSistem("2026-07-01")),
      terakhirFormulir: fiscalYearOf(awal, dariFormulir("2027-06-30")),
      terakhirSistem: fiscalYearOf(awal, dariSistem("2027-06-30")),
      terakhirLarut: fiscalYearOf(awal, new Date("2027-06-30T23:59:59.999+07:00")),
      sehariSebelum: fiscalYearOf(awal, new Date("2026-06-30T23:59:59.999+07:00")),
    }));
    expect(r).toEqual({
      pertamaFormulir: 2026,
      pertamaSistem: 2026,
      terakhirFormulir: 2026,
      terakhirSistem: 2026,
      terakhirLarut: 2026,
      sehariSebelum: 2025,
    });
  });

  it("tahun buku berakhir tepat sesudah 23:59:59.999 WIB hari terakhirnya", () => {
    const awal = dariFormulir("2020-01-01");
    expect(
      sama(() => [
        fiscalYearHasEnded(awal, 2026, new Date("2026-12-31T23:59:59.999+07:00")),
        fiscalYearHasEnded(awal, 2026, new Date("2027-01-01T00:00:00.000+07:00")),
      ])
    ).toEqual([false, true]);
  });
});

describe("periode bulanan — sama di setiap zona proses", () => {
  it("periodBounds / monthBounds: Februari kabisat dan Desember", () => {
    expect(sama(() => iso(periodBounds(2028, 2)))).toEqual([
      "2028-01-31T17:00:00.000Z",
      "2028-02-29T16:59:59.999Z",
    ]);
    expect(sama(() => iso(monthBounds(2026, 12)))).toEqual([
      "2026-11-30T17:00:00.000Z",
      "2026-12-31T16:59:59.999Z",
    ]);
  });

  it("periodOf membaca bulan Jakarta untuk kedua bentuk simpan", () => {
    expect(
      sama(() => [
        periodOf(dariFormulir("2026-03-01")),
        periodOf(dariSistem("2026-03-01")),
        periodOf(dariFormulir("2026-02-28")),
        periodOf(new Date("2026-02-28T23:59:59.999+07:00")),
      ])
    ).toEqual([
      { year: 2026, month: 3 },
      { year: 2026, month: 3 },
      { year: 2026, month: 2 },
      { year: 2026, month: 2 },
    ]);
  });

  it("bulan lalu dihitung dari tanggal Jakarta (01.00 WIB tanggal 1 sudah bulan baru)", () => {
    expect(sama(() => previousMonth(new Date("2026-01-01T01:00:00+07:00")))).toEqual({
      year: 2025,
      month: 12,
    });
  });

  it("bulan berjalan beranda dan grafik", () => {
    const now = new Date("2026-03-01T01:00:00+07:00");
    expect(
      sama(() => {
        const m = monthRange(now);
        return [m.fromISO, m.toISO, m.from.toISOString(), m.to.toISOString()];
      })
    ).toEqual(["2026-03-01", "2026-03-31", "2026-02-28T17:00:00.000Z", "2026-03-31T16:59:59.999Z"]);
    expect(sama(() => chartPeriodStart(now).toISOString())).toBe("2025-09-30T17:00:00.000Z");
    expect(sama(() => monthKey(dariSistem("2026-03-01")))).toBe("2026-03");
  });
});

describe("pembantu lain — sama di setiap zona proses", () => {
  it("rentang pembanding tahun lalu menjaga jam dinding WIB", () => {
    const from = businessDate(2028, 1, 1);
    const to = businessDate(2028, 1, 29, 23, 59, 59, 999);
    expect(
      sama(() => {
        const r = comparisonRange(from, to, "previous_year");
        return [r.from.toISOString(), r.to.toISOString()];
      })
    ).toEqual([
      "2027-01-31T17:00:00.000Z",
      "2027-03-01T16:59:59.999Z", // 29 Feb menggulung ke 1 Maret, seperti pembuat Date
    ]);
    const asOf = businessDate(2026, 11, 31, 23, 59, 59, 999);
    expect(sama(() => comparisonDate(asOf, "previous_year").toISOString())).toBe(
      "2025-12-31T16:59:59.999Z"
    );
  });

  it("periode stok: pekan ISO, bulan, dan tahun", () => {
    expect(
      sama(() => {
        const w = resolveStockPeriod("week", "2027-01-01");
        const y = resolveStockPeriod("year", "2028-02-29");
        return [w.fromISO, w.toISO, w.weekNumber, w.from.toISOString(), y.fromISO, y.toISO, y.year];
      })
    ).toEqual(["2026-12-28", "2027-01-03", 53, "2026-12-27T17:00:00.000Z", "2028-01-01", "2028-12-31", 2028]);
  });

  it("tanggal kurs penyelesaian = hari Jakarta pada 00:00 UTC (bentuk kolom DATE)", () => {
    expect(
      sama(() => [
        settlementRateDate(dariFormulir("2026-07-20")).toISOString(),
        settlementRateDate(dariSistem("2026-07-20")).toISOString(),
      ])
    ).toEqual(["2026-07-20T00:00:00.000Z", "2026-07-20T00:00:00.000Z"]);
  });

  it("umur piutang dihitung dalam hari kalender Jakarta", () => {
    expect(sama(() => ageInDays(dariSistem("2026-07-01"), new Date("2026-07-31T23:00:00+07:00")))).toBe(30);
  });

  it("businessParts / businessDate saling membalik", () => {
    expect(sama(() => businessParts(businessDate(2028, 1, 29, 23, 59)))).toEqual({
      year: 2028,
      month: 1,
      day: 29,
      weekday: 2,
    });
  });
});
