/**
 * Penjaga rekonsiliasi dimensi pusat biaya (issue #91).
 *
 * SATU janji, dan ini yang paling penting dari seluruh fitur:
 *
 *   > Jumlah seluruh pusat biaya DITAMBAH yang belum ditetapkan harus SAMA
 *   > PERSIS dengan total tanpa penyaring — untuk setiap laporan yang disentuh.
 *
 * Kalau angka itu pernah meleset, dimensinya bukan memilah angka melainkan
 * diam-diam MERUSAKNYA — kegagalan terburuk yang mungkin terjadi di sistem
 * akuntansi, karena tidak ada yang error dan tidak ada yang merah; laporannya
 * hanya salah. Karena itu penjaga ini ditulis SEBELUM fiturnya, dan sengaja
 * disusun supaya benar-benar menggigit:
 *
 *   • Penyaring yang DIABAIKAN → tiap pilahan mengembalikan total penuh, dan
 *     empat pilahan menjumlah menjadi ~4× total. Gagal.
 *   • "Belum ditetapkan" yang diperlakukan sama dengan "tanpa penyaring" →
 *     baris NULL terhitung dua kali. Gagal.
 *   • Saldo awal buku besar yang lupa ikut disaring → tiap pilahan membawa
 *     saldo awal seluruh perusahaan. Gagal.
 *   • Satu pusat biaya yang tak pernah muncul di daftar pilahan → jumlahnya
 *     kurang. Gagal (`COST_CENTRES` di bawah dijaga lengkap oleh tes tersendiri
 *     yang membacanya dari seed).
 *
 * Dan supaya penjaga ini tidak lulus secara sepele, ada pasangannya: penyaring
 * WAJIB benar-benar menyaring (angka per pilahan berbeda dari total, dan sama
 * dengan hitungan tangan).
 *
 * Datanya sengaja termasuk kasus yang jadi alasan dimensinya diletakkan di
 * BARIS: satu jurnal tagihan listrik bersama yang dibagi ke dua cabang.
 */
import { describe, expect, it } from "vitest";
import { createFakeReportClient, type FakeSeedJournal } from "./fake-client";
import { getIncomeStatement } from "@/lib/reports";
import { getAccountLedger } from "@/lib/ledger";
import {
  UNASSIGNED_COST_CENTER,
  costCenterFilterValue,
  costCenterLineWhere,
  parseCostCenterFilter,
  type CostCenterFilter,
} from "@/lib/cost-centers";

// ─── Data ────────────────────────────────────────────────

/** Pusat biaya di seed: 1 = Cabang Jakarta, 2 = Cabang Surabaya, 3 = Proyek A. */
const JAKARTA = 1;
const SURABAYA = 2;
const PROYEK = 3;

/** Setiap pilahan yang ADA, termasuk yang belum ditetapkan. Urutan tak penting. */
const SLICES: CostCenterFilter[] = [JAKARTA, SURABAYA, PROYEK, UNASSIGNED_COST_CENTER];

const ACCOUNTS = [
  { id: 1, code: "110101", name: "Kas", type: "cash_bank", normalBalance: "debit" },
  { id: 2, code: "110201", name: "Piutang Usaha", type: "account_receivable", normalBalance: "debit" },
  { id: 3, code: "210101", name: "Hutang Usaha", type: "account_payable", normalBalance: "credit" },
  { id: 4, code: "410101", name: "Penjualan", type: "revenue", normalBalance: "credit" },
  { id: 5, code: "510101", name: "Beban Listrik", type: "expense", normalBalance: "debit" },
  { id: 6, code: "510102", name: "Beban Gaji", type: "expense", normalBalance: "debit" },
  { id: 7, code: "310101", name: "Modal", type: "equity", normalBalance: "credit" },
];

const d = (iso: string) => new Date(`${iso}T00:00:00`);

