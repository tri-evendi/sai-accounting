/**
 * Konteks perusahaan per permintaan (lib/company-context.ts) + Proxy `prisma`
 * (lib/prisma.ts) — issue #104.
 *
 * Yang dijaga di sini adalah SATU sifat, dan ia satu-satunya sifat di seluruh
 * fitur multi-perusahaan yang kalau meleset akibatnya fatal DAN sunyi:
 *
 *     kode yang menyentuh basis data tanpa konteks perusahaan harus MELEMPAR,
 *     bukan jatuh ke basis data mana pun.
 *
 * Kalau jaring ini bocor, gejalanya bukan galat: transaksi PT A tertulis ke buku
 * PT B, tanpa pesan apa pun, dan baru ketahuan saat neraca tidak cocok
 * berbulan-bulan kemudian. Tes inilah yang memastikan kebocoran itu berbunyi.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCompanyClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/company-clients", () => ({ getCompanyClient }));
// Tanpa konteks, proxy jatuh ke SESI sebagai sumber kedua (lihat lib/prisma.ts).
// Di sini sesinya kosong, jadi yang diuji adalah jalur "tidak ada keduanya".
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

import {
  CompanyContext,
  MissingCompanyContextError,
  enterCompanyContext,
  getCompanyContext,
  requireCompanyContext,
  runWithCompany,
  runWithoutCompany,
} from "@/lib/company-context";
import { prisma, currentCompanyClient } from "@/lib/prisma";

const PT_A: CompanyContext = { companyId: 1, slug: "pt-a", databaseName: "sai_pt_a" };
const PT_B: CompanyContext = { companyId: 2, slug: "pt-b", databaseName: "sai_pt_b" };

/** Klien palsu yang mencatat basis data mana yang diminta. */
function fakeClientFor(databaseName: string) {
  return {
    databaseName,
    invoice: { findMany: async () => [`faktur milik ${databaseName}`] },
    $transaction: async function (fn: (tx: unknown) => unknown) {
      // `this` harus tetap kliennya, bukan Proxy — kalau salah, ini undefined.
      return fn(this);
    },
  };
}

beforeEach(() => {
  getCompanyClient.mockReset();
  getCompanyClient.mockImplementation((databaseName: string) => fakeClientFor(databaseName));
});

describe("konteks perusahaan", () => {
  it("mengembalikan konteks yang sedang dijalankan", () => {
    runWithCompany(PT_A, () => {
      expect(requireCompanyContext()).toEqual(PT_A);
      expect(getCompanyContext()).toEqual(PT_A);
    });
  });

  it("tidak bocor keluar dari runWithCompany", () => {
    // Berkas tes ini berjalan di dalam konteks bawaan (tests/setup-company-
    // context.ts), jadi yang diperiksa adalah yang sebenarnya penting:
    // sesudah blok PT A selesai, konteksnya kembali menjadi konteks
    // pembungkusnya — BUKAN tertinggal sebagai PT A.
    runWithCompany(PT_A, () => undefined);
    expect(getCompanyContext()?.slug).not.toBe("pt-a");
  });

  it("tidak bocor ANTAR perusahaan yang bersarang", () => {
    runWithCompany(PT_A, () => {
      runWithCompany(PT_B, () => {
        expect(requireCompanyContext().slug).toBe("pt-b");
      });
      // Yang dalam selesai — yang luar harus kembali utuh, bukan tertimpa.
      expect(requireCompanyContext().slug).toBe("pt-a");
    });
  });

  it("bertahan melewati batas async di dalam permintaan yang sama", async () => {
    await runWithCompany(PT_A, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(requireCompanyContext().slug).toBe("pt-a");
    });
  });

  it("enterCompanyContext menanam konteks untuk sisa eksekusi", async () => {
    await runWithoutCompany(async () => {
      expect(getCompanyContext()).toBeNull();
      // Inilah yang dilakukan penjaga halaman: ia tidak bisa membungkus render
      // yang baru terjadi SETELAH ia selesai, jadi ia menanam konteksnya.
      enterCompanyContext(PT_B);
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(requireCompanyContext().slug).toBe("pt-b");
    });
  });

  it("MELEMPAR tanpa konteks — tidak ada perusahaan bawaan", () => {
    runWithoutCompany(() => {
      expect(() => requireCompanyContext()).toThrow(MissingCompanyContextError);
    });
  });

  it("pesan galatnya menyebut cara memperbaikinya", () => {
    runWithoutCompany(() => {
      expect(() => requireCompanyContext()).toThrow(/runWithCompany/);
    });
  });
});

describe("proxy prisma", () => {
  it("mengarah ke basis data perusahaan yang sedang aktif", async () => {
    await runWithCompany(PT_A, async () => {
      await expect(prisma.invoice.findMany()).resolves.toEqual(["faktur milik sai_pt_a"]);
    });
    expect(getCompanyClient).toHaveBeenCalledWith("sai_pt_a");
  });

  it("permintaan berikutnya untuk perusahaan lain memakai basis data lain", async () => {
    await runWithCompany(PT_A, async () => {
      await prisma.invoice.findMany();
    });
    await runWithCompany(PT_B, async () => {
      await expect(prisma.invoice.findMany()).resolves.toEqual(["faktur milik sai_pt_b"]);
    });
    expect(getCompanyClient).toHaveBeenNthCalledWith(1, "sai_pt_a");
    expect(getCompanyClient).toHaveBeenNthCalledWith(2, "sai_pt_b");
  });

  it("MELEMPAR saat dipakai tanpa konteks — bukan memilih basis data mana pun", async () => {
    // Penyelesaian terjadi saat query DIPANGGIL (lihat lib/prisma.ts), jadi
    // yang menolak adalah pemanggilannya, bukan akses propertinya.
    await runWithoutCompany(async () => {
      await expect(prisma.invoice.findMany()).rejects.toThrow(MissingCompanyContextError);
      expect(getCompanyClient).not.toHaveBeenCalled();
    });
  });

  it("method Prisma tetap terikat pada kliennya (`this` tidak hilang)", async () => {
    await runWithCompany(PT_A, async () => {
      const inner = await prisma.$transaction(async (tx: unknown) => tx);
      expect((inner as { databaseName: string }).databaseName).toBe("sai_pt_a");
    });
  });

  it("currentCompanyClient memberi klien yang sama dengan yang dipakai proxy", async () => {
    await runWithCompany(PT_B, async () => {
      const client = (await currentCompanyClient()) as unknown as { databaseName: string };
      expect(client.databaseName).toBe("sai_pt_b");
    });
  });
});
