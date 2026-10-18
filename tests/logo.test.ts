/**
 * Logo produk (konsol `/brand`, `brand_assets` di platform) dan logo
 * perusahaan (Pengaturan, `company_logos` di buku PT).
 *
 * Yang dijaga:
 *  - route logo perusahaan: melihat butuh `settings.view`, mengganti dan
 *    menghapus butuh `company_setting.manage`; isi berkas divalidasi; setiap
 *    perubahan tercatat di jejak audit;
 *  - penyimpanan logo produk: cache 60 detik, fail-soft ke nilai terakhir
 *    (lalu ke lambang bawaan), dan tulisan mengosongkan cache-nya;
 *  - kepala PDF: logo diskalakan ke kotaknya dan logo rusak tidak
 *    menggagalkan dokumen.
 */
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 4, background: { r: 30, g: 58, b: 95, alpha: 1 } } })
    .png()
    .toBuffer()
    .then((b) => new Uint8Array(b));

/* ── Route logo perusahaan ───────────────────────────────────────────────── */

const db = vi.hoisted(() => ({
  companyLogo: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
}));
const granted = vi.hoisted(() => new Set<string>());
const writeAuditLog = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: { ...db, $transaction: async (fn: (tx: unknown) => unknown) => fn(db) },
}));
vi.mock("@/lib/auth-guard", () => ({
  requireApiPermission: async (permission: string) =>
    granted.has(permission)
      ? { authorized: true, session: { user: { id: "5", email: "pemilik@pt.id", role: "managing_director" } }, companyId: 1 }
      : { authorized: false, response: new Response(null, { status: 403 }) },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog }));
vi.mock("@sai/platform/i18n/server", () => ({
  getRequestI18n: async () => ({ dictionary: null, t: (key: string) => key }),
}));

const { GET, POST, DELETE } = await import("@/app/api/t/[tenantSlug]/[companySlug]/company-logo/route");

const context = { params: Promise.resolve({ tenantSlug: "pt-a", companySlug: "utama" }) };
const URL_LOGO = "http://localhost/api/t/pt-a/utama/company-logo";

function upload(bytes: Uint8Array): Request {
  const form = new FormData();
  form.set("file", new File([bytes as unknown as BlobPart], "logo.png", { type: "image/png" }));
  return new Request(URL_LOGO, { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  granted.clear();
  db.companyLogo.updateMany.mockResolvedValue({ count: 1 });
  db.companyLogo.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    sha256: data.sha256,
    mimeType: data.mimeType,
    width: data.width,
    height: data.height,
  }));
});

describe("route logo perusahaan", () => {
  it("melihat butuh settings.view; tanpa logo menjawab 404 tanpa cache", async () => {
    expect((await GET(new Request(URL_LOGO), context)).status).toBe(403);
    granted.add("settings.view");
    db.companyLogo.findFirst.mockResolvedValue(null);
    const res = await GET(new Request(URL_LOGO), context);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("menyajikan logo secara privat; immutable hanya bila versinya cocok", async () => {
    granted.add("settings.view");
    const content = await png(100, 100);
    const sha256 = "a".repeat(64);
    db.companyLogo.findFirst.mockResolvedValue({ sha256, mimeType: "image/png", width: 100, height: 100, content });
    const cocok = await GET(new Request(`${URL_LOGO}?v=${"a".repeat(16)}`), context);
    expect(cocok.headers.get("content-type")).toBe("image/png");
    expect(cocok.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(cocok.headers.get("x-content-type-options")).toBe("nosniff");
    const usang = await GET(new Request(`${URL_LOGO}?v=${"b".repeat(16)}`), context);
    expect(usang.headers.get("cache-control")).toBe("private, max-age=60");
  });

  it("mengganti dan menghapus butuh company_setting.manage, bukan settings.view", async () => {
    granted.add("settings.view");
    expect((await POST(upload(await png(128, 128)), context)).status).toBe(403);
    expect((await DELETE(new Request(URL_LOGO, { method: "DELETE" }), context)).status).toBe(403);
    expect(db.companyLogo.create).not.toHaveBeenCalled();
    expect(db.companyLogo.updateMany).not.toHaveBeenCalled();
  });

  it("unggahan sah: yang lama dinonaktifkan, yang baru dibuat, dan tercatat di audit", async () => {
    granted.add("company_setting.manage");
    const bytes = await png(300, 120);
    const res = await POST(upload(bytes), context);
    expect(res.status).toBe(200);
    expect(db.companyLogo.updateMany).toHaveBeenCalledWith({ where: { isActive: true }, data: { isActive: false } });
    const data = db.companyLogo.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ mimeType: "image/png", width: 300, height: 120, byteSize: bytes.length, createdByUserId: 5 });
    expect(data.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "company_setting.logo.update" }));
    expect((await res.json()).logo.version).toBe(data.sha256.slice(0, 16));
  });

  it("berkas yang bukan gambar atau terlalu kecil ditolak dengan alasannya, tanpa tulisan", async () => {
    granted.add("company_setting.manage");
    const bukan = await POST(upload(new TextEncoder().encode("<svg/>")), context);
    expect(bukan.status).toBe(400);
    expect((await bukan.json()).error).toBe("settings.companyLogo.err.not_image");
    const kecil = await POST(upload(await png(40, 40)), context);
    expect((await kecil.json()).error).toBe("settings.companyLogo.err.too_small");
    expect(db.companyLogo.create).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("badan yang jelas kebesaran ditolak 413 sebelum dibaca", async () => {
    granted.add("company_setting.manage");
    const req = new Request(URL_LOGO, { method: "POST", headers: { "content-length": String(5 * 1024 * 1024) }, body: "x" });
    expect((await POST(req, context)).status).toBe(413);
  });

  it("menghapus logo menonaktifkan yang aktif dan tercatat di audit", async () => {
    granted.add("company_setting.manage");
    const res = await DELETE(new Request(URL_LOGO, { method: "DELETE" }), context);
    expect(res.status).toBe(200);
    expect(db.companyLogo.updateMany).toHaveBeenCalledWith({ where: { isActive: true }, data: { isActive: false } });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "company_setting.logo.remove", details: { deactivated: 1 } }));
  });
});

