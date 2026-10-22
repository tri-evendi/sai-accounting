/**
 * PERBAIKAN DATA WARISAN KONTRAK — aturan murninya (keputusan pemilik 23 Okt 2026).
 *
 * Data SINTETIS saja. Yang dijaga di sini adalah setiap aturan yang akan
 * mengubah angka di buku produksi: kode warisan mana yang menjadi `signed`,
 * kurs mana yang dipilih untuk pembayaran (hari-sama tertimbang → terdekat
 * ≤ 7 hari dengan seri ke tanggal lebih awal → BI), baris konversi mana yang
 * tidak boleh menjadi acuan, kurs BI pada hari libur, dan rumus nilai IDR —
 * yang WAJIB sama dengan jalur tulis aplikasi.
 */
import { describe, expect, it } from "vitest";
import {
  BI_MAX_LOOKBACK_DAYS,
  CONVERSION_CORRECTIONS,
  EXCLUDED_CONVERSION_IDS,
  NO_MATCH,
  biMiddleRate,
  checkConversionCorrection,
  conversionRateFor,
  dayDiff,
  isoDay,
  legacyContractKey,
  legacyStatusIndex,
  parseBiRatesCsv,
  planContractRates,
  planCurrencyRelabel,
  planPaymentRates,
  planStatusFix,
  rateOutliers,
  roundRate,
  weightedRate,
  type ConversionRef,
  type PaymentRow,
} from "@/lib/legacy-contract-fix";
import { contractFx } from "@/lib/validations/contract";
import { fxAmounts } from "@/lib/validations/fx";

const ref = (id: number, date: string, rate: number, amount = 1000, cur = "USD"): ConversionRef => ({
  id,
  date,
  fromCurrency: cur,
  toCurrency: "IDR",
  amount,
  rate,
});

describe("status warisan: hanya `pending` berkode PERSIS 2 → signed", () => {
  const dump = [
    // kontrak A: dua baris barang; kepala = baris pertama yang punya buyer
    { no_contract: "A/001", buyer: "", status: "0" },
    { no_contract: "A/001", buyer: "PT X", status: "2" },
    { no_contract: "B/002", buyer: "PT Y", status: "0" },
    { no_contract: "C/003", buyer: "PT Z", status: "1" },
    { no_contract: "D/004", buyer: "PT Z", status: "-1" },
    { no_contract: " e/005 ", buyer: "PT Z", status: " 2 " },
    { no_contract: "F/006", buyer: "PT Z", status: "20" },
    // dua nomor warisan yang menjadi SATU kunci — tak satu pun dipakai
    { no_contract: "G/007", buyer: "PT Z", status: "2" },
    { no_contract: "g/007", buyer: "PT Z", status: "2" },
    { no_contract: "", buyer: "tanpa nomor", status: "2" },
  ];
  const index = legacyStatusIndex(dump);

  it("kode dibaca dari baris KEPALA, seperti pengimpor lama", () => {
    expect(index.codes.get(legacyContractKey("A/001"))).toBe("2");
    expect(index.mixed).toContain("A/001");
  });

  it("kunci: trim, rapatkan spasi, huruf besar, 50 karakter seperti pengimpor", () => {
    expect(legacyContractKey("  e/005 ")).toBe("E/005");
    expect(legacyContractKey("a  b\nc")).toBe("A B C");
    expect(legacyContractKey("x".repeat(60))).toHaveLength(50);
    expect(index.codes.get("E/005")).toBe("2");
  });

  it("kunci ambigu tidak pernah dipakai", () => {
    expect(index.ambiguous.has("G/007")).toBe(true);
    expect(index.codes.has("G/007")).toBe(false);
  });

  it("rencana: 2→signed; 0, 20, tanpa padanan, dan non-pending tidak disentuh", () => {
    const plan = planStatusFix(
      [
        { id: 1, contractNo: "A/001", status: "pending" },
        { id: 2, contractNo: "B/002", status: "pending" },
        { id: 3, contractNo: "C/003", status: "completed" },
        { id: 4, contractNo: "D/004", status: "canceled" },
        { id: 5, contractNo: "E/005", status: "pending" },
        { id: 6, contractNo: "F/006", status: "pending" },
        { id: 7, contractNo: "G/007", status: "pending" },
        { id: 8, contractNo: "BARU/2026", status: "pending" },
        { id: 9, contractNo: "A/001-x", status: "completed" },
      ],
      index
    );
    expect(plan.toSigned.map((c) => c.id)).toEqual([1, 5]);
    expect(plan.pendingByCode.get("0")).toBe(1);
    expect(plan.pendingByCode.get("20")).toBe(1);
    expect(plan.pendingByCode.get(NO_MATCH)).toBe(2);
    expect(plan.unmatchedPending).toEqual(["G/007", "BARU/2026"]);
    expect(plan.unmatchedByStatus.get("completed")).toBe(1);
  });

  it("idempoten: sesudah diterapkan, rencana yang sama kosong", () => {
    const plan = planStatusFix([{ id: 1, contractNo: "A/001", status: "signed" }], index);
    expect(plan.toSigned).toEqual([]);
  });
});

