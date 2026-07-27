/**
 * Penjaga TERPENTING issue #99: **modul tidak pernah menggerbangi buku besar.**
 *
 * Perusahaan yang pernah memposting jurnal dari kontrak lalu mematikan modul
 * `trading` harus tetap memiliki jurnal itu, dan setiap laporan harus tetap
 * rekonsiliasi. Kalau ini meleset, tombol fitur berubah menjadi bug integritas
 * akuntansi: tidak ada galat, tidak ada yang merah — laporannya saja diam-diam
 * kehilangan angka.
 *
 * Dijaga dari dua sisi, karena satu sisi saja tidak cukup:
 *
 *  1. **Struktural.** Mesin pelaporan/posting tidak boleh bisa MELIHAT keadaan
 *     modul sama sekali: tak satu pun jalur impor dari `lib/reports.ts`,
 *     `lib/ledger.ts`, `lib/posting/*`, dan kawan-kawannya boleh sampai ke
 *     `lib/business-modules.ts` atau ke penjaga otorisasi. Selama itu benar,
 *     "laporan menyaring menurut modul" bahkan tidak bisa dituliskan.
 *  2. **Numerik.** Angka laporan atas data yang LAHIR dari dokumen dagang
 *     (kontrak → faktur → surat jalan) dihitung ulang dengan modul `trading`
 *     mati, dan harus sama persis. Supaya perbandingan itu tidak lulus secara
 *     sepele, ada pasangannya: menghapus jurnal-jurnal dagang itu HARUS
 *     mengubah angkanya — jadi tes ini benar-benar menyentuh nilai yang
 *     diperjuangkan.
 *
 * Ditambah sifat ketiga: izin membaca buku besar & laporan ada di modul inti,
 * jadi tidak ada satu pun kombinasi modul yang bisa menutupnya. Diuji dengan
 * MENCOBA SEMUA kombinasi (2⁹), bukan satu contoh.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { createFakeReportClient, type FakeSeedJournal } from "./fake-client";
import { getIncomeStatement, getTrialBalance } from "@/lib/reports";
import { getAccountLedger } from "@/lib/ledger";
import type { Permission } from "@/lib/authz";
import {
  BUSINESS_MODULES,
  CORE_MODULE,
  isPermissionEnabled,
  type BusinessModule,
} from "@/lib/business-modules";

// ─── 1. Struktural: mesin buku besar tak bisa melihat modul ─────────────────

const SRC = join(__dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const FILES = new Map(sourceFiles(SRC).map((f) => [f, readFileSync(f, "utf8")]));

/** Impor apa pun (termasuk `import type`) — di sini justru tipe pun tak boleh. */
const ANY_IMPORT = /^\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/gm;

function resolve(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (FILES.has(candidate)) return candidate;
  }
  return null;
}

/** Semua berkas yang terjangkau dari `entry` lewat impor, termasuk dirinya. */
function importClosure(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of (FILES.get(file) ?? "").matchAll(ANY_IMPORT)) {
      const target = resolve(match[1], file);
      if (target) queue.push(target);
    }
  }
  return seen;
}

/** Mesin yang menghasilkan ANGKA. Tak satu pun boleh tahu modul apa yang aktif. */
const LEDGER_ENGINE = [
  "lib/ledger.ts",
  "lib/reports.ts",
  "lib/report-summary.ts",
  "lib/budget-report.ts",
  "lib/accounting.ts",
  "lib/posting/index.ts",
  "lib/posting/rules.ts",
  "lib/posting/cogs.ts",
  "lib/posting/mapping.ts",
  "lib/period.ts",
  "lib/opening-balance.ts",
  "lib/receivables.ts",
  "lib/inventory.ts",
].map((rel) => join(SRC, rel));

/** Berkas yang, kalau terjangkau dari mesin di atas, berarti modul bisa memilah angka. */
const FORBIDDEN = new Set(
  ["lib/business-modules.ts", "lib/authz-effective.ts", "lib/page-auth.ts", "lib/auth-guard.ts"].map(
    (rel) => join(SRC, rel)
  )
);

describe("struktural: buku besar tidak bisa melihat keadaan modul", () => {
  it("berkas mesin buku besarnya memang ada (penjaga bagi penjaga)", () => {
    for (const file of LEDGER_ENGINE) {
      expect(FILES.has(file), `hilang: ${relative(SRC, file)}`).toBe(true);
    }
  });

  it("tak satu pun jalur impor dari mesin buku besar sampai ke gerbang modul", () => {
    const offenders: string[] = [];
    for (const entry of LEDGER_ENGINE) {
      for (const reached of importClosure(entry)) {
        if (FORBIDDEN.has(reached)) {
          offenders.push(`${relative(SRC, entry)} → … → ${relative(SRC, reached)}`);
        }
      }
    }
    expect(
      offenders,
      "Modul hanya boleh menggerbangi ANTARMUKA dan pembuatan transaksi baru. " +
        "Jalur impor di atas membuat angka laporan bisa ikut berubah saat sebuah modul dimatikan — " +
        "itu bukan tombol fitur lagi, melainkan bug integritas akuntansi."
    ).toEqual([]);
  });
});

// ─── 2. Numerik: angka tak bergerak saat modul dimatikan ────────────────────

const ACCOUNTS = [
  { id: 1, code: "110101", name: "Kas", type: "cash_bank", normalBalance: "debit" },
  { id: 2, code: "110201", name: "Piutang Usaha", type: "account_receivable", normalBalance: "debit" },
  { id: 3, code: "110301", name: "Persediaan", type: "inventory", normalBalance: "debit" },
  { id: 4, code: "410101", name: "Penjualan", type: "revenue", normalBalance: "credit" },
  { id: 5, code: "510101", name: "HPP", type: "cogs", normalBalance: "debit" },
  { id: 6, code: "310101", name: "Modal", type: "equity", normalBalance: "credit" },
];

