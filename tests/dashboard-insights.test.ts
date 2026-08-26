/**
 * KALIMAT DASBOR (issue #472).
 *
 * Yang diuji bukan "fungsinya memulangkan kalimat", melainkan sifat-sifat yang
 * membuat kalimat itu boleh dipercaya di halaman yang dibaca sebagai laporan
 * keuangan: ambangnya nyata, diamnya sah, angkanya tidak dikarang, dan
 * kalimatnya dirakit kamus.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildDashboardInsights,
  MAX_INSIGHTS,
  THRESHOLD,
  type DashboardFacts,
} from "@/lib/dashboard-insights";

const dict = (loc: string) =>
  JSON.parse(
    readFileSync(join(__dirname, "..", "src", "lib", "i18n", "dictionaries", `${loc}.json`), "utf8")
  );

describe("diam adalah keluaran yang sah", () => {
  it("tanpa fakta apa pun → tidak ada kalimat", () => {
    expect(buildDashboardInsights({})).toEqual([]);
  });

  it("bulan yang tenang tidak dipaksa berbicara", () => {
    /*
     * Sekali dasbor mengarang berita, tidak ada lagi yang membacanya — dan
     * kalimat yang muncul setiap bulan tanpa kecuali berhenti dibaca pada bulan
     * ketiga.
     */
    const tenang: DashboardFacts = {
      cash: { thisMonth: 100_000_000, lastMonth: 99_000_000 }, // 1%
      overdue: { count: 0, amountBase: 0, oldestDays: 0 },
      budget: { plannedBase: 50_000_000, actualBase: 50_500_000 }, // 1%
      concentration: { partyName: "PT Kecil", share: 0.12, kind: "customer" },
    };
    expect(buildDashboardInsights(tenang)).toEqual([]);
  });
});

describe("ambangnya nyata — dua-duanya harus dilewati untuk kas", () => {
  it("persentase besar TAPI nominal kecil → diam", () => {
    /* Naik 40% atas kas Rp 500 ribu bukan kabar. */
    const r = buildDashboardInsights({ cash: { thisMonth: 700_000, lastMonth: 500_000 } });
    expect(r).toEqual([]);
  });

  it("nominal besar TAPI persentase kecil → diam", () => {
    /* Turun Rp 50 juta atas kas Rp 5 miliar (1%) juga bukan kabar. */
    const r = buildDashboardInsights({
      cash: { thisMonth: 4_950_000_000, lastMonth: 5_000_000_000 },
    });
    expect(r).toEqual([]);
  });

  it("keduanya terlewati → berbicara", () => {
    const r = buildDashboardInsights({ cash: { thisMonth: 58_000_000, lastMonth: 100_000_000 } });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("cash-drop");
    expect(r[0].values.amount).toBe(42_000_000);
    expect(r[0].values.percent).toBe(42);
  });

  it("kas naik memakai kalimat & nada yang berbeda", () => {
    const r = buildDashboardInsights({ cash: { thisMonth: 150_000_000, lastMonth: 100_000_000 } });
    expect(r[0].id).toBe("cash-rise");
    expect(r[0].tone).toBe("info");
  });

  it("bulan lalu nol tidak membagi dengan nol", () => {
    const r = buildDashboardInsights({ cash: { thisMonth: 90_000_000, lastMonth: 0 } });
    expect(r).toEqual([]);
    expect(r.every((x) => Number.isFinite(Number(x.values.percent)))).toBe(true);
  });
});

describe("piutang lewat jatuh tempo", () => {
  it("berbicara, dan membawa ketiga angkanya", () => {
    const r = buildDashboardInsights({
      overdue: { count: 4, amountBase: 180_000_000, oldestDays: 47 },
    });
    expect(r[0].id).toBe("overdue");
    expect(r[0].values).toEqual({ count: 4, amount: 180_000_000, days: 47 });
    expect(r[0].href).toBe("/receivables");
    expect(r[0].tone).toBe("warn");
  });

  it("nol faktur → diam, meski medannya ada", () => {
    expect(
      buildDashboardInsights({ overdue: { count: 0, amountBase: 0, oldestDays: 0 } })
    ).toEqual([]);
  });

  it("nilai receh → diam", () => {
    expect(
      buildDashboardInsights({ overdue: { count: 1, amountBase: 50_000, oldestDays: 3 } })
    ).toEqual([]);
  });

  it("umur negatif tidak pernah tercetak", () => {
    /* Jam server yang bergeser tidak boleh menghasilkan "lewat tempo −2 hari". */
    const r = buildDashboardInsights({
      overdue: { count: 1, amountBase: 9_000_000, oldestDays: -2 },
    });
    expect(r[0].values.days).toBe(0);
  });
});