describe("koreksi baris konversi #25 dan #325", () => {
  const [c25, c325] = CONVERSION_CORRECTIONS;
  const row = (over: Partial<Parameters<typeof checkConversionCorrection>[0] & object>) => ({
    id: 25,
    date: "2019-10-17",
    fromCurrency: "USD",
    toCurrency: "IDR",
    amount: 190000,
    rate: 1963,
    result: 2690970000,
    ...over,
  });

  it("nilainya persis keputusan pemilik dan konsisten dengan dirinya", () => {
    expect(c25).toMatchObject({ id: 25, after: { rate: 14163, result: 2690970000 } });
    expect(190000 * 14163).toBe(2690970000);
    expect(c325).toMatchObject({ id: 325, before: { rate: 22460, result: 350376000 }, after: { rate: 2246, result: 35037600 } });
    expect(15600 * 2246).toBe(35037600);
  });

  it("nilai lama cocok → apply; sudah dikoreksi → already_applied; lainnya → mismatch", () => {
    expect(checkConversionCorrection(row({}), c25)).toBe("apply");
    expect(checkConversionCorrection(row({ rate: 14163 }), c25)).toBe("already_applied");
    expect(checkConversionCorrection(row({ rate: 1964 }), c25)).toBe("mismatch");
    expect(checkConversionCorrection(row({ result: 1 }), c25)).toBe("mismatch");
    expect(checkConversionCorrection(row({ amount: 1 }), c25)).toBe("mismatch");
    expect(checkConversionCorrection(row({ date: "2019-10-18" }), c25)).toBe("mismatch");
    expect(checkConversionCorrection(null, c25)).toBe("missing");
  });

  it("#65 (kurs 0) dikecualikan sebagai acuan; kurs ≤ 0 juga, apa pun id-nya", () => {
    expect(EXCLUDED_CONVERSION_IDS.has(65)).toBe(true);
    const refs = [ref(65, "2019-09-12", 14000), ref(66, "2019-09-12", 0), ref(67, "2019-09-12", -5)];
    expect(conversionRateFor(refs, "USD", "2019-09-12")).toBeNull();
  });
});

