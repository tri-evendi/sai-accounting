/**
 * TUTUP BUKU TAHUNAN (issue #555) — aritmetika & batas tahun bukunya.
 *
 * Dua sifat yang, bila salah, menghasilkan jurnal yang SEIMBANG dan SALAH:
 * tanggal yang memindahkan laba ke tahun yang keliru, dan pembulatan yang
 * menyisakan satu sen di ekuitas — tempat kesalahan paling sulit ditemukan
 * kembali.
 */
import { describe, expect, it } from "vitest";

import {
  fiscalYearBounds,
  fiscalYearHasEnded,
  planYearClose,
  type ClosingBalance,
} from "@/lib/year-close";

const RE = 999; // akun Laba Ditahan

const akun = (id: number, balance: number): ClosingBalance => ({
  accountId: id,
  accountCode: String(id),
  accountName: `Akun ${id}`,
  balance,
});

/** Penjualan 1 M (kredit → negatif), beban 400 jt (debit → positif). */
const PENJUALAN = akun(41, -1_000_000_000);
const BEBAN = akun(51, 400_000_000);

const seimbang = (lines: { debit: number; credit: number }[]) =>
  Math.round(
    (lines.reduce((s, l) => s + l.debit, 0) - lines.reduce((s, l) => s + l.credit, 0)) * 100
  ) / 100;

describe("batas tahun buku", () => {
  it("tahun buku kalender: 1 Jan – 31 Des", () => {
    const { start, end } = fiscalYearBounds(new Date(2024, 0, 1), 2026);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(11);
    expect(end.getDate()).toBe(31);
  });

  it("⚠ tahun buku NON-kalender berakhir pada tanggal yang benar", () => {
    /*
     * Mengasumsikan Januari–Desember akan menutup buku pada tanggal yang salah
     * bagi setiap perusahaan yang tahun bukunya tidak mulai 1 Januari — dan
     * kesalahannya tidak berbunyi: jurnalnya tetap seimbang, hanya labanya yang
     * mendarat di tahun yang keliru.
     */
    const { start, end } = fiscalYearBounds(new Date(2024, 3, 1), 2026); // 1 April
    expect(start.getMonth()).toBe(3);
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(2); // Maret
    expect(end.getDate()).toBe(31);
  });

  it("akhirnya tepat satu milidetik sebelum awal tahun berikutnya", () => {
    const a = fiscalYearBounds(new Date(2024, 6, 1), 2026);
    const b = fiscalYearBounds(new Date(2024, 6, 1), 2027);
    expect(b.start.getTime() - a.end.getTime()).toBe(1);
  });

  it("tahun kabisat tidak menggeser batasnya", () => {
    /* 2028 kabisat. Bentuk "tanggal sama tahun depan minus sehari" akan
       meleset di sini; bentuk "awal berikutnya minus 1 md" tidak punya kasus
       tepi sama sekali. */
    const { end } = fiscalYearBounds(new Date(2024, 2, 1), 2028); // 1 Maret 2028
    expect(end.getFullYear()).toBe(2029);
    expect(end.getMonth()).toBe(1); // Februari
    expect(end.getDate()).toBe(28);
  });

  it("tahun buku yang mulai 31 Januari tidak menggulung ke bulan lain", () => {
    /* `new Date(y, 0, 31)` sah; yang berbahaya adalah aritmetika hari. */
    const { start } = fiscalYearBounds(new Date(2024, 0, 31), 2026);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(31);
  });
});

