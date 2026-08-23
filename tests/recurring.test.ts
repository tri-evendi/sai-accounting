/**
 * Transaksi berulang (issue #469) — aturan tanggalnya.
 *
 * Yang diuji paling keras adalah pertanyaan yang paling mudah dijawab
 * "kebetulan": tanggal 31 di bulan berisi 30 hari, 29 Februari, dan apakah
 * jadwal bulanan HANYUT setelah sekali dijepit. Sebuah jadwal yang bergeser
 * beberapa hari dalam setahun tidak pernah menerbitkan galat — ia hanya
 * menaruh sewa bulan itu di tanggal yang salah, lalu di bulan yang salah.
 */
import { describe, expect, it } from "vitest";

import {
  CATCH_UP_DAYS,
  nextOccurrence,
  occurrenceAt,
  occurrenceKey,
  planOccurrences,
  type RecurrenceRule,
} from "@/lib/recurring";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const rule = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: "monthly",
  startDate: day("2026-01-15"),
  endDate: null,
  maxOccurrences: null,
  ...over,
});

const at = (r: RecurrenceRule, n: number) => occurrenceKey(occurrenceAt(r, n));

describe("kejadian bulanan", () => {
  it("tanggal yang sama tiap bulan", () => {
    const r = rule();
    expect([at(r, 0), at(r, 1), at(r, 2)]).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
  });

  it("menyeberang tahun", () => {
    const r = rule({ startDate: day("2026-11-15") });
    expect([at(r, 1), at(r, 2)]).toEqual(["2026-12-15", "2027-01-15"]);
  });

  it("tanggal 31 DIJEPIT ke hari terakhir, tidak meluber ke bulan berikutnya", () => {
    // `new Date(2026, 1, 31)` polos memulangkan 3 Maret — sewa yang tercatat
    // di bulan yang salah, tanpa satu galat pun.
    const r = rule({ startDate: day("2026-01-31") });
    expect(at(r, 1)).toBe("2026-02-28");
    expect(at(r, 3)).toBe("2026-04-30");
  });

  it("dijepit sekali TIDAK membuat jadwalnya hanyut", () => {
    /* Dihitung dari tanggal MULAI, bukan dari kejadian sebelumnya: 31 Jan →
       28 Feb → 31 Mar. Kalau dihitung berantai, Maret akan ikut jadi 28 dan
       seterusnya — jadwal yang bergeser sendiri tanpa ada yang menyadarinya. */
    const r = rule({ startDate: day("2026-01-31") });
    expect([at(r, 0), at(r, 1), at(r, 2), at(r, 3)]).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("29 Februari tahun kabisat, lalu tahun biasa", () => {
    const r = rule({ frequency: "yearly", startDate: day("2028-02-29") });
    expect([at(r, 0), at(r, 1)]).toEqual(["2028-02-29", "2029-02-28"]);
  });
});

describe("kejadian mingguan & tahunan", () => {
  it("mingguan = tepat tujuh hari, menyeberang bulan", () => {
    const r = rule({ frequency: "weekly", startDate: day("2026-01-28") });
    expect([at(r, 0), at(r, 1), at(r, 2)]).toEqual(["2026-01-28", "2026-02-04", "2026-02-11"]);
  });

  it("tahunan = tanggal yang sama, tahun berikutnya", () => {
    const r = rule({ frequency: "yearly" });
    expect([at(r, 0), at(r, 1)]).toEqual(["2026-01-15", "2027-01-15"]);
  });
});

describe("batas aturan", () => {
  it("jumlah kejadian penuh → berhenti", () => {
    const r = rule({ maxOccurrences: 2 });
    const found = planOccurrences({ rule: r, today: day("2026-06-15") });
    expect(found).toEqual([]);
    expect(nextOccurrence(r, day("2026-02-16"))).toBeNull();
  });

  it("tanggal akhir terlewat → berhenti", () => {
    const r = rule({ endDate: day("2026-02-20") });
    expect(nextOccurrence(r, day("2026-02-16"))).toBeNull();
  });

  it("tanggal akhir yang JATUH PAS pada kejadian masih ikut", () => {
    const r = rule({ endDate: day("2026-02-15") });
    expect(occurrenceKey(nextOccurrence(r, day("2026-01-16"))!)).toBe("2026-02-15");
  });
});

describe("apa yang diterbitkan hari ini", () => {
  it("kejadian hari ini diterbitkan", () => {
    const found = planOccurrences({ rule: rule(), today: day("2026-03-15") });
    expect(found.map((o) => o.key)).toEqual(["2026-03-15"]);
  });

  it("kejadian masa depan TIDAK diterbitkan lebih awal", () => {
    expect(planOccurrences({ rule: rule(), today: day("2026-03-14") })).toEqual([]);
  });

  it("penjadwal yang mati beberapa hari masih menyusul", () => {
    expect(CATCH_UP_DAYS).toBe(7);
    const found = planOccurrences({ rule: rule(), today: day("2026-03-20") });
    expect(found.map((o) => o.key)).toEqual(["2026-03-15"]);
  });

  it("TEMPLAT BARU BERTANGGAL MULAI LAMA TIDAK MENERBITKAN DUA PULUH DRAF", () => {
    /* Sifat terpenting di sini: seseorang yang membuat templat sewa hari ini
       dengan tanggal mulai Januari tahun lalu mendapat SATU draf, bukan
       delapan belas yang harus dihapus satu per satu. */
    const r = rule({ startDate: day("2025-01-15") });
    const found = planOccurrences({ rule: r, today: day("2026-08-23") });
    expect(found).toHaveLength(0);
    const tepat = planOccurrences({ rule: r, today: day("2026-08-15") });
    expect(tepat.map((o) => o.key)).toEqual(["2026-08-15"]);
  });

  it("yang sudah pernah terbit tidak diusulkan lagi", () => {
    const found = planOccurrences({
      rule: rule(),
      today: day("2026-03-15"),
      sudahTerbit: new Set(["2026-03-15"]),
    });
    expect(found).toEqual([]);
  });

  it("kuncinya TANGGAL KEJADIAN, bukan hari ini — jadi tak berulang harian", () => {
    const a = planOccurrences({ rule: rule(), today: day("2026-03-15") })[0];
    const b = planOccurrences({ rule: rule(), today: day("2026-03-18") })[0];
    expect(a.key).toBe(b.key);
  });
});

describe("kejadian berikutnya", () => {
  it("menjawab tanggal berikutnya sesudah hari ini", () => {
    expect(occurrenceKey(nextOccurrence(rule(), day("2026-03-15"))!)).toBe("2026-04-15");
  });

  it("templat yang sudah habis menjawab NULL, bukan tanggal karangan", () => {
    expect(nextOccurrence(rule({ maxOccurrences: 1 }), day("2026-02-01"))).toBeNull();
  });
});