describe("kurs pembayaran dari konversi SAI", () => {
  it("hari-sama: rata-rata TERTIMBANG nominal", () => {
    const refs = [ref(1, "2020-01-10", 14000, 3000), ref(2, "2020-01-10", 14100, 1000), ref(3, "2020-01-11", 99999)];
    const c = conversionRateFor(refs, "USD", "2020-01-10")!;
    expect(c.source).toBe("same_day");
    expect(c.rate).toBe(14025); // (3000×14000 + 1000×14100) / 4000
    expect(c.refIds).toEqual([1, 2]);
  });

  it("mata uang lain dan arah lain tidak dihitung", () => {
    const refs = [ref(1, "2020-01-10", 2000, 1000, "CNY"), { ...ref(2, "2020-01-10", 14000), toCurrency: "USD" }];
    expect(conversionRateFor(refs, "USD", "2020-01-10")).toBeNull();
    expect(conversionRateFor(refs, "CNY", "2020-01-10")!.rate).toBe(2000);
  });

  it("terdekat ≤ 7 hari; seri sebelum/sesudah → tanggal LEBIH AWAL", () => {
    const refs = [ref(1, "2020-01-07", 14000), ref(2, "2020-01-13", 14200), ref(3, "2020-01-20", 1)];
    const c = conversionRateFor(refs, "USD", "2020-01-10")!;
    expect(c).toMatchObject({ source: "nearest_7d", refDate: "2020-01-07", rate: 14000, refIds: [1] });
  });

  it("yang lebih dekat menang, ke arah mana pun", () => {
    const refs = [ref(1, "2020-01-05", 14000), ref(2, "2020-01-12", 14200)];
    expect(conversionRateFor(refs, "USD", "2020-01-10")!.refDate).toBe("2020-01-12");
  });

  it("beberapa konversi di hari terdekat → rata-rata tertimbang hari itu", () => {
    const refs = [ref(1, "2020-01-12", 14000, 1000), ref(2, "2020-01-12", 14300, 2000)];
    expect(conversionRateFor(refs, "USD", "2020-01-10")!.rate).toBe(14200);
  });

  it("tepat 7 hari masih masuk; 8 hari tidak", () => {
    expect(conversionRateFor([ref(1, "2020-01-17", 1)], "USD", "2020-01-10")!.refDate).toBe("2020-01-17");
    expect(conversionRateFor([ref(1, "2020-01-18", 1)], "USD", "2020-01-10")).toBeNull();
  });

  it("acuan yang dikecualikan dilompati, acuan berikutnya dipakai", () => {
    const refs = [ref(65, "2020-01-10", 14000), ref(70, "2020-01-11", 14050)];
    expect(conversionRateFor(refs, "USD", "2020-01-10")).toMatchObject({ source: "nearest_7d", rate: 14050 });
  });

  it("nominal nol di semua baris → rata-rata biasa, bukan bagi-nol", () => {
    expect(weightedRate([ref(1, "2020-01-10", 100, 0), ref(2, "2020-01-10", 200, 0)])).toBe(150);
  });

  it("kurs dibulatkan 6 desimal (Decimal(18,6)) sebelum dipakai", () => {
    expect(roundRate(1 / 3)).toBe(0.333333);
    expect(weightedRate([ref(1, "d", 1, 1), ref(2, "d", 2, 2)])).toBe(1.666667);
  });
});