/* ── Penyimpanan logo produk ─────────────────────────────────────────────── */

describe("logo produk (brand-assets)", () => {
  const meta = { sha256: "c".repeat(64), mimeType: "image/png", width: 512, height: 512, createdBy: "ops", createdAt: new Date(0) };

  function platform() {
    const brandAsset = { findFirst: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })), create: vi.fn() };
    const client = { brandAsset, $transaction: async (fn: (tx: unknown) => unknown) => fn({ brandAsset }) };
    return { brandAsset, deps: { platform: client as never } };
  }

  beforeEach(async () => {
    (await import("@sai/platform/brand-assets")).invalidateBrandMarkCache();
  });

  it("metadata di-cache 60 detik", async () => {
    const { cachedBrandMark } = await import("@sai/platform/brand-assets");
    const { brandAsset, deps } = platform();
    brandAsset.findFirst.mockResolvedValue(meta);
    await cachedBrandMark(deps, 1_000);
    await cachedBrandMark(deps, 50_000);
    expect(brandAsset.findFirst).toHaveBeenCalledTimes(1);
    await cachedBrandMark(deps, 62_000);
    expect(brandAsset.findFirst).toHaveBeenCalledTimes(2);
  });

  it("platform mati: nilai terakhir dipakai, dan tanpa nilai terakhir lambang bawaan (null)", async () => {
    const { cachedBrandMark } = await import("@sai/platform/brand-assets");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { brandAsset, deps } = platform();
    brandAsset.findFirst.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await cachedBrandMark(deps, 1_000)).toBeNull();
    brandAsset.findFirst.mockResolvedValueOnce(meta);
    expect(await cachedBrandMark(deps, 100_000)).toEqual(meta);
    expect(await cachedBrandMark(deps, 200_000)).toEqual(meta);
    error.mockRestore();
  });

  it("mengganti logo memvalidasi isinya dan mengosongkan cache", async () => {
    const { cachedBrandMark, setBrandMark } = await import("@sai/platform/brand-assets");
    const { brandAsset, deps } = platform();
    brandAsset.findFirst.mockResolvedValue(null);
    await cachedBrandMark(deps, 1_000);

    expect(await setBrandMark(deps, { bytes: await png(128, 128), actor: "ops" })).toEqual({ outcome: "invalid", reason: "too_small" });
    expect(brandAsset.create).not.toHaveBeenCalled();

    brandAsset.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...meta, sha256: data.sha256 }));
    const r = await setBrandMark(deps, { bytes: await png(256, 256), actor: "ops" });
    expect(r.outcome).toBe("ok");
    expect(brandAsset.updateMany).toHaveBeenCalledWith({ where: { kind: "mark", isActive: true }, data: { isActive: false } });
    brandAsset.findFirst.mockResolvedValue(meta);
    await cachedBrandMark(deps, 2_000); // masih di dalam 60 detik, tetapi cache sudah dikosongkan
    expect(brandAsset.findFirst).toHaveBeenCalledTimes(2);
  });

  it("alamat logo membawa versi dari sidiknya", async () => {
    const { brandMarkUrl } = await import("@sai/platform/brand-assets");
    expect(brandMarkUrl(meta)).toBe(`/brand/mark?v=${"c".repeat(16)}`);
  });
});

/* ── Kepala PDF ──────────────────────────────────────────────────────────── */

describe("drawCompanyLogo", () => {
  const logo = { dataUrl: "data:image/png;base64,AA==", format: "PNG" as const, width: 400, height: 100 };

  it("tanpa logo tidak menggambar apa pun", async () => {
    const { drawCompanyLogo } = await import("@/lib/pdf/company-header");
    const doc = { addImage: vi.fn() };
    drawCompanyLogo(doc as never, { name: "PT A", address: "" }, 15);
    expect(doc.addImage).not.toHaveBeenCalled();
  });

  it("logo lebar dibatasi lebarnya, proporsinya dijaga", async () => {
    const { drawCompanyLogo } = await import("@/lib/pdf/company-header");
    const doc = { addImage: vi.fn() };
    drawCompanyLogo(doc as never, { name: "PT A", address: "", logo }, 15);
    const [, format, x, y, w, h] = doc.addImage.mock.calls[0];
    expect([format, x, y]).toEqual(["PNG", 14, 9]);
    expect(w).toBeCloseTo(36);
    expect(h).toBeCloseTo(9);
  });

  it("logo rusak tidak menggagalkan dokumen", async () => {
    const { drawCompanyLogo } = await import("@/lib/pdf/company-header");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const doc = { addImage: vi.fn(() => { throw new Error("corrupt PNG"); }) };
    expect(() => drawCompanyLogo(doc as never, { name: "PT A", address: "", logo }, 15)).not.toThrow();
    error.mockRestore();
  });
});
