/**
 * Serialisasi ekspor CSV (issue #142) — yang dikunci: bentuk RFC 4180 yang
 * benar-benar terbuka di Excel/LibreOffice (BOM UTF-8, CRLF, escape kutip),
 * tanggal ISO, uang sebagai teks desimal (tidak pernah lewat float), dan
 * jejak audit tenant yang bisa dibaca ulang.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { csvEscape, csvValue, toCsv } from "@/lib/export-csv";

describe("csvValue", () => {
  it("null/undefined → kosong; boolean → 1/0; tanggal → ISO-8601", () => {
    expect(csvValue(null)).toBe("");
    expect(csvValue(undefined)).toBe("");
    expect(csvValue(true)).toBe("1");
    expect(csvValue(false)).toBe("0");
    expect(csvValue(new Date("2026-08-01T10:00:00Z"))).toBe("2026-08-01T10:00:00.000Z");
  });

  it("Decimal Prisma lewat toString — teks desimal, bukan float", () => {
    const decimalLike = { toString: () => "12345678.90" };
    expect(csvValue(decimalLike)).toBe("12345678.90");
  });
});

describe("csvEscape (RFC 4180)", () => {
  it("nilai polos dibiarkan; koma/kutip/baris-baru dibungkus & digandakan", () => {
    expect(csvEscape("polos")).toBe("polos");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('kata "penting"')).toBe('"kata ""penting"""');
    expect(csvEscape("baris\nbaru")).toBe('"baris\nbaru"');
  });
});

describe("toCsv", () => {
  it("ber-BOM (Excel Indonesia menebak encoding tanpa itu), CRLF, header dulu", () => {
    const csv = toCsv(["id", "name"], [[1, "PT A, Tbk"]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toBe('\uFEFFid,name\r\n1,"PT A, Tbk"\r\n');
  });
});

describe("jejak audit tenant — tulis lalu baca ulang", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sai-tenant-audit-"));
    process.env.TENANT_AUDIT_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.TENANT_AUDIT_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it("entri masuk ke data/audit/tenants/<slug>/ dan terbaca terbaru-dulu", async () => {
    const { readTenantAuditLogs, writeTenantAuditLog } = await import("@/lib/tenant-audit");
    await writeTenantAuditLog({
      tenantId: 1,
      tenantSlug: "pt-uji",
      userId: 7,
      username: "budi",
      action: "tenant.register",
      details: { email: "budi@contoh.co.id" },
    });
    await writeTenantAuditLog({
      tenantId: 1,
      tenantSlug: "pt-uji",
      action: "tenant.status.change",
      details: { from: "trialing", to: "past_due" },
    });

    const entries = await readTenantAuditLogs("pt-uji");
    expect(entries).toHaveLength(2);
    expect(entries[0].action).toBe("tenant.status.change");
    expect(entries[0].userId).toBe("system"); // penulis tanpa aktor = system
    expect(entries[1].action).toBe("tenant.register");
    expect(entries[1].userId).toBe("7");
    // jejak tenant lain kosong — pemisahan per-tenant, bukan penyaring
    expect(await readTenantAuditLogs("pt-lain")).toEqual([]);
  });
});