describe("kurs tengah BI", () => {
  const csv = [
    "date,currency,buy,sell",
    "2020-01-02,USD,13900,14040",
    "2020-01-03,USD,13800,13940",
    "2020-01-06,USD,13850,13990",
    "2020-01-03,CNY,1990,2010",
  ].join("\n");
  const bi = parseBiRatesCsv(csv);

  it("tengah = (beli + jual) / 2", () => {
    expect(biMiddleRate(bi, "USD", "2020-01-02")).toEqual({ rate: 13970, refDate: "2020-01-02" });
    expect(biMiddleRate(bi, "CNY", "2020-01-03")!.rate).toBe(2000);
  });

  it("akhir pekan/libur → kurs terbit TERAKHIR sebelumnya", () => {
    expect(biMiddleRate(bi, "USD", "2020-01-04")).toEqual({ rate: 13870, refDate: "2020-01-03" });
    expect(biMiddleRate(bi, "USD", "2020-01-05")!.refDate).toBe("2020-01-03");
  });

  it("sebelum awal berkas, sesudah akhir berkas, atau lubang > batas → null (bukan tebakan)", () => {
    expect(biMiddleRate(bi, "USD", "2020-01-01")).toBeNull();
    expect(biMiddleRate(bi, "USD", "2020-01-07")).toBeNull();
    const jarang = parseBiRatesCsv("date,currency,middle\n2020-01-01,USD,14000\n2020-03-01,USD,14100");
    expect(biMiddleRate(jarang, "USD", `2020-01-${String(1 + BI_MAX_LOOKBACK_DAYS).padStart(2, "0")}`)!.rate).toBe(14000);
    expect(biMiddleRate(jarang, "USD", `2020-01-${String(2 + BI_MAX_LOOKBACK_DAYS).padStart(2, "0")}`)).toBeNull();
    expect(biMiddleRate(bi, "JPY", "2020-01-03")).toBeNull();
  });

  it("CSV: bentuk `middle` diterima; kepala salah, tanggal salah, kurs ≤ 0, dan dua kurs berbeda untuk satu hari ditolak", () => {
    expect(biMiddleRate(parseBiRatesCsv("date,currency,middle\n2020-01-02,usd,14000"), "USD", "2020-01-02")!.rate).toBe(14000);
    expect(() => parseBiRatesCsv("tanggal,kurs\n2020-01-02,1")).toThrow(/Kepala/);
    expect(() => parseBiRatesCsv("date,currency,middle\n02/01/2020,USD,1")).toThrow(/YYYY-MM-DD/);
    expect(() => parseBiRatesCsv("date,currency,middle\n2020-01-02,USD,0")).toThrow(/tidak positif/);
    expect(() => parseBiRatesCsv("date,currency,middle\n2020-01-02,USD,1\n2020-01-02,USD,2")).toThrow(/dua kali/);
    // Baris ganda yang SAMA tidak apa-apa (tumpang-tindih unduhan per tahun).
    expect(() => parseBiRatesCsv("date,currency,middle\n2020-01-02,USD,1\n2020-01-02,USD,1")).not.toThrow();
  });

  it("berkas yang ikut repo terbaca dan mencakup 2019-05 s.d. 2025-12 untuk USD & CNY", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const repo = parseBiRatesCsv(
      readFileSync(join(process.cwd(), "scripts/data/bi-rates/kurs-transaksi-bi.csv"), "utf8")
    );
    for (const cur of ["USD", "CNY"]) {
      const t = repo.get(cur)!;
      expect(t.days[0] <= "2019-05-01").toBe(true);
      expect(t.days[t.days.length - 1] >= "2025-12-31").toBe(true);
      // Tidak ada lubang yang melampaui batas mundur.
      for (let i = 1; i < t.days.length; i++) {
        expect(dayDiff(t.days[i - 1], t.days[i])).toBeLessThanOrEqual(BI_MAX_LOOKBACK_DAYS);
      }
    }
  });
});

