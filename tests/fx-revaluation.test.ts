/**
 * REVALUASI POS MONETER VALAS (issue #554) — aritmetikanya.
 *
 * Yang dijaga di sini bukan "fiturnya jalan" melainkan tiga sifat yang, bila
 * salah, menghasilkan jurnal yang SEIMBANG dan SALAH — bentuk kegagalan yang
 * tidak pernah berbunyi:
 *
 *   1. arah tandanya benar untuk aset MAUPUN kewajiban, tanpa percabangan;
 *   2. jurnalnya seimbang secara konstruksi, termasuk saat pembulatan sen
 *      seharusnya menyisakan selisih;
 *   3. yang tidak bergerak tidak dijurnal sama sekali.
 */
import { describe, expect, it } from "vitest";

import {
  InvalidClosingRateError,
  planRevaluation,
  revaluationJournalLines,
  type MonetaryBalance,
} from "@/lib/fx-revaluation";

/** Piutang USD 100.000 dibukukan pada kurs 15.800. */
const PIUTANG: MonetaryBalance = {
  accountId: 11,
  accountCode: "110202",
  accountName: "Piutang Usaha (USD)",
  currency: "USD",
  foreignAmount: 100_000,
  carryingBase: 1_580_000_000,
};

/** Utang USD 40.000 dibukukan pada kurs 15.800 — saldo kredit, jadi NEGATIF. */
const UTANG: MonetaryBalance = {
  accountId: 21,
  accountCode: "210102",
  accountName: "Hutang Usaha (USD)",
  currency: "USD",
  foreignAmount: -40_000,
  carryingBase: -632_000_000,
};

describe("arah tanda: satu rumus, dua jenis akun", () => {
  it("kurs NAIK atas piutang = untung, dan mendarat sebagai DEBIT", () => {
    const plan = planRevaluation("USD", 16_500, [PIUTANG]);
    expect(plan.lines[0].revaluedBase).toBe(1_650_000_000);
    expect(plan.lines[0].difference).toBe(70_000_000);

    const [line] = revaluationJournalLines(plan, 99);
    expect(line).toEqual({ accountId: 11, debit: 70_000_000, credit: 0 });
  });

  it("kurs NAIK atas utang = rugi, dan mendarat sebagai KREDIT", () => {
    /* Tanpa satu pun percabangan aset-versus-kewajiban di modulnya: saldo
       kewajiban negatif membuat rumus yang sama menghasilkan arah yang benar. */
    const plan = planRevaluation("USD", 16_500, [UTANG]);
    expect(plan.lines[0].difference).toBe(-28_000_000);

    const [line] = revaluationJournalLines(plan, 99);
    expect(line).toEqual({ accountId: 21, debit: 0, credit: 28_000_000 });
  });

  it("kurs TURUN membalik keduanya", () => {
    const plan = planRevaluation("USD", 15_000, [PIUTANG, UTANG]);
    expect(plan.lines.map((l) => l.difference)).toEqual([-80_000_000, 32_000_000]);
  });
});