const JOURNALS: FakeSeedJournal[] = [
  // ── Sebelum periode: saldo awal. Sebagian bertag, sebagian tidak — supaya
  //    saldo awal buku besar per pilahan benar-benar diuji.
  {
    id: 1,
    date: d("2025-12-31"),
    note: "Saldo awal",
    lines: [
      { accountId: 1, debit: 50_000_000, costCenterId: JAKARTA },
      { accountId: 1, debit: 20_000_000, costCenterId: SURABAYA },
      { accountId: 1, debit: 30_000_000 }, // belum ditetapkan
      { accountId: 7, credit: 100_000_000 },
    ],
  },
  // ── Penjualan Jakarta.
  {
    id: 2,
    date: d("2026-01-10"),
    note: "Faktur SI.001",
    lines: [
      { accountId: 2, debit: 12_000_000, costCenterId: JAKARTA },
      { accountId: 4, credit: 12_000_000, costCenterId: JAKARTA },
    ],
  },
  // ── Penjualan Surabaya.
  {
    id: 3,
    date: d("2026-01-15"),
    note: "Faktur SI.002",
    lines: [
      { accountId: 2, debit: 7_500_000, costCenterId: SURABAYA },
      { accountId: 4, credit: 7_500_000, costCenterId: SURABAYA },
    ],
  },
  // ── Penjualan yang TIDAK ditetapkan pusat biayanya (data lama / lintas unit).
  {
    id: 4,
    date: d("2026-01-20"),
    note: "Faktur SI.003",
    lines: [
      { accountId: 2, debit: 3_000_000 },
      { accountId: 4, credit: 3_000_000 },
    ],
  },
  // ── INILAH alasan dimensinya ada di BARIS, bukan di kepala:
  //    satu tagihan listrik bersama, dibagi ke dua cabang dalam SATU jurnal.
  {
    id: 5,
    date: d("2026-01-25"),
    note: "Tagihan listrik bersama",
    lines: [
      { accountId: 5, debit: 1_800_000, costCenterId: JAKARTA },
      { accountId: 5, debit: 1_200_000, costCenterId: SURABAYA },
      { accountId: 1, credit: 3_000_000 }, // kas kantor pusat, tak ditetapkan
    ],
  },
  // ── Beban gaji: satu proyek + sisanya belum ditetapkan.
  {
    id: 6,
    date: d("2026-02-01"),
    note: "Gaji Januari",
    lines: [
      { accountId: 6, debit: 5_000_000, costCenterId: PROYEK },
      { accountId: 6, debit: 4_000_000 },
      { accountId: 1, credit: 9_000_000 },
    ],
  },
  // ── Pendapatan proyek + valas (rate ≠ 1), supaya pilahan diuji pada nilai
  //    IDR base hasil konversi, bukan pada nominal mata uang asal.
  {
    id: 7,
    date: d("2026-02-10"),
    note: "Faktur ekspor SI.004",
    lines: [
      { accountId: 2, debit: 1_000, currency: "USD", rate: 16_250, costCenterId: PROYEK },
      { accountId: 4, credit: 1_000, currency: "USD", rate: 16_250, costCenterId: PROYEK },
    ],
  },
  // ── Setelah periode: harus terpotong penyaring tanggal, di pilahan mana pun.
  {
    id: 8,
    date: d("2026-04-05"),
    note: "Faktur SI.005",
    lines: [
      { accountId: 2, debit: 2_500_000, costCenterId: JAKARTA },
      { accountId: 4, credit: 2_500_000, costCenterId: JAKARTA },
    ],
  },
];

const client = createFakeReportClient({ accounts: ACCOUNTS, journals: JOURNALS });

/** Rentang yang diuji: seluruh waktu, satu bulan, dan satu rentang berpotongan. */
const PERIODS: { label: string; from?: Date; to?: Date }[] = [
  { label: "seluruh waktu", from: undefined, to: undefined },
  { label: "Januari 2026", from: d("2026-01-01"), to: d("2026-01-31") },
  { label: "Jan–Feb 2026", from: d("2026-01-01"), to: d("2026-02-28") },
  { label: "hanya Februari 2026", from: d("2026-02-01"), to: d("2026-02-28") },
];

