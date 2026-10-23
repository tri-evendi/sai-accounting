/**
 * PENJAGA gerbang skema PER PERUSAHAAN (09 §6, `src/lib/company-schema-gate.ts`).
 *
 * Sejak `db:migrate:release` membiarkan rilis lanjut walau sebagian buku gagal
 * dimigrasikan, gerbang inilah satu-satunya yang mencegah image baru menulis
 * ke buku yang skemanya lama. Dua hal dijaga:
 *
 *   1. PERILAKUNYA — vonis mana yang menutup, apa yang di-cache dan berapa
 *      lama, dan bahwa buku yang baru termigrasi terbuka tanpa restart;
 *   2. PEMASANGANNYA — proxy `prisma`, penjaga halaman, penjaga API sesi &
 *      token, dan setiap halaman berpenjaga-sendiri. Gerbang yang lupa
 *      dipasang di satu jalan masuk tidak menghasilkan galat apa pun sampai
 *      buku tertinggal pertama ditulisi kode baru.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATION_TERAKHIR } from "@sai/core/migration-manifest";
import { AKAR_REPO, berkasSumber } from "./akar-sumber";

const state = vi.hoisted(() => ({
  /** Baris `_prisma_migrations` yang dipulangkan per basis data, atau Error. */
  rows: new Map<string, unknown>(),
  queries: [] as string[],
}));

vi.mock("@/lib/company-clients", () => ({
  getCompanyClient: ({ databaseName }: { databaseName: string }) => ({
    $queryRawUnsafe: async () => {
      state.queries.push(databaseName);
      const r = state.rows.get(databaseName);
      if (r instanceof Error) throw r;
      return r;
    },
  }),
}));

const gate = await import("@/lib/company-schema-gate");

const HEAD = MIGRATION_TERAKHIR.company;
const PT = (databaseName: string, companyId = 1) => ({
  companyId,
  slug: databaseName.replace(/^sai_/, ""),
  databaseName,
  dbInstance: null,
});
const riwayat = (terakhir: string | null, menggantung = 0) => [
  { terapan: BigInt(3), menggantung: BigInt(menggantung), terakhir },
];

beforeEach(() => {
  gate.resetCompanySchemaGate();
  state.rows.clear();
  state.queries.length = 0;
});
afterEach(() => vi.useRealTimers());

describe("vonis — hanya TERTINGGAL dan MENGGANTUNG yang menutup", () => {
  it.each([
    ["di kepala", riwayat(HEAD), true, "mutakhir"],
    ["mendahului image (rollback disengaja)", riwayat("9999_masa_depan"), true, "mendahului"],
    ["tertinggal", riwayat("0000_lama"), false, "tertinggal"],
    ["menggantung", riwayat(HEAD, 1), false, "menggantung"],
    ["tak terbaca", new Error("koneksi putus"), true, "tak_terbaca"],
  ])("%s", async (_n, rows, serve, status) => {
    state.rows.set("sai_a", rows);
    const v = await gate.companySchemaVerdict(PT("sai_a"));
    expect(v.serve).toBe(serve);
    expect(v.status).toBe(status);
    expect(v.expected).toBe(HEAD);
  });

  it("buku tertinggal → assert MELEMPAR CompanySchemaBehindError 503", async () => {
    state.rows.set("sai_a", riwayat("0000_lama"));
    const err = await gate.assertCompanySchemaServable(PT("sai_a")).catch((e) => e);
    expect(err).toBeInstanceOf(gate.CompanySchemaBehindError);
    expect(err.status).toBe(503);
    expect(err.message).toContain("perusahaan lain tidak terpengaruh");
  });
});