describe("jurnalnya seimbang secara konstruksi", () => {
  const seimbang = (lines: { debit: number; credit: number }[]) => {
    const d = lines.reduce((s, l) => s + l.debit, 0);
    const c = lines.reduce((s, l) => s + l.credit, 0);
    return Math.round((d - c) * 100) / 100;
  };

  it("piutang + utang bersama-sama tetap seimbang", () => {
    const plan = planRevaluation("USD", 16_500, [PIUTANG, UTANG]);
    expect(seimbang(revaluationJournalLines(plan, 99))).toBe(0);
  });

  it("⚠ pembulatan sen tidak boleh melahirkan jurnal timpang", () => {
    /*
     * Inti berkas ini, dan penjaga ini SUDAH DILIHAT MERAH: `totalDifference`
     * sempat diganti menjadi bentuk naif (jumlahkan perkalian MENTAH, bulatkan
     * di akhir), tes ini gagal, lalu dikembalikan.
     *
     * Angkanya dipilih supaya kedua cara benar-benar berbeda — bukan sekadar
     * "terlihat receh". Tiap baris berselisih mentah 0,005000000121 yang
     * membulat ke 0,01, jadi:
     *
     *   benar (jumlahkan yang sudah dibulatkan) : 0,01 × 3 = 0,03
     *   naif  (bulatkan jumlah mentah)          : round(0,015000000363) = 0,02
     *
     * Selisih satu sen itulah jurnal timpang yang hanya muncul pada sebagian
     * data dan tidak pernah pada data uji yang rapi.
     */
    const receh: MonetaryBalance[] = [1, 2, 3].map((id) => ({
      ...PIUTANG,
      accountId: id,
      foreignAmount: 100,
      carryingBase: 1_580_000,
    }));
    const plan = planRevaluation("USD", 15_800.00005, receh);

    expect(plan.lines.map((l) => l.difference)).toEqual([0.01, 0.01, 0.01]);
    expect(plan.totalDifference).toBe(0.03);

    const lines = revaluationJournalLines(plan, 99);
    expect(seimbang(lines)).toBe(0);

    const fx = lines.find((l) => l.accountId === 99)!;
    expect(fx.credit).toBe(0.03);
  });

  it("untung yang menghapus rugi dengan tepat: baris tetap terbit, penyeimbang nol TIDAK", () => {
    /* Selisih total nol sementara akunnya masing-masing bergerak. Jurnalnya
       tetap sah dan tetap harus terbit; yang tidak boleh lahir hanyalah baris
       Selisih Kurs bernilai nol. */
    const plan = planRevaluation("USD", 16_500, [
      PIUTANG,
      { ...UTANG, foreignAmount: -100_000, carryingBase: -1_580_000_000 },
    ]);
    expect(plan.totalDifference).toBe(0);

    const lines = revaluationJournalLines(plan, 99);
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.accountId === 99)).toBe(false);
    expect(seimbang(lines)).toBe(0);
  });
});

describe("diam adalah keluaran yang sah", () => {
  it("kurs penutup = kurs pembukuan → tidak ada baris, tidak ada jurnal", () => {
    const plan = planRevaluation("USD", 15_800, [PIUTANG, UTANG]);
    expect(plan.lines).toEqual([]);
    expect(plan.totalDifference).toBe(0);
    expect(revaluationJournalLines(plan, 99)).toEqual([]);
  });

  it("akun yang tidak bergerak dibuang, yang bergerak tetap ikut", () => {
    /* Baris nol yang ikut terbit muncul di setiap kartu akun dan setiap
       ekspor tanpa mengatakan apa pun. */
    const plan = planRevaluation("USD", 16_500, [
      PIUTANG,
      { ...UTANG, foreignAmount: 0, carryingBase: 0 },
    ]);
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0].accountId).toBe(11);
  });

  it("saldo valas nol yang menyisakan nilai tercatat TETAP direvaluasi", () => {
    /* Kasus nyata: piutang lunas penuh tetapi jurnalnya menyisakan sisa base
       karena kurs pelunasan berbeda. Saldo valasnya nol, jadi nilainya kini nol
       — dan sisa rupiah itu memang harus dihapus, bukan dibiarkan menggantung. */
    const plan = planRevaluation("USD", 16_500, [
      { ...PIUTANG, foreignAmount: 0, carryingBase: 1_250_000 },
    ]);
    expect(plan.lines[0].difference).toBe(-1_250_000);
  });
});

describe("mata uang lain tidak ikut terseret", () => {
  it("hanya saldo bermata uang yang diminta yang dihitung", () => {
    const cny: MonetaryBalance = {
      ...PIUTANG,
      accountId: 12,
      currency: "CNY",
      foreignAmount: 500_000,
      carryingBase: 1_100_000_000,
    };
    const plan = planRevaluation("USD", 16_500, [PIUTANG, cny]);
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0].currency).toBe("USD");
  });
});

describe("kurs penutup yang tidak sah DITOLAK, bukan dipakai", () => {
  it.each([[0], [-1], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    "kurs %p melempar",
    (rate) => {
      /*
       * Kurs nol bukan kasus tepi yang boleh dibulatkan menjadi "tidak ada
       * selisih": ia menilai setiap saldo valas menjadi NOL dan menerbitkan
       * jurnal sebesar seluruh piutang perusahaan — jurnal yang seimbang,
       * masuk akal bentuknya, dan menghapus buku.
       */
      expect(() => planRevaluation("USD", rate as number, [PIUTANG])).toThrow(
        InvalidClosingRateError
      );
    }
  );
});
