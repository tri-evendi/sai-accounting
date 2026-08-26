/**
 * KALIMAT DASBOR (issue #472) — angka yang menjelaskan dirinya sendiri.
 *
 * == Masalahnya ============================================================
 * Dasbor menyajikan saldo, ringkasan per mata uang, dan grafik. Semuanya benar
 * dan semuanya ANGKA. Pengguna yang bukan akuntan melihat "Kas Rp 312.480.000"
 * dan tidak tahu apakah itu kabar baik.
 *
 * Satu-satunya permukaan yang pernah berbicara dengan kalimat adalah "Langkah
 * Pertama", dan ia sengaja berumur pendek — hilang selamanya begitu ada
 * transaksi pertama. Sesudah hari itu, dasbor kembali menjadi dinding angka.
 *
 * == TANPA AI, DAN ITU KEPUTUSAN ==========================================
 * Angka akuntansi tidak boleh dikarang. Model bahasa yang salah menyebut satu
 * digit pada halaman yang dibaca sebagai laporan keuangan adalah kerusakan yang
 * jauh lebih mahal daripada tidak punya fiturnya — dan kesalahannya justru
 * paling meyakinkan bentuknya.
 *
 * Yang di bawah ini aturan DETERMINISTIK di atas angka yang sudah dihitung:
 * perbandingan periode, ambang, peringkat. Tiap kalimat lahir dari satu fungsi
 * murni yang bisa diuji, dan tiap angka di dalamnya berasal dari sumber yang
 * SAMA dengan kartu di sebelahnya — modul ini tidak menghitung ulang apa pun.
 *
 * == DIAM ADALAH KELUARAN YANG SAH =========================================
 * Bulan yang tidak punya apa-apa untuk dikatakan memulangkan daftar KOSONG.
 * Sekali dasbor mengarang berita, tidak ada lagi yang membacanya — dan sebuah
 * kalimat yang muncul setiap bulan tanpa kecuali adalah kalimat yang berhenti
 * dibaca pada bulan ketiga.
 *
 * == KALIMATNYA DIRAKIT KAMUS, BUKAN DISAMBUNG =============================
 * Yang dipulangkan adalah KUNCI + nilai, bukan teks jadi. Urutan kata berbeda
 * antarbahasa, dan kalimat yang disambung dari potongan string hanya benar di
 * bahasa yang menulisnya.
 */
import type { DictionaryKey } from "@/lib/i18n/dictionary";

/** Satu kalimat siap dirender. */
export interface DashboardInsight {
  /** Penanda stabil — dipakai kunci React & tes, bukan untuk ditampilkan. */
  id: "cash-drop" | "cash-rise" | "overdue" | "budget-over" | "concentration";
  /** Kunci kamus berparameter. */
  key: DictionaryKey;
  values: Record<string, string | number>;
  /** Halaman yang menjawab sisanya. */
  href: string;
  /**
   * Nada, bukan tingkat kegawatan sistem: `warn` untuk yang menuntut tindakan,
   * `info` untuk yang sekadar menjelaskan.
   */
  tone: "warn" | "info";
}

/**
 * Angka yang SUDAH dihitung dasbor. Modul ini tidak membaca basis data dan
 * tidak menghitung ulang — bila sebuah angka di sini berbeda dari kartunya,
 * yang salah pemanggilnya, bukan aturannya.
 */
export interface DashboardFacts {
  /** Kas & bank, IDR base — akhir bulan ini vs akhir bulan lalu. */
  cash?: { thisMonth: number; lastMonth: number };
  /** Piutang lewat jatuh tempo. `oldestDays` = umur terlama, dalam hari. */
  overdue?: { count: number; amountBase: number; oldestDays: number };
  /** Realisasi vs anggaran bulan ini, IDR base. Hanya bila modulnya aktif. */
  budget?: { plannedBase: number; actualBase: number };
  /** Mitra dengan porsi terbesar bulan ini. `share` 0–1. */
  concentration?: { partyName: string; share: number; kind: "customer" | "supplier" };
}

/*
 * ── AMBANG, SUPAYA TIDAK BERISIK ──────────────────────────────────────────
 *
 * Ditulis EKSPLISIT dan diuji. Perubahan 2% bukan berita; sebuah kalimat yang
 * muncul karena kas bergeser seperseratus adalah kalimat yang melatih
 * pembacanya mengabaikan seluruh baris itu.
 *
 * Keduanya harus dilewati bersamaan untuk kas: PERSENTASE dan NOMINAL. Naik 40%
 * atas kas Rp 500 ribu bukan kabar; turun Rp 50 juta atas kas Rp 5 miliar (1%)
 * juga bukan.
 */