describe("cache — satu query per buku per proses di jalan sehat", () => {
  it("vonis `mutakhir` tidak pernah ditanya ulang", async () => {
    vi.useFakeTimers();
    state.rows.set("sai_a", riwayat(HEAD));
    await gate.companySchemaVerdict(PT("sai_a"));
    vi.advanceTimersByTime(24 * 3_600_000);
    await gate.companySchemaVerdict(PT("sai_a"));
    expect(state.queries).toEqual(["sai_a"]);
  });

  it("buku yang tertinggal TERBUKA sendiri begitu termigrasi — tanpa restart", async () => {
    vi.useFakeTimers();
    state.rows.set("sai_a", riwayat("0000_lama"));
    expect((await gate.companySchemaVerdict(PT("sai_a"))).serve).toBe(false);
    state.rows.set("sai_a", riwayat(HEAD));
    /* Masih di dalam jendela — vonis lama dipakai. */
    expect((await gate.companySchemaVerdict(PT("sai_a"))).serve).toBe(false);
    vi.advanceTimersByTime(gate.RETRY_MS + 1);
    expect((await gate.companySchemaVerdict(PT("sai_a"))).serve).toBe(true);
  });

  it("pertanyaan serentak atas buku yang sama → SATU query", async () => {
    state.rows.set("sai_a", riwayat(HEAD));
    await Promise.all(Array.from({ length: 20 }, () => gate.companySchemaVerdict(PT("sai_a"))));
    expect(state.queries).toEqual(["sai_a"]);
  });

  it("dikunci per perusahaan — buku lain tidak meminjam vonis", async () => {
    state.rows.set("sai_a", riwayat(HEAD));
    state.rows.set("sai_b", riwayat("0000_lama"));
    expect((await gate.companySchemaVerdict(PT("sai_a", 1))).serve).toBe(true);
    expect((await gate.companySchemaVerdict(PT("sai_b", 2))).serve).toBe(false);
  });
});

/* ══ PEMASANGAN ══════════════════════════════════════════════════════════════ */

const baca = (rel: string) => readFileSync(join(AKAR_REPO, rel), "utf8");

describe("gerbang terpasang di setiap jalan masuk ke buku", () => {
  it("proxy `prisma`: klien primary DAN jalur replika lewat gerbang", () => {
    const src = baca("src/lib/prisma.ts");
    const primer = src.slice(src.indexOf("export async function currentCompanyClient"));
    expect(primer.slice(0, 600)).toMatch(/await assertCompanySchemaServable\(company\)[\s\S]*getCompanyClient\(company\)/);
    const replika = src.slice(src.indexOf("async function clientForCall"));
    expect(replika.slice(0, 600)).toMatch(/assertCompanySchemaServable\(company\)[\s\S]*routeReadClient\(company\)/);
  });

  it("penjaga halaman: sesudah kunci buku, SEBELUM gerbang yang membaca buku", () => {
    const src = baca("src/lib/page-auth.ts");
    const badan = src.slice(src.indexOf("async function gateAfterCompany"));
    const kunci = badan.indexOf("await requireUnlockedCompany(");
    const skema = badan.indexOf("await requireCompanySchemaReady(");
    const setup = badan.indexOf("await requireSetupDone(");
    expect(kunci).toBeGreaterThan(-1);
    expect(skema).toBeGreaterThan(kunci);
    expect(setup).toBeGreaterThan(skema);
  });

  it("penjaga API sesi: PALING AWAL di gateAfterCompany (gerbang modul membaca buku)", () => {
    const src = baca("src/lib/auth-guard.ts");
    const badan = src.slice(src.indexOf("async function gateAfterCompany"));
    const skema = badan.indexOf("companySchemaRefusal(");
    expect(skema).toBeGreaterThan(-1);
    expect(skema).toBeLessThan(badan.indexOf("isModuleActiveFor("));
  });

  it("penjaga token `/api/v1`: sesudah konteks ditanam, sebelum izin", () => {
    const src = baca("src/lib/api-token-guard.ts");
    const skema = src.indexOf("await companySchemaRefusal(context)");
    expect(skema).toBeGreaterThan(src.indexOf("enterCompanyContext(context)"));
    expect(skema).toBeLessThan(src.indexOf("canEffective("));
  });

  it("setiap halaman yang memanggil requireUnlockedCompany juga memanggil requireCompanySchemaReady", () => {
    const pelanggar: string[] = [];
    for (const { rel, isi } of berkasSumber([".ts", ".tsx"])) {
      if (rel.endsWith("lib/page-auth.ts")) continue;
      if (!isi.includes("requireUnlockedCompany(")) continue;
      if (!isi.includes("requireCompanySchemaReady(")) pelanggar.push(rel);
    }
    expect(pelanggar).toEqual([]);
  });

  it("layar tujuan tidak bisa menjadi pengalihan terbuka", () => {
    const src = baca("src/app/(app)/(auth)/book-updating/page.tsx");
    expect(src).toMatch(/isValidSlug\(tenant\) && isValidSlug\(company\)/);
    expect(src).toMatch(/tenantPath\(tenant, company, "\/dashboard"\)/);
    expect(src).not.toMatch(/searchParams[\s\S]*next/);
  });
});
