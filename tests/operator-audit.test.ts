/**
 * JEJAK AUDIT konsol operator: jejak operator pindah ke tabel (migration
 * platform 0002) dan jejak tenant akhirnya TERBACA (lintas tenant + per tenant).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const platformCalls: { op: string; args: unknown }[] = [];
let platformRows: Record<string, unknown>[] = [];
let platformCreateFails = false;

vi.mock("@/lib/platform-db", () => ({
  platformDb: {
    operatorAuditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        platformCalls.push({ op: "create", args });
        if (platformCreateFails) throw new Error("platform mati");
        return args.data;
      },
      findMany: async (args: unknown) => {
        platformCalls.push({ op: "findMany", args });
        return platformRows;
      },
      count: async () => platformRows.length,
    },
  },
}));

const controlCalls: { op: string; args: unknown }[] = [];
vi.mock("@sai/core/control-db", () => ({
  controlDb: {
    tenantAuditLog: {
      findMany: async (args: unknown) => {
        controlCalls.push({ op: "findMany", args });
        return [];
      },
      count: async (args: unknown) => {
        controlCalls.push({ op: "count", args });
        return 0;
      },
    },
  },
}));

import { readOperatorAuditPage, writeOperatorAuditLog } from "@/lib/operator/audit";
import { operatorAuditRowFromLegacy } from "@/lib/operator/audit-legacy";
import { TENANT_AUDIT_GROUPS } from "@/lib/operator/audit-groups";
import { readTenantAuditFeed } from "@/lib/tenant-audit";

beforeEach(() => {
  platformCalls.length = 0;
  controlCalls.length = 0;
  platformRows = [];
  platformCreateFails = false;
});

describe("jejak operator di tabel, bukan di berkas", () => {
  it("menulis satu baris ke operator_audit_logs; rincian sebagai teks JSON", async () => {
    await writeOperatorAuditLog({
      operator: "vyn",
      action: "operator.login",
      details: { via: "totp" },
      ipAddress: "10.0.0.1",
    });
    expect(platformCalls).toEqual([
      {
        op: "create",
        args: {
          data: {
            operator: "vyn",
            action: "operator.login",
            details: '{"via":"totp"}',
            ipAddress: "10.0.0.1",
          },
        },
      },
    ]);
  });

  it("platform mati: menulis GAGAL-LUNAK — masuk konsol tidak ikut gagal", async () => {
    platformCreateFails = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      writeOperatorAuditLog({ operator: "vyn", action: "operator.logout" })
    ).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledOnce();
    err.mockRestore();
  });

  it("membaca terbaru dulu dengan pemutus seri id, dipaginasi di SQL; rincian rusak tidak menggagalkan", async () => {
    platformRows = [
      {
        id: 9,
        operator: "vyn",
        action: "operator.mail.update",
        details: "{rusak",
        ipAddress: null,
        createdAt: new Date("2026-10-17T01:00:00Z"),
      },
    ];
    const page = await readOperatorAuditPage({ limit: 50, skip: 100 });
    expect(platformCalls[0]).toEqual({
      op: "findMany",
      args: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: 100, take: 50 },
    });
    expect(page).toEqual({
      entries: [
        {
          id: "9",
          operator: "vyn",
          action: "operator.mail.update",
          details: undefined,
          ipAddress: null,
          createdAt: "2026-10-17T01:00:00.000Z",
        },
      ],
      total: 1,
    });
  });

  it("modulnya tidak lagi menyentuh sistem berkas", () => {
    /* Kembalinya `appendFile` berarti jejak kembali terikat pada satu volume —
       persis yang menghalangi pemisahan `apps/operator` (dok 14 §5). */
    const isi = readFileSync(join(process.cwd(), "src/lib/operator/audit.ts"), "utf8");
    expect(isi).not.toMatch(/from\s+["']node:fs/);
    expect(isi).toMatch(/platformDb\.operatorAuditLog/);
  });
});

describe("pemindahan JSONL lama (operatorAuditRowFromLegacy)", () => {
  const SAH = {
    id: "1760000000000-abc1234",
    operator: "vyn",
    action: "operator.login",
    details: { a: 1 },
    ipAddress: "10.0.0.1",
    createdAt: "2026-08-09T12:00:00.000Z",
  };

  it("entri sah → baris dengan legacy_id dan WAKTU ASLINYA", () => {
    expect(operatorAuditRowFromLegacy(SAH)).toEqual({
      legacyId: "1760000000000-abc1234",
      operator: "vyn",
      action: "operator.login",
      details: '{"a":1}',
      ipAddress: "10.0.0.1",
      createdAt: new Date("2026-08-09T12:00:00.000Z"),
      updatedAt: new Date("2026-08-09T12:00:00.000Z"),
    });
  });

  it.each([
    ["tanpa id (pegangan idempotensi)", { ...SAH, id: undefined }],
    ["tanpa aksi", { ...SAH, action: undefined }],
    ["waktu rusak — tidak dipalsukan jadi 'sekarang'", { ...SAH, createdAt: "kemarin" }],
    ["tanpa waktu", { ...SAH, createdAt: undefined }],
  ])("%s → dilewati", (_n, entry) => {
    expect(operatorAuditRowFromLegacy(entry)).toBeNull();
  });
});

describe("jejak tenant lintas tenant", () => {
  it("saringan tenant + kelompok menjadi WHERE; tanpa saringan = semua tenant", async () => {
    await readTenantAuditFeed({ tenantSlug: "pt-a", actionPrefix: "tenant.deletion." }, { limit: 10 });
    expect(controlCalls[0]).toMatchObject({
      op: "findMany",
      args: {
        where: { tenantSlug: "pt-a", action: { startsWith: "tenant.deletion." } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 10,
        skip: 0,
      },
    });

    controlCalls.length = 0;
    await readTenantAuditFeed({});
    expect(controlCalls[0]).toMatchObject({ args: { where: {} } });
  });

  it("setiap kelompok saringan mencocokkan minimal satu tindakan yang ADA", () => {
    /* Kelompok yang tidak cocok apa pun adalah opsi saringan yang selalu
       kosong — terbaca sebagai "tidak pernah terjadi". */
    const sumber = readFileSync(join(process.cwd(), "src/lib/tenant-audit.ts"), "utf8");
    const union = sumber.slice(
      sumber.indexOf("export type TenantAuditAction"),
      sumber.indexOf("export interface TenantAuditEntry")
    );
    const tindakan = [...union.matchAll(/\|\s*"([a-z_.]+)"/g)].map((m) => m[1]);
    expect(tindakan.length).toBeGreaterThan(15);
    for (const g of TENANT_AUDIT_GROUPS) {
      expect(tindakan.some((a) => a.startsWith(g)), g).toBe(true);
    }
    /* Dan sebaliknya: setiap tindakan masuk SATU kelompok, jadi tidak ada
       peristiwa yang hanya terlihat lewat "Semua tindakan". */
    for (const a of tindakan) {
      expect(TENANT_AUDIT_GROUPS.some((g) => a.startsWith(g)), a).toBe(true);
    }
  });
});