/**
 * Bandingkan dalam sen — angka uang tak pernah dibandingkan sebagai float.
 * `|| 0` menormalkan `-0` (yang muncul dari saldo nol pada akun bersaldo
 * normal kredit) menjadi `0`; `Object.is(-0, 0)` bernilai false dan itu
 * kegagalan palsu, bukan selisih uang.
 */
const cents = (n: number) => Math.round(n * 100) || 0;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

// ─── Penjaga utama: pilahan menjumlah menjadi keseluruhan ────────────────────

describe("rekonsiliasi: Σ semua pusat biaya + belum ditetapkan = total tanpa penyaring", () => {
  describe("Laba/Rugi", () => {
    for (const period of PERIODS) {
      it(`sama persis pada ${period.label}`, async () => {
        const whole = await getIncomeStatement(period.from, period.to, client);
        const slices = await Promise.all(
          SLICES.map((cc) => getIncomeStatement(period.from, period.to, client, cc))
        );

        expect(cents(sum(slices.map((s) => s.totalRevenue)))).toBe(cents(whole.totalRevenue));
        expect(cents(sum(slices.map((s) => s.totalExpense)))).toBe(cents(whole.totalExpense));
        expect(cents(sum(slices.map((s) => s.netIncome)))).toBe(cents(whole.netIncome));
      });

      it(`sama persis PER AKUN pada ${period.label}`, async () => {
        // Total yang cocok tetapi baris yang tak cocok berarti angka berpindah
        // antar-akun — sama rusaknya, dan tak terlihat dari total saja.
        const whole = await getIncomeStatement(period.from, period.to, client);
        const slices = await Promise.all(
          SLICES.map((cc) => getIncomeStatement(period.from, period.to, client, cc))
        );

        for (const section of ["revenue", "expense"] as const) {
          const perCode = new Map<string, number>();
          for (const s of slices) {
            for (const line of s[section]) {
              perCode.set(line.code, (perCode.get(line.code) ?? 0) + line.amount);
            }
          }
          const expected = new Map(whole[section].map((l) => [l.code, l.amount]));
          expect(
            [...perCode.keys()].sort(),
            `akun ${section} yang muncul di pilahan tetapi tidak di total (atau sebaliknya)`
          ).toEqual([...expected.keys()].sort());
          for (const [code, amount] of expected) {
            expect(cents(perCode.get(code) ?? 0), `${section} ${code}`).toBe(cents(amount));
          }
        }
      });
    }
  });

  describe("Buku Besar", () => {
    for (const period of PERIODS) {
      for (const account of ACCOUNTS) {
        it(`akun ${account.code} sama persis pada ${period.label}`, async () => {
          const whole = (await getAccountLedger(account.id, period.from, period.to, client))!;
          const slices = await Promise.all(
            SLICES.map(
              async (cc) => (await getAccountLedger(account.id, period.from, period.to, client, cc))!
            )
          );

          expect(cents(sum(slices.map((s) => s.totalDebit)))).toBe(cents(whole.totalDebit));
          expect(cents(sum(slices.map((s) => s.totalCredit)))).toBe(cents(whole.totalCredit));
          // Saldo awal & saldo akhir ikut dijumlah: inilah yang menangkap saldo
          // awal yang lupa disaring (tiap pilahan membawa saldo seluruh
          // perusahaan, jadi jumlahnya menggelembung).
          expect(cents(sum(slices.map((s) => s.opening)))).toBe(cents(whole.opening));
          expect(cents(sum(slices.map((s) => s.closing)))).toBe(cents(whole.closing));
          // Tak satu baris pun boleh hilang atau tergandakan.
          expect(sum(slices.map((s) => s.rows.length))).toBe(whole.rows.length);
          expect(slices.flatMap((s) => s.rows.map((r) => r.lineId)).sort()).toEqual(
            whole.rows.map((r) => r.lineId).sort()
          );
        });
      }
    }
  });
});

