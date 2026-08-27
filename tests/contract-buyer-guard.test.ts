/**
 * Faktur sebuah kontrak menagih PIHAK yang sama (migrasi 0057).
 *
 * Sebelum tautan `contracts.customer_id` ada, `contracts.buyer` teks bebas dan
 * `invoices.customer_id` FK sungguhan — dua dunia yang tak pernah bertemu.
 * Kontrak PT A karena itu bisa difakturkan ke PT B: sisa kontrak PT A berkurang,
 * piutang tercatat atas PT B, tanpa galat dan tanpa jejak. Berkas ini menguji
 * satu-satunya tempat yang bisa menghentikannya, dan menguji juga bahwa ia
 * DIAM pada kontrak warisan — sebab penjaga yang menolak dokumen lama bukan
 * penjaga, melainkan kerusakan kedua.
 *
 * Murni: tanpa DATABASE_URL, sikap yang sama dengan `document-chain.test.ts`.
 */
import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import {
  assertContractCustomerFitsInvoices,
  ContractBuyerMismatchError,
  ContractCustomerConflictError,
  resolveInvoiceCustomer,
  resolveInvoiceCustomerForContract,
  type ContractBuyerRef,
} from "@/lib/document-chain";
import { contractSchema } from "@/lib/validations/contract";
import {
  kunciPembeli,
  namaMasterDariTeks,
  punyaEntitasHtml,
} from "@/lib/contract-buyer-match";

const TERTAUT: ContractBuyerRef = {
  contractNo: "SC-2026-001",
  buyer: "PT Maju Jaya",
  customerId: 4,
};
const WARISAN: ContractBuyerRef = {
  contractNo: "SC-2019-088",
  buyer: "Foshan Taste Import & Export Co., Ltd",
  customerId: null,
};

describe("resolveInvoiceCustomer", () => {
  it("menolak faktur yang ditagihkan ke pihak lain", () => {
    expect(() => resolveInvoiceCustomer(TERTAUT, 9)).toThrow(ContractBuyerMismatchError);
  });

  it("menyebut nomor kontrak DAN nama pembelinya di pesan galat", () => {
    // Nomor id pelanggan tidak berarti apa-apa bagi yang membacanya; kalimatnya
    // harus cukup untuk tahu kontrak mana dan pihak mana yang dimaksud.
    try {
      resolveInvoiceCustomer(TERTAUT, 9);
      expect.unreachable("seharusnya melempar");
    } catch (e) {
      expect(e).toBeInstanceOf(ContractBuyerMismatchError);
      const err = e as ContractBuyerMismatchError;
      expect(err.message).toContain("SC-2026-001");
      expect(err.message).toContain("PT Maju Jaya");
      expect(err.contractCustomerId).toBe(4);
      expect(err.invoiceCustomerId).toBe(9);
    }
  });

  it("meloloskan faktur yang pihaknya sama", () => {
    expect(resolveInvoiceCustomer(TERTAUT, 4)).toBe(4);
  });

  it("mengisi pelanggan faktur dari kontrak bila dikirim kosong", () => {
    // `invoices.customer_id` nullable sejak #35, jadi "kosong" adalah kelalaian
    // dan bukan keputusan — dan jawabannya ada tepat di kontrak yang ditarik.
    // Menyimpannya kosong berarti faktur tercetak tanpa nama pembeli.
    expect(resolveInvoiceCustomer(TERTAUT, null)).toBe(4);
    expect(resolveInvoiceCustomer(TERTAUT, undefined)).toBe(4);
  });

  it("DIAM pada kontrak warisan yang belum tertaut", () => {
    // Seluruh kontrak lama masuk migrasi 0057 dengan customer_id NULL. Tidak
    // satu pun dokumen lama boleh mendadak ditolak karena penjaga ini ada.
    expect(resolveInvoiceCustomer(WARISAN, 9)).toBe(9);
    expect(resolveInvoiceCustomer(WARISAN, null)).toBeNull();
  });
});

describe("resolveInvoiceCustomerForContract", () => {
  const client = (contract: ContractBuyerRef | null) =>
    ({
      contract: { findUnique: async () => contract },
    }) as unknown as Prisma.TransactionClient;

  it("membaca kontraknya lalu menerapkan aturan yang sama", async () => {
    await expect(resolveInvoiceCustomerForContract(client(TERTAUT), 1, 9)).rejects.toThrow(
      ContractBuyerMismatchError
    );
    await expect(resolveInvoiceCustomerForContract(client(TERTAUT), 1, null)).resolves.toBe(4);
  });

  it("tidak melempar untuk kontrak yang tidak ada — itu urusan pemeriksa 400 di route", async () => {
    await expect(resolveInvoiceCustomerForContract(client(null), 999, 9)).resolves.toBe(9);
  });
});

