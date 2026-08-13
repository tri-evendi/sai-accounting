/**
 * Rutinitas Bulanan (issue #355) — modul murni, jadi diuji PERILAKUNYA.
 *
 * Panel ini menjawab pertanyaan kedua pengguna awam akuntansi ("tiap akhir
 * bulan saya harus apa?"), yang sampai audit produksi 13 Agustus 2026 tidak
 * dijawab satu layar pun. Yang dijaga di sini adalah tiga sifat yang kalau
 * rusak tidak menghasilkan galat apa pun — hanya panel yang salah bulan, salah
 * orang, atau tidak pernah pergi.
 */
import { describe, expect, it } from "vitest";

import { ROLES } from "@/lib/constants";
import {
  MONTHLY_ROUTINE,
  formatMonthYear,
  isRoutineDue,
  monthBounds,
  previousMonth,
  visibleMonthlySteps,
  type MonthlyRoutineProgress,
} from "@/lib/monthly-routine";

describe("bulan yang dipertanggungjawabkan selalu bulan LALU", () => {
  it("mundur satu bulan di tengah tahun", () => {
    // 13 Agustus 2026 — tanggal audit yang melahirkan fitur ini.
    expect(previousMonth(new Date(2026, 7, 13))).toEqual({ year: 2026, month: 7 });
  });

  /*
   * Januari adalah satu-satunya kasus yang bisa salah diam-diam: mundur ke
   * bulan 0 (tidak ada) atau ke Desember TAHUN YANG SAMA — keduanya menghasilkan
   * panel yang menutup periode yang keliru.
   */
  it("Januari mundur ke Desember tahun sebelumnya", () => {
    expect(previousMonth(new Date(2026, 0, 1))).toEqual({ year: 2025, month: 12 });
    expect(previousMonth(new Date(2026, 0, 31))).toEqual({ year: 2025, month: 12 });
  });

  it("bulannya 1–12 seperti kolom periods.month, bukan 0–11 milik Date", () => {
    // Desember (indeks 11) → November = 11. Kalau nilainya indeks Date, ini 10.
    expect(previousMonth(new Date(2026, 11, 9)).month).toBe(11);
    expect(previousMonth(new Date(2026, 2, 9)).month).toBe(2);
  });
});

describe("batas bulan menutup seluruh bulan, tanpa bocor ke tetangganya", () => {
  it("Februari tahun kabisat berakhir di tanggal 29", () => {
    const { start, end } = monthBounds(2024, 2);
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(1); // masih Februari
    expect(end.getDate()).toBe(29);
  });

  it("Februari tahun biasa berakhir di tanggal 28", () => {
    expect(monthBounds(2026, 2).end.getDate()).toBe(28);
  });

  it("Desember berakhir 31 Desember, bukan merembet ke Januari", () => {
    const { end } = monthBounds(2026, 12);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(11);
    expect(end.getDate()).toBe(31);
  });

  /*
   * Milidetik terakhir, bukan tengah malam: `lte: end` dengan end=00:00 akan
   * MEMBUANG setiap transaksi yang dicatat pada hari terakhir bulan itu —
   * justru hari tersibuk untuk pengeluaran akhir bulan.
   */
  it("mencakup sampai milidetik terakhir hari terakhir", () => {
    const { end } = monthBounds(2026, 7);
    expect([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()]).toEqual([
      23, 59, 59, 999,
    ]);
  });
});

describe("panel muncul & pergi pada saat yang tepat", () => {
  it("masih perlu ditampilkan selama bulan lalu belum ditutup", () => {
    expect(isRoutineDue({})).toBe(true);
    expect(isRoutineDue({ tutup_bulan: false })).toBe(true);
  });

  it("hilang begitu bulannya terkunci", () => {
    expect(isRoutineDue({ tutup_bulan: true })).toBe(false);
  });

  /*
   * Sengaja TIDAK menunggu dua langkah pertama. Perusahaan boleh saja tidak
   * punya pengeluaran atau tidak punya rekening bank pada suatu bulan; menuntut
   * keduanya tercentang akan menahan panel ini di beranda selamanya.
   */
  it("tidak tertahan oleh langkah lain yang belum tercentang", () => {
    const progress: MonthlyRoutineProgress = {
      pengeluaran: false,
      cocokkan_bank: false,
      tutup_bulan: true,
    };
    expect(isRoutineDue(progress)).toBe(false);
  });
});