export const THRESHOLD = {
  /** Perubahan kas dianggap berita bila melewati 10% DAN Rp 5 juta. */
  cashShare: 0.1,
  cashAmount: 5_000_000,
  /** Piutang lewat tempo: satu faktur pun berita bila nilainya berarti. */
  overdueAmount: 1_000_000,
  /** Realisasi melewati anggaran: 10% DAN Rp 1 juta. */
  budgetShare: 0.1,
  budgetAmount: 1_000_000,
  /** Konsentrasi mitra dianggap berita mulai 40% dari total. */
  concentrationShare: 0.4,
} as const;

/** Paling banyak tiga — dasbor bukan tempat membaca paragraf. */
export const MAX_INSIGHTS = 3;

/**
 * Rakit kalimat dasbor dari angka yang sudah dihitung.
 *
 * Urutannya menurut KEPENTINGAN, bukan menurut urutan medan di atas: yang
 * menuntut tindakan lebih dulu (piutang lewat tempo, anggaran terlampaui),
 * baru yang menjelaskan (arah kas, konsentrasi).
 */
export function buildDashboardInsights(facts: DashboardFacts): DashboardInsight[] {
  const out: DashboardInsight[] = [];

  /* 1. Piutang lewat jatuh tempo — uang yang sudah menjadi hak tapi belum
        datang. Satu-satunya baris di sini yang menyebut tindakan orang lain. */
  const overdue = facts.overdue;
  if (overdue && overdue.count > 0 && overdue.amountBase >= THRESHOLD.overdueAmount) {
    out.push({
      id: "overdue",
      key: "dashboard.insightOverdue",
      values: {
        count: overdue.count,
        amount: overdue.amountBase,
        days: Math.max(0, Math.round(overdue.oldestDays)),
      },
      href: "/receivables",
      tone: "warn",
    });
  }

  /* 2. Anggaran terlampaui. Hanya bila modulnya aktif — pemanggil yang
        memutuskan itu dengan tidak mengisi medannya. */
  const budget = facts.budget;
  if (budget && budget.plannedBase > 0) {
    const over = budget.actualBase - budget.plannedBase;
    const share = over / budget.plannedBase;
    if (over >= THRESHOLD.budgetAmount && share >= THRESHOLD.budgetShare) {
      out.push({
        id: "budget-over",
        key: "dashboard.insightBudgetOver",
        values: { amount: over, percent: Math.round(share * 100) },
        href: "/budget/report",
        tone: "warn",
      });
    }
  }

  /* 3. Arah kas. Dua ambang sekaligus — lihat catatan pada THRESHOLD. */
  const cash = facts.cash;
  if (cash && cash.lastMonth !== 0) {
    const delta = cash.thisMonth - cash.lastMonth;
    const share = Math.abs(delta) / Math.abs(cash.lastMonth);
    if (Math.abs(delta) >= THRESHOLD.cashAmount && share >= THRESHOLD.cashShare) {
      out.push({
        id: delta < 0 ? "cash-drop" : "cash-rise",
        key: delta < 0 ? "dashboard.insightCashDrop" : "dashboard.insightCashRise",
        values: { amount: Math.abs(delta), percent: Math.round(share * 100) },
        href: "/reports/cash-flow",
        tone: delta < 0 ? "warn" : "info",
      });
    }
  }

  /* 4. Konsentrasi mitra. Menjelaskan risiko, tidak menuntut tindakan —
        karena itu `info`, dan karena itu pula ia paling akhir. */
  const c = facts.concentration;
  if (c && c.share >= THRESHOLD.concentrationShare && c.partyName.trim() !== "") {
    out.push({
      id: "concentration",
      key:
        c.kind === "customer"
          ? "dashboard.insightCustomerConcentration"
          : "dashboard.insightSupplierConcentration",
      values: { name: c.partyName.trim(), percent: Math.round(c.share * 100) },
      href: c.kind === "customer" ? "/reports/sales-by-customer" : "/reports/purchases-by-supplier",
      tone: "info",
    });
  }

  /*
   * Dipotong DI AKHIR, sesudah seluruh kandidat dinilai — bukan dengan berhenti
   * lebih awal. Kalau suatu saat urutannya diubah, pemotongan yang berdiri di
   * sini tetap menyisakan tiga yang paling penting menurut urutan BARU.
   */
  return out.slice(0, MAX_INSIGHTS);
}
