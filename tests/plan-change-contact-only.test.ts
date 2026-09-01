/**
 * Paket berharga RUNDINGAN tidak bisa dituju lewat swalayan — diuji LEWAT
 * ROUTE HANDLER ASLINYA, bukan lewat fungsi murni di sebaliknya.
 *
 * ══ KENAPA INI LAYAK TES SENDIRI ═══════════════════════════════════════════
 * Kolom harga paket `enterprise` berisi `0.00`, sebab skema menuntut angka
 * sedangkan harganya belum ada — ia dirundingkan. Kalau paket seperti itu
 * lolos ke `quotePlanChange`, seluruh aritmetika bekerja dengan benar di atas
 * premis yang salah: selisih terhadap harga berjalan menjadi NEGATIF, jalurnya
 * terbaca sebagai turun paket, dan pelanggan dipindahkan ke Enterprise —
 * dengan kuotanya ikut naik — TANPA satu rupiah pun tertagih. Tidak ada yang
 * gagal, tidak ada galat; hanya pendapatan yang tidak pernah ada.
 *
 * Kartu "hubungi kami" di halaman harga TIDAK menjaga apa pun: ia hanya tidak
 * merender tombolnya. Yang menjaga adalah penjaga di route ini, dan karena itu
 * ia diuji dengan permintaan yang menyebut `planKey` langsung — persis yang
 * dilakukan orang yang membuka alat pengembang dan mengirimnya sendiri.
 *
 * `isPublic` diuji berpasangan dengan alasan yang sama: paket `internal`
 * (Rp 0, 10 PT, 50 pengguna) WAJIB tetap aktif demi putaran adopsi yatim
 * (#152), jadi tanpa syarat publik ia bisa dituju siapa pun yang menebak
 * kuncinya.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  /** Paket yang dijawab basis data platform untuk `key` yang diminta. */
  plan: null as null | {
    id: number;
    key: string;
    priceMonthly: string;
    currency: string;
    maxCompanies: number;
    maxUsers: number;
    isActive: boolean;
    isPublic: boolean;
    contactOnly: boolean;
  },
  /** Dibuat oleh route bila ia sampai ke tahap menagih — harus tetap 0. */
  invoicesCreated: 0,
  /** Dipanggil bila route sampai memasang paket — harus tetap 0. */
  plansApplied: 0,
}));

vi.mock("@/lib/tenant-guard", () => ({
  requireTenantApiPermission: async () => ({
    /* Bentuk balikan penjaga yang asli: `authorized` (bukan `ok`) — salah
     * nama berarti route langsung mengembalikan `auth.response` yang
     * undefined, dan tesnya gagal di tempat yang tidak menjelaskan apa-apa. */
    authorized: true as const,
    user: { id: "7", name: "Budi" },
    tenant: { tenantId: 1, tenantSlug: "acme", tenantName: "CV Acme", role: "owner" },
  }),
}));

vi.mock("@/lib/i18n/server", () => ({
  getRequestI18n: async () => ({ t: (key: string) => key, dictionary: {} }),
}));

vi.mock("@/lib/i18n/validation", () => ({ translateFieldErrors: () => ({}) }));

vi.mock("@/lib/platform-db", () => ({
  platformDb: {
    plan: { findUnique: async () => state.plan },
    subscription: {
      findFirst: async () => ({
        id: 5,
        price: "450000.00",
        currency: "IDR",
        /*
         * Periode langganan RELATIF terhadap hari ini, bukan tanggal keras.
         *
         * Sebelumnya `2026-08-01` … `2026-08-31`, dan itu bom waktu: tesnya
         * hijau setiap hari sampai 31 Agustus 2026 lalu merah sejak 1
         * September, sebab langganannya kedaluwarsa dan pindah paket dijawab
         * 409 alih-alih 200/201. Kegagalannya tidak menunjuk apa pun yang
         * rusak di kode — hanya kalender yang berjalan.
         *
         * Yang diuji berkas ini adalah PENJAGA PAKET (rundingan ditolak,
         * publik diterima), dan penjaga itu tidak peduli tanggal. Jadi
         * fixture-nya tidak boleh peduli juga.
         */
        currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        plan: { key: "pro" },
      }),
    },
    platformInvoice: {
      create: async () => {
        state.invoicesCreated += 1;
        return { id: 1, number: "PUPG-1" };
      },
    },
  },
}));

vi.mock("@/lib/control-db", () => ({
  controlDb: {
    company: { count: async () => 1 },
    user: { count: async () => 2 },
  },
}));

vi.mock("@/lib/operator/writes", () => ({
  changeTenantPlan: async () => {
    state.plansApplied += 1;
    return { outcome: "applied" };
  },
}));

vi.mock("@/lib/tenant-state", () => ({ invalidateTenantState: () => {} }));

const { POST } = await import("@/app/api/tenant/billing/plan-change/route");

const post = (planKey: string) =>
  POST(
    new Request("https://app.test/api/tenant/billing/plan-change", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planKey }),
    })
  );

const PLAN = {
  id: 9,
  key: "enterprise",
  priceMonthly: "0.00",
  currency: "IDR",
  maxCompanies: 10,
  maxUsers: 50,
  isActive: true,
  isPublic: true,
  contactOnly: true,
};

beforeEach(() => {
  state.plan = { ...PLAN };
  state.invoicesCreated = 0;
  state.plansApplied = 0;
});

describe("pindah paket swalayan menolak paket rundingan (#179)", () => {
  it("paket contact-only ditolak 409, dan TIDAK menagih apa pun", async () => {
    const response = await post("enterprise");
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("contact_only");
    // Yang paling mahal bukan status jawabannya melainkan efek sampingnya:
    // paket TIDAK boleh terpasang, dan tagihan TIDAK boleh terbit.
    expect(state.plansApplied).toBe(0);
    expect(state.invoicesCreated).toBe(0);
  });

  it("penolakannya berdiri SEBELUM kutipan dihitung — harga 0 tidak pernah dipakai", async () => {
    // Kalau penjaga dipasang sesudah `quotePlanChange`, harga 0 sudah terlanjur
    // dibaca sebagai turun paket dan jalur "terapkan langsung" bisa berjalan.
    // Nol pemasangan di atas sudah membuktikannya; di sini kita kunci juga
    // bahwa jawabannya BUKAN 200.
    const response = await post("enterprise");
    expect(response.ok).toBe(false);
  });

  it("paket AKTIF tapi tidak publik (mis. `internal`) dijawab 404, bukan dipasang", async () => {
    state.plan = {
      ...PLAN,
      key: "internal",
      contactOnly: false,
      isPublic: false,
      priceMonthly: "0.00",
    };

    const response = await post("internal");
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe("plan_not_found");
    expect(state.plansApplied).toBe(0);
    expect(state.invoicesCreated).toBe(0);
  });

  it("paket publik & berbayar TIDAK ikut tertolak oleh penjaga ini", async () => {
    // Penjaga yang menolak terlalu banyak akan dibuang orang pertama yang
    // tidak bisa naik paket sama sekali.
    state.plan = {
      ...PLAN,
      id: 3,
      key: "pro-plus",
      contactOnly: false,
      priceMonthly: "900000.00",
    };

    const response = await post("pro-plus");
    expect([200, 201]).toContain(response.status);
  });
});