describe("langkahnya disaring izin efektif", () => {
  it("peran berakses penuh melihat ketiga langkah", () => {
    expect(visibleMonthlySteps(ROLES.MANAGING_DIRECTOR).map((s) => s.key)).toEqual([
      "pengeluaran",
      "cocokkan_bank",
      "tutup_bulan",
    ]);
  });

  it("tanpa peran, tak satu pun langkah", () => {
    expect(visibleMonthlySteps(null)).toEqual([]);
    expect(visibleMonthlySteps(undefined)).toEqual([]);
  });

  /*
   * `allowed` adalah set izin EFEKTIF — sudah memperhitungkan modul usaha yang
   * dimatikan. Perusahaan yang tak memakai Kas & Bank karena itu tidak pernah
   * diminta mencocokkan rekening koran yang tak ia punya.
   */
  it("set izin efektif yang menyempit ikut mempersempit daftarnya", () => {
    const allowed = new Set(["period.manage"]);
    expect(visibleMonthlySteps(ROLES.MANAGING_DIRECTOR, allowed).map((s) => s.key)).toEqual([
      "tutup_bulan",
    ]);
    expect(visibleMonthlySteps(ROLES.MANAGING_DIRECTOR, new Set()).length).toBe(0);
  });

  it("urutannya urutan kerja: catat → cocokkan → tutup", () => {
    // Menutup bulan sebelum pengeluarannya lengkap berarti mengunci angka salah,
    // jadi urutan daftar ini bukan selera dan tidak boleh diacak.
    expect(MONTHLY_ROUTINE.map((s) => s.key)).toEqual([
      "pengeluaran",
      "cocokkan_bank",
      "tutup_bulan",
    ]);
  });

  it("tiap langkah menyebut izin & kunci kamusnya sendiri", () => {
    for (const step of MONTHLY_ROUTINE) {
      expect(step.permission, `langkah "${step.key}" tanpa izin`).toBeTruthy();
      expect(step.labelKey.startsWith("monthlyRoutine.items.")).toBe(true);
      expect(step.descriptionKey.startsWith("monthlyRoutine.items.")).toBe(true);
      expect(step.href.startsWith("/")).toBe(true);
    }
  });
});

describe("nama bulan mengikuti bahasa pembacanya", () => {
  it("berbahasa Indonesia untuk pembaca id", () => {
    expect(formatMonthYear(2026, 7, "id")).toBe("Juli 2026");
  });

  /*
   * Inilah alasan fungsi ini ada alih-alih memakai `dashboard-summary.ts` yang
   * memaku "id-ID": labelnya masuk ke tengah kalimat subjudul, dan satu kata
   * Indonesia di tengah kalimat Inggris/Mandarin adalah cacat yang sama dengan
   * kolom berbahasa mati di dialog laporan (#316).
   */
  it("ikut berganti untuk pembaca en & zh", () => {
    expect(formatMonthYear(2026, 7, "en")).toBe("July 2026");
    expect(formatMonthYear(2026, 7, "zh")).toContain("2026");
    expect(formatMonthYear(2026, 7, "en")).not.toBe(formatMonthYear(2026, 7, "id"));
  });

  it("bulan 1 dan 12 tidak bergeser", () => {
    expect(formatMonthYear(2026, 1, "id")).toBe("Januari 2026");
    expect(formatMonthYear(2026, 12, "id")).toBe("Desember 2026");
  });
});