describe("assertContractCustomerFitsInvoices — arah sebaliknya", () => {
  /** Klien tiruan yang MENERAPKAN `where`-nya, bukan yang selalu memulangkan
   *  seed apa adanya: yang diuji di sini justru bunyi filternya. */
  const client = (
    invoices: { invoiceNo: string; status: string; customerId: number | null }[]
  ) =>
    ({
      invoice: {
        findMany: async ({
          where,
        }: {
          where: { status: { not: string }; customerId: { not: null; notIn: number[] } };
        }) =>
          invoices
            .filter((i) => i.status !== where.status.not)
            .filter((i) => i.customerId !== null)
            .filter((i) => !where.customerId.notIn.includes(i.customerId as number))
            .map((i) => ({ invoiceNo: i.invoiceNo })),
      },
    }) as unknown as Prisma.TransactionClient;

  const faktur = (customerId: number | null, status = "pending", invoiceNo = "SI-001") => ({
    invoiceNo,
    status,
    customerId,
  });

  it("menolak memindahkan kontrak yang fakturnya menagih pihak sekarang", async () => {
    await expect(
      assertContractCustomerFitsInvoices(client([faktur(4)]), 1, "SC-2026-001", 9)
    ).rejects.toThrow(ContractCustomerConflictError);
  });

  it("menyebut nomor faktur yang menghalangi — bukan sekadar 'ada yang bentrok'", async () => {
    try {
      await assertContractCustomerFitsInvoices(
        client([faktur(4, "pending", "SI-001"), faktur(4, "paid", "SI-002")]),
        1,
        "SC-2026-001",
        9
      );
      expect.unreachable("seharusnya melempar");
    } catch (e) {
      expect((e as ContractCustomerConflictError).invoiceNos).toEqual(["SI-001", "SI-002"]);
    }
  });

  it("mengizinkan bila fakturnya memang menagih pihak yang dituju", async () => {
    await expect(
      assertContractCustomerFitsInvoices(client([faktur(9)]), 1, "SC-2026-001", 9)
    ).resolves.toBeUndefined();
  });

  it("mengabaikan faktur BATAL — ia tidak lagi menagih siapa pun", async () => {
    await expect(
      assertContractCustomerFitsInvoices(client([faktur(4, "canceled")]), 1, "SC-2026-001", 9)
    ).resolves.toBeUndefined();
  });

  it("mengabaikan faktur warisan tanpa pelanggan", async () => {
    // Baris pra-#35 belum menyatakan pihak; menolak suntingan kontrak karenanya
    // berarti menghukum data lama atas kekurangan yang bukan urusan suntingan.
    await expect(
      assertContractCustomerFitsInvoices(client([faktur(null)]), 1, "SC-2026-001", 9)
    ).resolves.toBeUndefined();
  });

  it("selalu mengizinkan MELEPAS tautan — itu mengurangi klaim, bukan menambah", async () => {
    await expect(
      assertContractCustomerFitsInvoices(client([faktur(4)]), 1, "SC-2026-001", null)
    ).resolves.toBeUndefined();
  });
});

describe("contractSchema membawa tautan pembeli", () => {
  const base = {
    contractNo: "SC-2026-001",
    date: "2026-08-27",
    buyer: "PT Maju Jaya",
    currency: "IDR",
    items: [{ itemName: "Kopi Arabika", bags: 100, kgPerBag: 60, pricePerKg: 90_000 }],
  };

  it("menerima tautan pelanggan", () => {
    const r = contractSchema.safeParse({ ...base, customerId: 4 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.customerId).toBe(4);
  });

  it("memperlakukan pemilih kosong sebagai tanpa tautan", () => {
    for (const value of ["", null, undefined]) {
      const r = contractSchema.safeParse({ ...base, customerId: value });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.customerId).toBeNull();
    }
  });

  it("TIDAK mewajibkannya — jalur sunting dipakai bersama kontrak warisan", () => {
    // Mewajibkannya di skema akan membuat setiap kontrak yang belum tertaut
    // mustahil disunting, termasuk untuk memperbaiki salah ketik.
    const r = contractSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.customerId).toBeNull();
  });

  it("tetap mewajibkan teks pembeli — ia yang tercetak di kontrak", () => {
    const r = contractSchema.safeParse({ ...base, buyer: "", customerId: 4 });
    expect(r.success).toBe(false);
  });
});

// ─── Penjodohan teks pembeli → master (migrasi 0057 + skrip penautan) ──────

describe("kunciPembeli", () => {
  it("menyamakan huruf besar/kecil dan spasi berlebih — aturan migrasi 0057", () => {
    // Terbukti di data sungguhan: 48 kontrak "GUANGXI XINGUIYU PHARMACEUTICAL
    // CO., LTD" tertaut ke master yang ditulis "guangxi  XINGUIYU ...".
    expect(kunciPembeli("GUANGXI XINGUIYU PHARMACEUTICAL CO., LTD")).toBe(
      kunciPembeli("guangxi  XINGUIYU pharmaceutical CO., LTD")
    );
  });

  it("menyatukan pasangan yang terbelah entitas HTML warisan", () => {
    // 117 kontrak `pt-sai` terbagi dua hanya karena impor lama tidak pernah
    // membuka `&amp;`. Tanpa langkah ini, satu pembeli melahirkan dua master.
    expect(kunciPembeli("Foshan Taste Import &amp; Export Co., Ltd")).toBe(
      kunciPembeli("Foshan Taste Import & Export Co., Ltd")
    );
  });

  it("tidak menyatukan perusahaan yang memang berbeda", () => {
    expect(kunciPembeli("GUANGDONG SUNWING LOGISTICS CO., LTD")).not.toBe(
      kunciPembeli("GUANGDONG HAPPY SUPPLY CHAIN MANAGEMENT CO., LTD")
    );
  });
});

describe("punyaEntitasHtml / namaMasterDariTeks", () => {
  it("menandai teks kontrak yang masih membawa entitas mentah", () => {
    expect(punyaEntitasHtml("Foshan Taste Import &amp; Export Co., Ltd")).toBe(true);
    expect(punyaEntitasHtml("PT Maju Jaya")).toBe(false);
  });

  it("membuat nama master yang bersih tanpa merapikan ejaan aslinya", () => {
    // Huruf besarnya memang begitu tertulis di dokumen; merapikannya selera.
    expect(namaMasterDariTeks("  Foshan Taste Import &amp; Export Co., Ltd ")).toBe(
      "Foshan Taste Import & Export Co., Ltd"
    );
  });

  it("memotong di 100 karakter — lebar `customers.name`", () => {
    expect(namaMasterDariTeks("A".repeat(150))).toHaveLength(100);
  });
});
