/**
 * Server surel per TENANT — sifat yang dikunci.
 *
 * Satu kelas kesalahan di sini jauh lebih berbahaya daripada yang lain, dan
 * ia yang diuji paling keras: **konfigurasi satu penyewa dipakai penyewa
 * lain**. Akibatnya bukan galat melainkan faktur milik PT A yang berangkat
 * lewat server surel PT B dengan alamat pengirim PT B — kebocoran identitas
 * yang hanya terlihat oleh penerimanya, dan yang tidak meninggalkan satu baris
 * pun di log mana pun.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();

vi.mock("@/lib/control-db", () => ({
  controlDb: {
    tenantMailSetting: { findUnique: (...args: unknown[]) => findUnique(...args) },
    company: { findUnique: vi.fn() },
  },
}));

const {
  dropTenantMailCache,
  cachedTenantMail,
  resolveTenantMailConfig,
  tenantMailView,
} = await import("@/lib/tenant-mail-settings");

const row = (over: Record<string, unknown> = {}) => ({
  transport: "smtp",
  host: "smtp.contoh.co.id",
  port: 587,
  username: "tagihan@contoh.co.id",
  fromAddress: "PT Contoh <tagihan@contoh.co.id>",
  passwordCiphertext: null,
  passwordIv: null,
  passwordTag: null,
  archiveAddress: null,
  lastTestAt: null,
  lastTestTo: null,
  lastTestStatus: null,
  lastTestMessage: null,
  updatedBy: "1",
  updatedAt: new Date(),
  ...over,
});

afterEach(() => {
  findUnique.mockReset();
  dropTenantMailCache();
});

describe("cache dikunci per tenant", () => {
  it("dua tenant TIDAK PERNAH berbagi satu slot cache", async () => {
    findUnique.mockImplementation(async ({ where }: { where: { tenantId: number } }) =>
      where.tenantId === 1
        ? row({ host: "smtp.satu.co.id", fromAddress: "PT Satu <a@satu.co.id>" })
        : row({ host: "smtp.dua.co.id", fromAddress: "PT Dua <b@dua.co.id>" })
    );

    const satu = await resolveTenantMailConfig(1);
    const dua = await resolveTenantMailConfig(2);

    expect(satu?.smtp?.host).toBe("smtp.satu.co.id");
    expect(dua?.smtp?.host).toBe("smtp.dua.co.id");
    expect(satu?.from).not.toBe(dua?.from);

    // Dan tetap begitu ketika dibaca ulang dari cache.
    expect((await resolveTenantMailConfig(1))?.smtp?.host).toBe("smtp.satu.co.id");
    expect((await resolveTenantMailConfig(2))?.smtp?.host).toBe("smtp.dua.co.id");
  });

  it("cache memang bekerja — pembacaan kedua tidak menyentuh basis data lagi", async () => {
    findUnique.mockResolvedValue(row());
    await cachedTenantMail(7);
    await cachedTenantMail(7);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("membuang cache satu tenant tidak membuang milik tenant lain", async () => {
    findUnique.mockResolvedValue(row());
    await cachedTenantMail(1);
    await cachedTenantMail(2);
    dropTenantMailCache(1);
    await cachedTenantMail(1);
    await cachedTenantMail(2);
    // 2 pembacaan awal + 1 pembacaan ulang tenant 1 saja.
    expect(findUnique).toHaveBeenCalledTimes(3);
  });
});

describe("penyelesaian konfigurasi", () => {
  it("tenant tanpa baris → null, dan itu berarti 'pakai jalur penyedia'", async () => {
    findUnique.mockResolvedValue(null);
    expect(await resolveTenantMailConfig(1)).toBeNull();
  });

  it("smtp TANPA host → null: pengaturan setengah jadi bukan konfigurasi", async () => {
    findUnique.mockResolvedValue(row({ host: null }));
    expect(await resolveTenantMailConfig(1)).toBeNull();
  });

  it("transport `file` DIHORMATI, bukan dianggap belum diatur", async () => {
    /* Tenant yang sengaja menahan surelnya tidak boleh diam-diam dialihkan
       mengirim lewat server penyedia. */
    findUnique.mockResolvedValue(row({ transport: "file" }));
    const config = await resolveTenantMailConfig(1);
    expect(config).not.toBeNull();
    expect(config?.transport).toBe("file");
    expect(config?.source).toBe("tenant");
  });

  it("smtp DI LUAR PRODUKSI selalu ditangkap ke berkas", async () => {
    // Pengaman yang sama dengan `mailer-core`: salah setel di laptop tidak
    // boleh mengirim surel sungguhan ke pelanggan orang.
    findUnique.mockResolvedValue(row());
    const config = await resolveTenantMailConfig(1);
    expect(config?.requestedTransport).toBe("smtp");
    expect(config?.transport).toBe("file"); // NODE_ENV=test
  });

  it("alamat pengirim kosong jatuh ke cadangan, bukan string kosong", async () => {
    findUnique.mockResolvedValue(row({ fromAddress: "   " }));
    const config = await resolveTenantMailConfig(1);
    expect(config?.from.trim()).not.toBe("");
  });

  it("basis data yang tersendat TIDAK meruntuhkan jalur surel", async () => {
    findUnique.mockRejectedValue(new Error("db down"));
    expect(await resolveTenantMailConfig(1)).toBeNull();
  });
});

describe("kata sandi tidak pernah keluar", () => {
  it("tampilan hanya menyebut ADA/TIDAK, tak pernah nilainya", () => {
    const view = tenantMailView(
      row({
        passwordCiphertext: "rahasia-tersegel",
        passwordIv: "iv",
        passwordTag: "tag",
      }) as never
    );
    expect(view.hasPassword).toBe(true);
    expect(JSON.stringify(view)).not.toContain("rahasia-tersegel");
    expect(Object.keys(view)).not.toContain("passwordCiphertext");
  });

  it("tanpa kata sandi tersimpan → hasPassword false", () => {
    expect(tenantMailView(row() as never).hasPassword).toBe(false);
  });

  it("baris kosong menghasilkan tampilan aman, bukan lemparan", () => {
    const view = tenantMailView(null);
    expect(view.transport).toBe("file");
    expect(view.hasPassword).toBe(false);
  });
});