// ─── Pasangannya: penyaingnya HARUS benar-benar menyaring ────────────────────

describe("penyaring benar-benar menyaring (bukan lulus secara sepele)", () => {
  const JAN_FEB = { from: d("2026-01-01"), to: d("2026-02-28") };

  it("Laba/Rugi per pusat biaya cocok dengan hitungan tangan", async () => {
    const jakarta = await getIncomeStatement(JAN_FEB.from, JAN_FEB.to, client, JAKARTA);
    const surabaya = await getIncomeStatement(JAN_FEB.from, JAN_FEB.to, client, SURABAYA);
    const proyek = await getIncomeStatement(JAN_FEB.from, JAN_FEB.to, client, PROYEK);
    const unassigned = await getIncomeStatement(
      JAN_FEB.from,
      JAN_FEB.to,
      client,
      UNASSIGNED_COST_CENTER
    );

    // Jakarta: penjualan 12.000.000 (SI.005 di April terpotong), listrik 1.800.000.
    expect(jakarta.totalRevenue).toBe(12_000_000);
    expect(jakarta.totalExpense).toBe(1_800_000);
    // Surabaya: penjualan 7.500.000, listrik 1.200.000.
    expect(surabaya.totalRevenue).toBe(7_500_000);
    expect(surabaya.totalExpense).toBe(1_200_000);
    // Proyek A: ekspor 1.000 USD @ 16.250 = 16.250.000 IDR base, gaji 5.000.000.
    expect(proyek.totalRevenue).toBe(16_250_000);
    expect(proyek.totalExpense).toBe(5_000_000);
    // Belum ditetapkan: penjualan 3.000.000, gaji 4.000.000.
    expect(unassigned.totalRevenue).toBe(3_000_000);
    expect(unassigned.totalExpense).toBe(4_000_000);
  });

  it("tiap pilahan berbeda dari total — penyaring yang diabaikan akan ketahuan di sini", async () => {
    const whole = await getIncomeStatement(JAN_FEB.from, JAN_FEB.to, client);
    expect(whole.totalRevenue).toBe(38_750_000);
    expect(whole.totalExpense).toBe(12_000_000);
    for (const cc of SLICES) {
      const slice = await getIncomeStatement(JAN_FEB.from, JAN_FEB.to, client, cc);
      expect(slice.totalRevenue, `pusat biaya ${String(cc)}`).not.toBe(whole.totalRevenue);
      expect(slice.totalExpense, `pusat biaya ${String(cc)}`).not.toBe(whole.totalExpense);
    }
  });

  it("satu jurnal boleh mencakup dua pusat biaya — beban listrik terbelah, bukan tergandakan", async () => {
    const jakarta = await getIncomeStatement(JAN_FEB.from, JAN_FEB.to, client, JAKARTA);
    const surabaya = await getIncomeStatement(JAN_FEB.from, JAN_FEB.to, client, SURABAYA);
    const listrik = (lines: { code: string; amount: number }[]) =>
      lines.find((l) => l.code === "510101")?.amount ?? 0;

    expect(listrik(jakarta.expense)).toBe(1_800_000);
    expect(listrik(surabaya.expense)).toBe(1_200_000);
    // Dan keduanya persis membentuk tagihannya, tanpa sisa.
    expect(listrik(jakarta.expense) + listrik(surabaya.expense)).toBe(3_000_000);
  });

  it("buku besar per pusat biaya menyaring saldo awal, bukan hanya mutasinya", async () => {
    // Kas: saldo awal 50jt Jakarta + 20jt Surabaya + 30jt belum ditetapkan.
    const from = d("2026-01-01");
    const jakarta = (await getAccountLedger(1, from, undefined, client, JAKARTA))!;
    const unassigned = (await getAccountLedger(1, from, undefined, client, UNASSIGNED_COST_CENTER))!;
    const whole = (await getAccountLedger(1, from, undefined, client))!;

    expect(jakarta.opening).toBe(50_000_000);
    expect(unassigned.opening).toBe(30_000_000);
    expect(whole.opening).toBe(100_000_000);
  });

  it("'belum ditetapkan' TIDAK sama dengan 'tanpa penyaring'", async () => {
    const unassigned = await getIncomeStatement(JAN_FEB.from, JAN_FEB.to, client, UNASSIGNED_COST_CENTER);
    const whole = await getIncomeStatement(JAN_FEB.from, JAN_FEB.to, client, undefined);
    expect(unassigned.totalRevenue).not.toBe(whole.totalRevenue);
    expect(unassigned.totalRevenue).toBe(3_000_000);
  });

  it("pusat biaya yang tak punya satu baris pun menghasilkan laporan kosong, bukan laporan penuh", async () => {
    const empty = await getIncomeStatement(JAN_FEB.from, JAN_FEB.to, client, 999);
    expect(empty.revenue).toEqual([]);
    expect(empty.expense).toEqual([]);
    expect(empty.netIncome).toBe(0);
  });
});

