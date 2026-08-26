/**
 * Serialisasi ekspor CSV (issue #142) — yang dikunci: bentuk RFC 4180 yang
 * benar-benar terbuka di Excel/LibreOffice (BOM UTF-8, CRLF, escape kutip),
 * tanggal ISO, uang sebagai teks desimal (tidak pernah lewat float), dan
 * jejak audit tenant yang bisa dibaca ulang.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  /*
   * Sejak #484 jejak tenant hidup di TABEL basis data kendali, bukan berkas.
   * `controlDb` dipalsukan dengan penyimpan dalam memori yang berperilaku
   * seperti tabelnya: menyimpan urut sisip, memulangkan terbaru-dulu, dan
   * menyaring per slug. Yang diuji tetap SIFAT yang sama seperti sebelumnya —
   * hanya rumahnya yang berpindah.
   */
  const rows: Record<string, unknown>[] = [];

  beforeEach(() => {
    rows.length = 0;
  });

  it("entri tersimpan dan terbaca terbaru-dulu, terpisah per tenant", async () => {
    vi.doMock("@/lib/control-db", () => ({
      controlDb: {
        tenantAuditLog: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            rows.push({ ...data, id: rows.length + 1, createdAt: new Date(2026, 0, rows.length + 1) });
            return data;
          },
          findMany: async ({ where }: { where: { tenantSlug: string } }) =>
            rows.filter((r) => r.tenantSlug === where.tenantSlug).reverse(),
          count: async ({ where }: { where: { tenantSlug: string } }) =>
            rows.filter((r) => r.tenantSlug === where.tenantSlug).length,
        },
      },
    }));
    vi.resetModules();

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
    /* Rincian disimpan sebagai TEKS lalu diurai kembali — bentuk yang dilihat
       pemanggil tidak berubah karena rumahnya berubah. */
    expect(entries[1].details).toEqual({ email: "budi@contoh.co.id" });
    // jejak tenant lain kosong — pemisahan per-tenant, bukan penyaring
    expect(await readTenantAuditLogs("pt-lain")).toEqual([]);

    vi.doUnmock("@/lib/control-db");
    vi.resetModules();
  });
});

