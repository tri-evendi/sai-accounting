/**
 * PAGAR MATERIALITAS: SATU FIKSTUR, DUA BAHASA (23 Okt 2026).
 *
 * `services/integrator/internal/conformance/testdata/materiality_fixtures.json`
 * dibaca DI SINI dan di `internal/conformance/materiality_test.go`. Tes ini
 * membuktikan isi fikstur = keluaran `src/lib/materiality.ts`; tes Go
 * membuktikan isi fikstur = keluaran kembaran Go-nya. Keduanya hijau = kedua
 * pemeriksa kesesuaian menuduh akun yang SAMA dengan kalimat yang SAMA —
 * sampai ke `toFixed` pada seri tepat (6,25% → "6.3"), lipatan huruf ASCII
 * (`ſundry` bukan `sundry`), dan NBSP di nama akun.
 *
 * Fikstur yang basi karena aturan TS berubah: perbarui `expect`-nya dari
 * keluaran TS yang baru (yang dibandingkan tes ini), lalu jalankan
 * `bun run go:test` — Go yang belum ikut berubah akan merah di sana.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CATCH_ALL_THRESHOLD,
  assessCatchAllExpenses,
  describeCatchAllFinding,
  describeUntaggedExpense,
  findUntaggedMaterialExpenses,
  isCatchAllName,
  type ExpenseAccountTotal,
} from "@/lib/materiality";
import { MATERIALITY_CATCH_ALL_THRESHOLD } from "@sai/core/generated/accounting";
import { AKAR_REPO } from "./akar-sumber";

interface Kasus {
  name: string;
  threshold: number | null;
  accounts: ExpenseAccountTotal[];
  expect: {
    names: boolean[];
    catchAll: { totalExpense: number; findings: unknown[]; labels: string[] };
    untagged: { totalExpense: number; findings: unknown[]; labels: string[] };
  };
}

const FIKSTUR = join(
  AKAR_REPO,
  "services/integrator/internal/conformance/testdata/materiality_fixtures.json"
);
const { cases } = JSON.parse(readFileSync(FIKSTUR, "utf8")) as { cases: Kasus[] };

describe("fikstur materialitas bersama", () => {
  it("memuat cukup kasus, termasuk tepian yang membedakan JS dari Go", () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
    const label = cases.flatMap((k) => [...k.expect.catchAll.labels, ...k.expect.untagged.labels]);
    expect(label.some((l) => l.includes("(6.3% dari total beban)")), "seri toFixed").toBe(true);
    expect(cases.some((k) => k.accounts.some((a) => a.name.includes("ſ")))).toBe(true);
    expect(cases.some((k) => k.accounts.some((a) => a.name.includes(" ")))).toBe(true);
  });

  it("ambang bawaan TS = ambang kontrak", () => {
    expect(DEFAULT_CATCH_ALL_THRESHOLD).toBe(MATERIALITY_CATCH_ALL_THRESHOLD);
  });

  for (const k of cases) {
    it(k.name, () => {
      const opsi = k.threshold === null ? {} : { threshold: k.threshold };
      expect(k.accounts.map((a) => isCatchAllName(a.name))).toEqual(k.expect.names);

      const ca = assessCatchAllExpenses(k.accounts, opsi);
      expect(ca.totalExpense).toBe(k.expect.catchAll.totalExpense);
      expect(ca.findings).toEqual(k.expect.catchAll.findings);
      expect(ca.findings.map(describeCatchAllFinding)).toEqual(k.expect.catchAll.labels);

      const un = findUntaggedMaterialExpenses(k.accounts, opsi);
      expect(un.totalExpense).toBe(k.expect.untagged.totalExpense);
      expect(un.findings).toEqual(k.expect.untagged.findings);
      expect(un.findings.map(describeUntaggedExpense)).toEqual(k.expect.untagged.labels);
    });
  }
});