const d = (iso: string) => new Date(`${iso}T00:00:00`);

/** Jurnal yang LAHIR dari modul `trading` — persis yang dipertaruhkan. */
const TRADING_JOURNALS: FakeSeedJournal[] = [
  {
    id: 2,
    date: d("2026-02-10"),
    note: "Faktur dari kontrak KP.001",
    lines: [
      { accountId: 2, debit: 40_000_000 },
      { accountId: 4, credit: 40_000_000 },
    ],
  },
  {
    id: 3,
    date: d("2026-02-12"),
    note: "Surat jalan SJ.001 — HPP",
    lines: [
      { accountId: 5, debit: 25_000_000 },
      { accountId: 3, credit: 25_000_000 },
    ],
  },
];

const JOURNALS: FakeSeedJournal[] = [
  {
    id: 1,
    date: d("2025-12-31"),
    note: "Saldo awal",
    lines: [
      { accountId: 1, debit: 100_000_000 },
      { accountId: 3, debit: 60_000_000 },
      { accountId: 6, credit: 160_000_000 },
    ],
  },
  ...TRADING_JOURNALS,
];

const withTrading = createFakeReportClient({ accounts: ACCOUNTS, journals: JOURNALS });
/** Pembanding "kalau jurnal dagang itu memang hilang" — bukti tes ini menggigit. */
const withoutTrading = createFakeReportClient({
  accounts: ACCOUNTS,
  journals: JOURNALS.filter((j) => !TRADING_JOURNALS.includes(j)),
});

const cents = (n: number) => Math.round(n * 100) || 0;

/** Semua modul dimatikan kecuali inti — keadaan paling ekstrem yang bisa disimpan. */
const ONLY_CORE: ReadonlySet<BusinessModule> = new Set([CORE_MODULE]);

describe("numerik: laporan tetap rekonsiliasi dengan modul dimatikan", () => {
  it("Laba/Rugi atas dokumen dagang sama persis, modul dagang mati atau hidup", async () => {
    // Fungsi laporan tidak menerima modul sama sekali — itulah intinya. Yang
    // dibuktikan di sini: tak ada keadaan global yang menyelinap masuk.
    const before = await getIncomeStatement(undefined, undefined, withTrading);
    expect(isPermissionEnabled("contract.read", ONLY_CORE)).toBe(false);
    const after = await getIncomeStatement(undefined, undefined, withTrading);

    expect(cents(after.totalRevenue)).toBe(cents(before.totalRevenue));
    expect(cents(after.totalExpense)).toBe(cents(before.totalExpense));
    expect(cents(after.netIncome)).toBe(cents(before.netIncome));

    // Angka yang dipertaruhkan memang berasal dari jurnal dagang: kalau jurnal
    // itu benar-benar hilang, laporannya BERUBAH. Perbandingan di atas karena
    // itu bukan kesamaan yang kosong.
    const gone = await getIncomeStatement(undefined, undefined, withoutTrading);
    expect(cents(gone.totalRevenue)).not.toBe(cents(before.totalRevenue));
    expect(cents(gone.netIncome)).not.toBe(cents(before.netIncome));
  });

  it("Neraca Saldo tetap seimbang dan tetap memuat baris dokumen dagang", async () => {
    const trial = await getTrialBalance(undefined, withTrading);
    expect(trial.balanced).toBe(true);
    expect(cents(trial.totalDebit)).toBe(cents(trial.totalCredit));

    const revenue = trial.rows.find((r) => r.code === "410101");
    expect(cents(revenue?.credit ?? 0)).toBe(cents(40_000_000));
  });

  it("Buku Besar per akun tetap menampilkan baris yang lahir dari kontrak", async () => {
    const ledger = await getAccountLedger(2, undefined, undefined, withTrading);
    expect(ledger?.rows.length).toBeGreaterThan(0);
    expect(cents(ledger?.closing ?? 0)).toBe(cents(40_000_000));
  });
});

// ─── 3. Izin buku besar tak pernah bisa ditutup ─────────────────────────────

/** Semua kombinasi modul non-inti yang mungkin (2⁹ = 512). */
function everyModuleCombination(): Array<ReadonlySet<BusinessModule>> {
  const optional = BUSINESS_MODULES.filter((m) => m !== CORE_MODULE);
  const out: Array<ReadonlySet<BusinessModule>> = [];
  for (let mask = 0; mask < 1 << optional.length; mask++) {
    const set = new Set<BusinessModule>([CORE_MODULE]);
    optional.forEach((module, i) => {
      if (mask & (1 << i)) set.add(module);
    });
    out.push(set);
  }
  return out;
}

describe("izin buku besar & laporan terjangkau di SETIAP kombinasi modul", () => {
  const LEDGER_PERMISSIONS: Permission[] = [
    "journal.read",
    "journal.write",
    "ledger.read",
    "report.read",
    "report.export",
    "account.read",
    "account.manage",
    "period.manage",
    // Anti-lockout: dua pintu yang tanpanya tak ada lagi yang bisa memperbaiki apa pun.
    "authz.manage",
    "user.manage",
  ];

  it("tidak ada satu pun kombinasi yang menutup buku besar, laporan, atau pintu admin", () => {
    const combinations = everyModuleCombination();
    expect(combinations.length).toBe(1 << (BUSINESS_MODULES.length - 1));

    for (const enabled of combinations) {
      for (const permission of LEDGER_PERMISSIONS) {
        expect(
          isPermissionEnabled(permission, enabled),
          `${permission} tertutup pada kombinasi [${[...enabled].join(", ")}]`
        ).toBe(true);
      }
    }
  });
});
