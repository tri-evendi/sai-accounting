/**
 * Pindah SaaS → on-premise (docs/ONPREM-PINDAH-DARI-SAAS.md) — aturan murni
 * bundel (`src/lib/onprem-migration.ts`), penjaga pembekuan
 * (`@sai/core/tenant-migration`), dan bentuk skripnya.
 *
 * Bukti ujung-ke-ujung dengan basis data sungguhan ada di
 * `bun run tenant:prove-onprem` (dua server sekali-pakai); berkas ini menjaga
 * yang bisa dibuktikan tanpa server — dan yang paling mudah hilang diam-diam:
 * model kendali yang tidak diputuskan, penjaga yang tidak dipanggil, sandi di
 * argv.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BUNDLE_FORMAT,
  BUNDLE_FORMAT_VERSION,
  CONTROL_MODEL_DECISIONS,
  checksumProblems,
  decodeRows,
  encodeRows,
  exportRefusals,
  generatePassphrase,
  headMismatches,
  importRefusals,
  isSafeBundlePath,
  licenceSuggestion,
  passphraseProblem,
  trialBalanceMismatches,
  type ImportFacts,
} from "@/lib/onprem-migration";
import {
  FREEZE_SETTLE_MS,
  NOT_FROZEN_COMPANY_WHERE,
  TENANT_STATUS_MIGRATED_OUT,
  freezeSettledAt,
  migrationWriteRefusal,
} from "@sai/core/tenant-migration";
import { TENANT_STATUSES } from "@sai/core/constants";
import { MIGRATION_TERAKHIR } from "@sai/core/migration-manifest";
import { directServerUrl } from "../scripts/lib/pg-tools";
import { AKAR_REPO } from "./akar-sumber";

const baca = (rel: string) => readFileSync(join(AKAR_REPO, rel), "utf8");

describe("keputusan model kendali — tidak ada penghilangan diam-diam", () => {
  it("SETIAP model di skema kendali diputuskan ikut/tidak, dan tidak ada nama hantu", () => {
    const schema = baca("packages/db/prisma/control/schema.prisma");
    const models = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]).sort();
    expect(Object.keys(CONTROL_MODEL_DECISIONS).sort()).toEqual(models);
  });

  it("identitas & keanggotaan ikut; token, undangan, operator, antrean tidak", () => {
    expect(CONTROL_MODEL_DECISIONS.User).toBe("include");
    expect(CONTROL_MODEL_DECISIONS.Membership).toBe("include");
    expect(CONTROL_MODEL_DECISIONS.TenantMailSetting).toBe("include");
    expect(CONTROL_MODEL_DECISIONS.ApiToken).toBe("exclude");
    expect(CONTROL_MODEL_DECISIONS.Invitation).toBe("exclude");
    expect(CONTROL_MODEL_DECISIONS.OperatorAccount).toBe("exclude");
    expect(CONTROL_MODEL_DECISIONS.Job).toBe("exclude");
  });

  it("runbook menyebut setiap model di tabelnya", () => {
    const doc = baca("docs/ONPREM-PINDAH-DARI-SAAS.md");
    for (const model of Object.keys(CONTROL_MODEL_DECISIONS)) {
      expect(doc, model).toContain(`\`${model}\``);
    }
  });
});

describe("kode baris JSON", () => {
  it("tanggal pulang sebagai Date, bukan string; null & angka utuh", () => {
    const d = new Date("2026-10-22T03:04:05.678Z");
    const back = decodeRows<{ a: Date; b: null; c: number; d: { e: Date[] } }>(
      encodeRows({ a: d, b: null, c: 7, d: { e: [d] } })
    );
    expect(back.a).toBeInstanceOf(Date);
    expect(back.a.toISOString()).toBe(d.toISOString());
    expect(back.d.e[0]).toBeInstanceOf(Date);
    expect(back.b).toBeNull();
    expect(back.c).toBe(7);
  });

  it("BigInt menolak, tidak diam-diam jadi string", () => {
    expect(() => encodeRows({ n: BigInt(1) })).toThrow(/BigInt/);
  });
});

describe("sandi bundel", () => {
  it("dibangkitkan: 6×5 simbol tanpa huruf ambigu, berbeda tiap kali, lolos syarat panjang", () => {
    const a = generatePassphrase();
    expect(a).toMatch(/^([2-9A-HJKMNP-Z]{5}-){5}[2-9A-HJKMNP-Z]{5}$/);
    expect(generatePassphrase()).not.toBe(a);
    expect(passphraseProblem(a)).toBeNull();
  });

  it("kosong atau pendek ditolak", () => {
    expect(passphraseProblem("")).not.toBeNull();
    expect(passphraseProblem("pendek-sekali")).not.toBeNull();
  });
});

describe("saran lisensi", () => {
  it("batas = maks(pemakaian, kuota paket); modul all; nama dikutip aman", () => {
    const s = licenceSuggestion({
      customer: "PT O'Brien & Co",
      planKey: "pro",
      maxCompanies: 3,
      maxUsers: 10,
      companyCount: 5,
      userCount: 4,
      appVersion: "0.11.0",
    });
    expect(s.companies).toBe(5);
    expect(s.users).toBe(10);
    expect(s.command).toContain("--perusahaan 5 --pengguna 10 --modul all");
    expect(s.command).toContain(`--customer 'PT O'\\''Brien & Co'`);
  });
});

describe("kepala migration & penolakan impor", () => {
  const heads = { control: MIGRATION_TERAKHIR.control, company: MIGRATION_TERAKHIR.company };
  const base: ImportFacts = {
    manifest: { format: BUNDLE_FORMAT, formatVersion: BUNDLE_FORMAT_VERSION, appVersion: "0.11.0", migrationHeads: heads },
    expectedHeads: heads,
    targetControlHead: heads.control,
    targetCounts: { tenants: 0, users: 0, companies: 0, memberships: 0, tenantMemberships: 0 },
    existingDatabases: [],
    occupiedDocumentDirs: [],
    documentsWritable: true,
    checksumProblems: [],
    secretsPresent: true,
    encryptionKeyAvailable: true,
  };

  it("pemasangan kosong yang sevesi = tanpa penolakan", () => {
    expect(importRefusals(base)).toEqual([]);
  });

  it("versi berbeda → sebut rilis yang harus dipasang", () => {
    const r = importRefusals({ ...base, manifest: { ...base.manifest, migrationHeads: { ...heads, company: "0001_baseline" } } });
    expect(r.map((x) => x.code)).toContain("version");
    expect(r.find((x) => x.code === "version")!.message).toContain("SAI_TAG=0.11.0");
    expect(headMismatches({ control: "a", company: "b" }, { control: "a", company: "c" })).toHaveLength(1);
  });

  it("pemasangan yang sudah di-bootstrap ditolak", () => {
    const r = importRefusals({ ...base, targetCounts: { ...base.targetCounts, tenants: 1, users: 1 } });
    expect(r.map((x) => x.code)).toEqual(["target_not_empty"]);
  });

  it("kendali tujuan belum dimigrasi, buku/dokumen sudah ada, kunci hilang, volume :ro — masing-masing ditolak", () => {
    const r = importRefusals({
      ...base,
      targetControlHead: null,
      existingDatabases: ["sai_x"],
      occupiedDocumentDirs: [4],
      documentsWritable: false,
      encryptionKeyAvailable: false,
    });
    expect(r.map((x) => x.code).sort()).toEqual(
      ["database_exists", "documents_exist", "documents_readonly", "encryption_key", "target_not_migrated"].sort()
    );
  });

  it("format asing berhenti di pemeriksaan pertama", () => {
    const r = importRefusals({ ...base, manifest: { ...base.manifest, format: "lain" as typeof BUNDLE_FORMAT } });
    expect(r).toHaveLength(1);
    expect(r[0]!.code).toBe("format");
  });
});

describe("penolakan ekspor", () => {
  const heads = { control: "0010_x", company: "0002_y" };
  it("buku tertinggal migration, tak terjangkau, rahasia tak terbuka — ditolak", () => {
    const r = exportRefusals({
      tenantFound: true,
      tenantStatus: "active",
      companies: [
        { slug: "a", databaseName: "sai_a", head: "0001_z", reachable: true },
        { slug: "b", databaseName: "sai_b", head: null, reachable: false },
      ],
      controlHead: "0010_x",
      expectedHeads: heads,
      secretsReadable: false,
    });
    expect(r.map((x) => x.code).sort()).toEqual(["company_head", "company_unreachable", "secrets_unreadable"]);
  });

  it("tenant yang sudah migrated_out tidak diekspor lagi", () => {
    const r = exportRefusals({
      tenantFound: true,
      tenantStatus: "migrated_out",
      companies: [{ slug: "a", databaseName: "sai_a", head: "0002_y", reachable: true }],
      controlHead: "0010_x",
      expectedHeads: heads,
      secretsReadable: true,
    });
    expect(r.map((x) => x.code)).toEqual(["migrated_out"]);
  });
});

describe("isi bundel adalah daftar tertutup", () => {
  it("sidik jari beda, berkas hilang, dan berkas selundupan — semuanya disebut", () => {
    expect(checksumProblems({ "a.json": "1", "b.json": "2" }, { "a.json": "1", "b.json": "3", "c.sh": "4" })).toEqual([
      "b.json: sidik jari tidak cocok",
      "c.sh: tidak diumumkan manifes",
    ]);
    expect(checksumProblems({ "a.json": "1" }, {})).toEqual(["a.json: diumumkan manifes tetapi tidak ada"]);
  });

  it("jalur aman hanya bentuk yang dikenal; traversal & nama aneh ditolak", () => {
    expect(isSafeBundlePath("companies/sai_t4_alpha.pgdump")).toBe(true);
    expect(isSafeBundlePath("documents/12/0a1b2c3d-1111-2222-3333-444455556666.pdf")).toBe(true);
    expect(isSafeBundlePath("../etc/passwd")).toBe(false);
    expect(isSafeBundlePath("companies/../../x.pgdump")).toBe(false);
    expect(isSafeBundlePath("documents/0/x.pdf")).toBe(false);
    expect(isSafeBundlePath("lain.json")).toBe(false);
  });
});

describe("neraca saldo ringkas", () => {
  it("selisih satu sen pada satu akun tertangkap", () => {
    const a = { rows: [["110101", "100.00", "0.00"]] as Array<[string, string, string]>, totalDebit: "100.00", totalCredit: "0.00" };
    const b = { rows: [["110101", "100.01", "0.00"]] as Array<[string, string, string]>, totalDebit: "100.01", totalCredit: "0.00" };
    expect(trialBalanceMismatches(a, a)).toEqual([]);
    expect(trialBalanceMismatches(a, b)).toHaveLength(2);
  });
});

describe("penjaga pembekuan", () => {
  it("beku: baca & ekspor boleh, tulis ditolak dengan kalimatnya sendiri", () => {
    const frozen = { status: "active", frozenAt: new Date() };
    expect(migrationWriteRefusal(frozen, "journal.read")).toBeNull();
    expect(migrationWriteRefusal(frozen, "report.export")).toBeNull();
    const r = migrationWriteRefusal(frozen, "journal.write");
    expect(r?.code).toBe("tenant_frozen");
    expect(r?.message).not.toMatch(/langganan/i);
  });

  it("migrated_out menolak tulis meski frozen_at kosong; tenant biasa & tanpa tenant lolos", () => {
    expect(migrationWriteRefusal({ status: TENANT_STATUS_MIGRATED_OUT, frozenAt: null }, "x.write")).not.toBeNull();
    expect(migrationWriteRefusal({ status: "active", frozenAt: null }, "x.write")).toBeNull();
    expect(migrationWriteRefusal(null, "x.write")).toBeNull();
  });

  it("jam tunggu ekspor > TTL cache status 60 detik", () => {
    expect(FREEZE_SETTLE_MS).toBeGreaterThan(60_000);
    const t = new Date("2026-10-22T00:00:00Z");
    expect(freezeSettledAt(t).getTime() - t.getTime()).toBe(FREEZE_SETTLE_MS);
  });

  it("`migrated_out` ada di kosakata status tenant", () => {
    expect(TENANT_STATUSES).toContain(TENANT_STATUS_MIGRATED_OUT);
  });

  it("KEDUA penjaga memanggilnya — halaman dan API", () => {
    expect(baca("src/lib/page-auth.ts")).toMatch(/migrationWriteRefusal\(tenantState, permission\)/);
    expect(baca("src/lib/auth-guard.ts")).toMatch(/migrationWriteRefusal\(tenantState, permission\)/);
  });

  it("status tenant untuk penjaga membawa frozenAt", () => {
    expect(baca("packages/platform/src/tenant-state.ts")).toMatch(/frozenAt: company\.tenant\.frozenAt/);
  });

  it("penerbit & pelaksana dokumen berulang melewati tenant beku", () => {
    expect(NOT_FROZEN_COMPANY_WHERE.OR).toHaveLength(2);
    for (const f of ["scripts/publish-recurring.ts", "scripts/run-recurring.ts"]) {
      expect(baca(f), f).toMatch(/isActive: true, isDemo: false, \.\.\.NOT_FROZEN_COMPANY_WHERE/);
    }
  });

  it("login tenant migrated_out dijawab kalimatnya sendiri", () => {
    expect(baca("src/lib/auth.ts")).toMatch(/throw new Error\("TenantMigratedOut"\)/);
    expect(baca("src/app/(app)/(auth)/login/page.tsx")).toMatch(/TenantMigratedOut[\s\S]*auth\.login\.migratedOut/);
  });
});

describe("skripnya", () => {
  const ekspor = baca("scripts/tenant-export-onprem.ts");
  const impor = baca("scripts/tenant-import-onprem.ts");
  const io = baca("scripts/lib/bundle-io.ts");

  it("sandi bundel tidak pernah lewat argv: `openssl -pass env:`, dan env asal dibuang dari proses anak", () => {
    expect(io).toMatch(/"-pass", `env:\$\{CHILD_PASS_ENV\}`/);
    expect(io).toMatch(/delete env\[PASSPHRASE_ENV\]/);
    expect(io).not.toMatch(/"-pass", `pass:/);
  });

  it("sandi tidak ditulis ke berkas mana pun oleh ekspor", () => {
    expect(ekspor).not.toMatch(/writeFile\([^)]*passphrase/);
  });

  it("ekspor membekukan SEBELUM dump, dan dump hanya lewat server langsung", () => {
    expect(ekspor.indexOf("freezeTenant(")).toBeGreaterThan(0);
    expect(ekspor.indexOf("freezeTenant(")).toBeLessThan(ekspor.indexOf("dumpToFile("));
    expect(ekspor).not.toMatch(/const server = instanceServerUrl\(/);
  });

  it("impor: semua penolakan diperiksa sebelum restore; registry kendali ditulis TERAKHIR, dalam satu transaksi", () => {
    expect(impor.indexOf("importRefusals(")).toBeLessThan(impor.indexOf("restoreFromFile("));
    expect(impor.indexOf("restoreFromFile(")).toBeLessThan(impor.indexOf("control.$transaction("));
    expect(impor.indexOf("countMismatches(")).toBeLessThan(impor.indexOf("control.$transaction("));
    expect(impor.indexOf("trialBalanceMismatches(")).toBeLessThan(impor.indexOf("control.$transaction("));
  });

  it("terdaftar di package.json, masing-masing dengan catatan", () => {
    const pkg = JSON.parse(baca("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["tenant:export-onprem"]).toBe("tsx scripts/tenant-export-onprem.ts");
    expect(pkg.scripts["tenant:import-onprem"]).toBe("tsx scripts/tenant-import-onprem.ts");
    expect(pkg.scripts["tenant:mark-migrated-out"]).toBe("tsx scripts/tenant-onprem-cutover.ts mark-migrated-out");
    expect(pkg.scripts["tenant:unfreeze"]).toBe("tsx scripts/tenant-onprem-cutover.ts unfreeze");
    for (const k of ["export_onprem", "import_onprem", "mark_migrated_out", "unfreeze", "prove_onprem"]) {
      expect(pkg.scripts[`_tenant_${k}_note`], k).toBeTruthy();
    }
  });

  it("bundel tidak pernah ikut ke git maupun image", () => {
    expect(baca(".gitignore")).toMatch(/^\*\.saibundle$/m);
    expect(baca(".dockerignore")).toMatch(/^\*\*\/\*\.saibundle$/m);
  });
});

describe("server langsung untuk pg_dump", () => {
  it("PgBouncer dialihkan ke DATABASE_URL langsung; tanpa jalan langsung MELEMPAR", () => {
    const bouncer = new URL("postgres://u:p@pgbouncer:5432/sai_control");
    expect(directServerUrl(bouncer, { DATABASE_URL: "postgres://u:p@pg:5432/sai_production" } as unknown as NodeJS.ProcessEnv).hostname).toBe("pg");
    expect(() => directServerUrl(bouncer, {} as unknown as NodeJS.ProcessEnv)).toThrow(/PgBouncer/);
    expect(() =>
      directServerUrl(bouncer, { DATABASE_URL: "postgres://u:p@pgbouncer:5432/x" } as unknown as NodeJS.ProcessEnv)
    ).toThrow(/PgBouncer/);
    const direct = new URL("postgres://u:p@pg:5432/sai_control");
    expect(directServerUrl(direct, {} as unknown as NodeJS.ProcessEnv)).toBe(direct);
  });
});