describe("anggaran hanya bicara bila modulnya aktif", () => {
  it("tanpa medan anggaran → diam", () => {
    expect(buildDashboardInsights({})).toEqual([]);
  });

  it("anggaran nol tidak membagi dengan nol", () => {
    expect(
      buildDashboardInsights({ budget: { plannedBase: 0, actualBase: 12_000_000 } })
    ).toEqual([]);
  });

  it("realisasi DI BAWAH anggaran bukan berita", () => {
    expect(
      buildDashboardInsights({ budget: { plannedBase: 50_000_000, actualBase: 30_000_000 } })
    ).toEqual([]);
  });

  it("terlampaui melewati kedua ambang → berbicara", () => {
    const r = buildDashboardInsights({
      budget: { plannedBase: 40_000_000, actualBase: 52_000_000 },
    });
    expect(r[0].id).toBe("budget-over");
    expect(r[0].values.amount).toBe(12_000_000);
    expect(r[0].values.percent).toBe(30);
  });
});

describe("konsentrasi mitra", () => {
  it("di atas ambang → berbicara, dan menunjuk laporan yang benar", () => {
    const r = buildDashboardInsights({
      concentration: { partyName: "PT Rempah Jaya", share: 0.62, kind: "customer" },
    });
    expect(r[0].id).toBe("concentration");
    expect(r[0].values).toEqual({ name: "PT Rempah Jaya", percent: 62 });
    expect(r[0].href).toBe("/reports/sales-by-customer");
  });

  it("pemasok memakai kalimat & tautan sendiri", () => {
    const r = buildDashboardInsights({
      concentration: { partyName: "CV Sumber", share: 0.55, kind: "supplier" },
    });
    expect(r[0].key).toBe("dashboard.insightSupplierConcentration");
    expect(r[0].href).toBe("/reports/purchases-by-supplier");
  });

  it("nama kosong tidak melahirkan kalimat tanpa subjek", () => {
    expect(
      buildDashboardInsights({ concentration: { partyName: "   ", share: 0.9, kind: "customer" } })
    ).toEqual([]);
  });
});

describe("paling banyak tiga, terurut menurut kepentingan", () => {
  const semua: DashboardFacts = {
    cash: { thisMonth: 58_000_000, lastMonth: 100_000_000 },
    overdue: { count: 4, amountBase: 180_000_000, oldestDays: 47 },
    budget: { plannedBase: 40_000_000, actualBase: 52_000_000 },
    concentration: { partyName: "PT Rempah Jaya", share: 0.62, kind: "customer" },
  };

  it("empat kandidat menghasilkan tepat tiga", () => {
    expect(buildDashboardInsights(semua)).toHaveLength(MAX_INSIGHTS);
  });

  it("yang menuntut TINDAKAN lebih dulu daripada yang menjelaskan", () => {
    const ids = buildDashboardInsights(semua).map((i) => i.id);
    expect(ids).toEqual(["overdue", "budget-over", "cash-drop"]);
    /* Konsentrasi (`info`) tersisih — dan itu yang benar: ia menjelaskan
       risiko, tidak menuntut tindakan hari ini. */
    expect(ids).not.toContain("concentration");
  });
});

describe("kalimatnya dirakit KAMUS, bukan disambung", () => {
  it("yang dipulangkan kunci + nilai, bukan teks jadi", () => {
    const r = buildDashboardInsights({
      overdue: { count: 2, amountBase: 20_000_000, oldestDays: 9 },
    });
    /* Urutan kata berbeda antarbahasa; kalimat yang disambung dari potongan
       string hanya benar di bahasa yang menulisnya. */
    expect(r[0].key.startsWith("dashboard.")).toBe(true);
    expect(typeof r[0].values).toBe("object");
  });

  it("setiap kunci ada di ketiga bahasa, dengan placeholder yang sama", () => {
    const semua: DashboardFacts = {
      cash: { thisMonth: 58_000_000, lastMonth: 100_000_000 },
      overdue: { count: 4, amountBase: 180_000_000, oldestDays: 47 },
      budget: { plannedBase: 40_000_000, actualBase: 52_000_000 },
      concentration: { partyName: "X", share: 0.62, kind: "customer" },
    };
    const naik = buildDashboardInsights({ cash: { thisMonth: 150_000_000, lastMonth: 100_000_000 } });
    const pemasok = buildDashboardInsights({
      concentration: { partyName: "Y", share: 0.9, kind: "supplier" },
    });

    for (const insight of [...buildDashboardInsights(semua), ...naik, ...pemasok]) {
      const leaf = insight.key.split(".")[1];
      for (const loc of ["id", "en", "zh"]) {
        const text: string = dict(loc).dashboard[leaf];
        expect(text, `${loc}.dashboard.${leaf}`).toBeTruthy();
        for (const name of Object.keys(insight.values)) {
          expect(text, `${loc}.${leaf} kehilangan {${name}}`).toContain(`{${name}}`);
        }
      }
    }
  });
});

describe("ambangnya bisa dibaca, bukan tersembunyi di dalam cabang", () => {
  it("diekspor supaya bisa diuji dan ditinjau", () => {
    expect(THRESHOLD.cashShare).toBeGreaterThan(0);
    expect(THRESHOLD.cashAmount).toBeGreaterThan(0);
    expect(THRESHOLD.concentrationShare).toBeGreaterThan(0.25);
  });
});