describe("rencana kurs pembayaran", () => {
  const bi = parseBiRatesCsv("date,currency,middle\n2020-01-01,USD,15000\n2020-01-30,USD,15000\n2020-02-01,USD,15000\n2020-01-01,CNY,2100\n2020-02-01,CNY,2100");
  const pay = (over: Partial<PaymentRow>): PaymentRow => ({
    id: 1,
    contractId: 1,
    date: "2020-01-10",
    amount: 1000.5,
    currency: "USD",
    contractCurrency: "USD",
    hasLiveJournal: false,
    ...over,
  });

  it("hari-sama → ≤7 hari → BI, dan nilai IDR = fxAmounts aplikasi", () => {
    const refs = [ref(1, "2020-01-10", 14000), ref(2, "2020-01-20", 14500)];
    const plan = planPaymentRates(
      [pay({ id: 1 }), pay({ id: 2, date: "2020-01-15" }), pay({ id: 3, date: "2020-01-31" })],
      refs,
      bi
    );
    expect(plan.fills.map((f) => [f.id, f.source, f.rate])).toEqual([
      [1, "same_day", 14000],
      [2, "nearest_7d", 14000], // 10 dan 20 sama-sama 5 hari → lebih awal
      [3, "bi", 15000],
    ]);
    for (const f of plan.fills) expect(f.baseAmount).toBe(fxAmounts("USD", 1000.5, f.rate).baseAmount);
    expect(plan.fills[0].baseAmount).toBe(14007000);
  });

  it("label ≠ mata uang kontrak, mata uang asing, dan baris berjurnal TIDAK diisi", () => {
    const plan = planPaymentRates(
      [
        pay({ id: 1, contractCurrency: "CNY" }),
        pay({ id: 2, currency: "LC", contractCurrency: "LC" }),
        pay({ id: 3, hasLiveJournal: true }),
      ],
      [],
      bi
    );
    expect(plan.fills).toEqual([]);
    expect(plan.unfillable.map((u) => u.id)).toEqual([1, 2, 3]);
    expect(plan.unfillable[0].reason).toMatch(/USD ≠ .*CNY/);
  });

  it("tanpa acuan dan tanpa BI → tak diisi, tanggalnya didaftar sebagai kurs BI yang hilang", () => {
    const plan = planPaymentRates([pay({ date: "2030-01-01" })], [], bi);
    expect(plan.fills).toEqual([]);
    expect(plan.missingBi).toEqual([{ currency: "USD", date: "2030-01-01" }]);
  });

  it("relabel: hanya label bawaan pengimpor (USD) atas kontrak valas lain yang dikenal", () => {
    expect(
      planCurrencyRelabel([
        pay({ id: 1, contractCurrency: "CNY" }),
        pay({ id: 2, contractCurrency: "LC" }),
        pay({ id: 3, contractCurrency: "IDR" }),
        pay({ id: 4 }),
        pay({ id: 5, currency: "CNY", contractCurrency: "USD" }),
        pay({ id: 6, contractCurrency: "CNY", hasLiveJournal: true }),
      ])
    ).toEqual([{ id: 1, from: "USD", to: "CNY" }]);
  });

  it("penyimpangan > 15% dari BI dilaporkan sebagai peringatan", () => {
    const plan = planPaymentRates([pay({})], [ref(1, "2020-01-10", 1963)], bi);
    expect(rateOutliers(plan.fills, bi)).toHaveLength(1);
    const ok = planPaymentRates([pay({})], [ref(1, "2020-01-10", 14500)], bi);
    expect(rateOutliers(ok.fills, bi)).toHaveLength(0);
  });
});

describe("rencana kurs kontrak", () => {
  const bi = parseBiRatesCsv("date,currency,buy,sell\n2020-01-03,CNY,1990,2010\n2020-01-06,CNY,2000,2020");
  const items = [
    { bags: 100, kgPerBag: 25, pricePerKg: 3.15 },
    { bags: 3, kgPerBag: 12.5, pricePerKg: 7 },
  ];

  it("kurs tengah BI di tanggal kontrak (libur → hari kerja sebelumnya); base = contractFx", () => {
    const plan = planContractRates(
      [{ id: 1, contractNo: "K1", date: "2020-01-05", currency: "CNY", items, hasLiveJournal: false }],
      bi
    );
    expect(plan.fills[0]).toMatchObject({ id: 1, rate: 2000, source: "bi", refDate: "2020-01-03" });
    expect(plan.fills[0].baseAmount).toBe(contractFx("CNY", items, 2000).baseAmount);
    // subtotal = round2(7875 + 262.5) = 8137.5 → × 2000
    expect(plan.fills[0].baseAmount).toBe(16275000);
  });

  it("mata uang `LC` dan kontrak berjurnal dilaporkan, tidak diisi", () => {
    const plan = planContractRates(
      [
        { id: 1, contractNo: "K1", date: "2020-01-06", currency: "LC", items, hasLiveJournal: false },
        { id: 2, contractNo: "K2", date: "2020-01-06", currency: "CNY", items, hasLiveJournal: true },
      ],
      bi
    );
    expect(plan.fills).toEqual([]);
    expect(plan.unfillable.map((u) => u.id)).toEqual([1, 2]);
  });
});

describe("tanggal", () => {
  it("hari kalender UTC — cara pengimpor & jalur tulis menyimpan tanggal", () => {
    expect(isoDay(new Date(Date.UTC(2019, 9, 17)))).toBe("2019-10-17");
    expect(dayDiff("2020-02-28", "2020-03-01")).toBe(2);
  });
});