// ─── Daftar pilahan harus lengkap, atau penjaga di atas tak berarti ──────────

describe("daftar pilahan lengkap", () => {
  it("SLICES memuat setiap pusat biaya yang muncul di seed, plus yang belum ditetapkan", () => {
    const inSeed = new Set<number>();
    let anyUnassigned = false;
    for (const j of JOURNALS) {
      for (const l of j.lines) {
        if (l.costCenterId == null) anyUnassigned = true;
        else inSeed.add(l.costCenterId);
      }
    }
    expect([...inSeed].sort((a, b) => a - b)).toEqual(
      SLICES.filter((s): s is number => typeof s === "number").sort((a, b) => a - b)
    );
    expect(anyUnassigned).toBe(true);
    expect(SLICES).toContain(UNASSIGNED_COST_CENTER);
  });
});

// ─── Bagian murni: pembacaan penyaring dari URL ──────────────────────────────

describe("parseCostCenterFilter", () => {
  it("kosong / tak masuk akal ⇒ tanpa penyaring (gagal ke arah yang aman: tampilkan semua)", () => {
    for (const raw of [null, undefined, "", "   ", "abc", "0", "-3", "1.5.2", "NaN"]) {
      expect(parseCostCenterFilter(raw), String(raw)).toBeUndefined();
    }
  });

  it("angka ⇒ satu pusat biaya", () => {
    expect(parseCostCenterFilter("7")).toBe(7);
    expect(parseCostCenterFilter(" 7 ")).toBe(7);
  });

  it("sentinel ⇒ belum ditetapkan, dan itu BUKAN tanpa penyaring", () => {
    expect(parseCostCenterFilter(UNASSIGNED_COST_CENTER)).toBe(UNASSIGNED_COST_CENTER);
    expect(parseCostCenterFilter(UNASSIGNED_COST_CENTER)).not.toBeUndefined();
  });

  it("bolak-balik dengan costCenterFilterValue", () => {
    for (const filter of SLICES) {
      expect(parseCostCenterFilter(costCenterFilterValue(filter))).toEqual(filter);
    }
    expect(costCenterFilterValue(undefined)).toBe("");
  });
});

describe("costCenterLineWhere", () => {
  it("tanpa penyaring ⇒ objek kosong (bukan costCenterId: undefined)", () => {
    const where = costCenterLineWhere(undefined);
    expect(where).toEqual({});
    expect("costCenterId" in where).toBe(false);
  });

  it("satu pusat biaya ⇒ cost_center_id = id", () => {
    expect(costCenterLineWhere(4)).toEqual({ costCenterId: 4 });
  });

  it("belum ditetapkan ⇒ cost_center_id IS NULL", () => {
    expect(costCenterLineWhere(UNASSIGNED_COST_CENTER)).toEqual({ costCenterId: null });
  });
});