describe("jurnal penutup", () => {
  it("menolkan pendapatan dan beban, sisanya ke Laba Ditahan", () => {
    const plan = planYearClose([PENJUALAN, BEBAN], RE);

    expect(plan.netIncome).toBe(600_000_000);
    expect(plan.closedAccounts).toBe(2);
    // Penjualan bersaldo kredit → DIDEBET untuk menolkannya.
    expect(plan.lines[0]).toEqual({ accountId: 41, debit: 1_000_000_000, credit: 0 });
    // Beban bersaldo debit → DIKREDIT.
    expect(plan.lines[1]).toEqual({ accountId: 51, debit: 0, credit: 400_000_000 });
    // Laba → Laba Ditahan bertambah (kredit).
    expect(plan.lines[2]).toEqual({ accountId: RE, debit: 0, credit: 600_000_000 });
    expect(seimbang(plan.lines)).toBe(0);
  });

  it("RUGI membalik sisi Laba Ditahan", () => {
    const plan = planYearClose([akun(41, -100_000_000), akun(51, 250_000_000)], RE);
    expect(plan.netIncome).toBe(-150_000_000);
    expect(plan.lines.at(-1)).toEqual({ accountId: RE, debit: 150_000_000, credit: 0 });
    expect(seimbang(plan.lines)).toBe(0);
  });

  it("⚠ pembulatan sen tidak boleh menyisakan selisih di EKUITAS", () => {
    /*
     * Sisi Laba Ditahan diturunkan dari jumlah saldo yang SUDAH dibulatkan.
     * Menjumlahkan yang mentah lalu membulatkan di akhir akan meleset satu sen
     * pada sebagian data — dan satu sen yang mendarat di ekuitas adalah selisih
     * yang tidak punya dokumen untuk menjelaskannya.
     */
    const receh = [akun(1, 0.005), akun(2, 0.005), akun(3, 0.005)];
    const plan = planYearClose(receh, RE);
    expect(seimbang(plan.lines)).toBe(0);
    const re = plan.lines.find((l) => l.accountId === RE)!;
    expect(re.debit + re.credit).toBe(Math.abs(plan.netIncome));
  });

  it("akun bersaldo nol dilewati, bukan dijurnal bernilai nol", () => {
    const plan = planYearClose([PENJUALAN, BEBAN, akun(52, 0)], RE);
    expect(plan.closedAccounts).toBe(2);
    expect(plan.lines.some((l) => l.accountId === 52)).toBe(false);
  });

  it("tahun tanpa transaksi laba rugi → tidak ada jurnal sama sekali", () => {
    /* Jurnal penutup bernilai nol menyatakan tahun itu SUDAH ditutup padahal
       tidak ada yang perlu ditutup, dan tahun berikutnya menumpuk di atasnya. */
    expect(planYearClose([], RE).lines).toEqual([]);
    expect(planYearClose([akun(41, 0)], RE).lines).toEqual([]);
  });

  it("impas: akunnya tetap ditutup, baris Laba Ditahan nol TIDAK lahir", () => {
    const plan = planYearClose([akun(41, -500_000), akun(51, 500_000)], RE);
    expect(plan.netIncome).toBe(0);
    expect(plan.closedAccounts).toBe(2);
    expect(plan.lines).toHaveLength(2);
    expect(plan.lines.some((l) => l.accountId === RE)).toBe(false);
    expect(seimbang(plan.lines)).toBe(0);
  });

  it("laba yang dipindahkan sama dengan pendapatan dikurangi beban", () => {
    /* Invarian yang menghubungkan jurnal ini dengan Laba Rugi tahun yang sama:
       kalau keduanya berbeda, satu di antaranya berbohong. */
    const balances = [akun(41, -900_000), akun(42, -100_000), akun(51, 250_000), akun(52, 50_000)];
    const pendapatan = 900_000 + 100_000;
    const beban = 250_000 + 50_000;
    expect(planYearClose(balances, RE).netIncome).toBe(pendapatan - beban);
  });
});

/**
 * TAHUN BUKU HARUS SUDAH BERAKHIR (issue #565).
 *
 * ══ Bentuk kegagalan yang dijaga ═══════════════════════════════════════════
 * Menutup tahun yang belum berakhir menerbitkan jurnal bertanggal MASA DEPAN,
 * memindahkan laba sampai hari ini ke Laba Ditahan, lalu meninggalkan setiap
 * transaksi antara hari ini dan tanggal itu DI LUAR jurnal penutupnya —
 * padahal semuanya jatuh di DALAM tahun yang sudah dinyatakan tertutup.
 *
 * Akun laba rugi tidak nol pada akhir tahun, `year_closes` menyatakan
 * sebaliknya, dan neracanya tetap seimbang di setiap langkah. Nol galat.
 *
 * Luput dari 19 tes #555 karena semuanya memberi `fiscalYearStart` dan `year`
 * sebagai angka, dan tidak satu pun menanyakan hubungan tahun itu dengan
 * HARI INI. Aritmetikanya memang benar untuk tahun mana pun; yang hilang adalah
 * pertanyaan apakah tahun itu boleh ditutup SEKARANG.
 */
describe("tahun buku harus sudah berakhir sebelum boleh ditutup", () => {
  const KALENDER = new Date(2026, 0, 1);

  it("tahun BERJALAN belum berakhir — kasus yang melahirkan #565", () => {
    /* Keadaan nyata buku demo pada 6 September 2026. */
    expect(fiscalYearHasEnded(KALENDER, 2026, new Date(2026, 8, 6))).toBe(false);
  });

  it("tahun LALU sudah berakhir", () => {
    expect(fiscalYearHasEnded(KALENDER, 2025, new Date(2026, 8, 6))).toBe(true);
  });

  it("tepat pada milidetik terakhir tahun buku, ia BELUM berakhir", () => {
    /* Batasnya `>` bukan `>=`: pada 31 Des 23:59:59.999 tahun itu masih
       berjalan, dan transaksi hari itu masih boleh masuk. */
    const { end } = fiscalYearBounds(KALENDER, 2026);
    expect(fiscalYearHasEnded(KALENDER, 2026, end)).toBe(false);
    expect(fiscalYearHasEnded(KALENDER, 2026, new Date(end.getTime() + 1))).toBe(true);
  });

  it("tahun buku NON-kalender memakai batasnya sendiri", () => {
    /* Tahun buku mulai 1 April. Pada 1 Februari 2027, tahun buku 2026 (yang
       berakhir 31 Maret 2027) BELUM berakhir — sementara kalender sudah
       berganti tahun. Menyamakan keduanya akan mengizinkan penutupan dua bulan
       terlalu awal, tiap tahun. */
    const APRIL = new Date(2020, 3, 1);
    expect(fiscalYearHasEnded(APRIL, 2026, new Date(2027, 1, 1))).toBe(false);
    expect(fiscalYearHasEnded(APRIL, 2026, new Date(2027, 3, 1))).toBe(true);
  });

  it("`now` disuntikkan, bukan dibaca dari jam sistem", () => {
    /* Penjaga yang membaca jamnya sendiri hanya bisa diuji pada hari tertentu,
       dan tesnya akan memerah suatu hari tanpa ada yang berubah. */
    expect(fiscalYearHasEnded.length).toBe(3);
  });
});
