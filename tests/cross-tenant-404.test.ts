/**
 * Lintas-tenant = 404, BUKAN 403 (issue #156, doktrin §4.4 MULTI-TENANT.md).
 *
 * 403 pada sumber daya tenant lain MENGKONFIRMASI sumber dayanya ada — bentuk
 * kebocoran enumerasi yang sama dengan §4.4. Yang dikunci di sini, LEWAT ROUTE
 * HANDLER ASLINYA (bukan fungsi murni):
 *
 *   • tagihan platform milik tenant lain → 404 yang IDENTIK (status + isi)
 *     dengan id yang memang tidak pernah ada;
 *   • undangan milik PT tenant lain → 404 yang identik dengan id fiktif;
 *   • perusahaan tenant lain sebagai KONTEKS (companyId di sesi) → dijawab
 *     persis seperti belum memilih perusahaan (409 company_required) — bukan
 *     jawaban ketiga yang membocorkan "perusahaan itu ada, tapi bukan punyamu".
 *
 * Basis data platform & kendali dipalsukan DENGAN MENGHORMATI where-clause:
 * kalau route berhenti menyaring `tenantId`/`companyId`, fake-nya mengembalikan
 * baris asing dan tes ini merah — persis arah gagal yang diinginkan.
 *
 * Rute ber-[id] tenant BARU (#157) wajib menambahkan pasangan tes yang sama:
 * satu id asing → 404, dan bukti 404-nya identik dengan id fiktif.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ── Dunia palsu: dua tenant, dua PT, tagihan & undangan masing-masing ────── */

const state = vi.hoisted(() => ({
  session: null as unknown,
  /** Keanggotaan tenant PEMANGGIL — owner tenant A (id 1). */
  membership: null as {
    tenantId: number;
    tenantSlug: string;
    tenantName: string;
    tenantStatus: string;
    role: string;
  } | null,
  companies: new Map<
    number,
    { slug: string; name: string; databaseName: string; isActive: boolean; tenantId: number }
  >(),
  platformInvoices: [] as Array<{
    id: number;
    tenantId: number;
    number: string;
    status: string;
    total: string;
  }>,
  invitations: [] as Array<{ id: number; companyId: number; usedAt: Date | null }>,
  payments: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/auth", () => ({
  auth: async () => state.session,
}));

vi.mock("@/lib/tenant-directory", () => ({
  tenantMembershipForUser: async () => state.membership,
}));

/* i18n membaca cookies()/headers() — di luar lingkup permintaan Next keduanya
 * melempar. `t` mengembalikan KUNCINYA, jadi isi respons tetap bisa
 * dibandingkan byte demi byte antar skenario. */
vi.mock("@/lib/i18n/server", () => ({
  getRequestI18n: async () => ({
    locale: "id",
    dictionary: {},
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/platform-db", () => ({
  platformDb: {
    platformInvoice: {
      /* Kunci yang TIDAK dikirim = tanpa penyaring — persis Prisma. Kalau
       * disamakan dengan "tidak cocok", route yang KEHILANGAN saringan
       * tenant-nya tetap 404 dan tes ini berbohong hijau. */
      findFirst: async ({ where }: { where: { id: number; tenantId?: number } }) =>
        state.platformInvoices.find(
          (i) => i.id === where.id && (where.tenantId === undefined || i.tenantId === where.tenantId)
        ) ?? null,
    },
    payment: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.payments.push(data);
        return data;
      },
    },
  },
}));

vi.mock("@/lib/control-db", () => ({
  controlDb: {
    company: {
      findUnique: async ({ where }: { where: { id: number } }) => {
        const row = state.companies.get(where.id);
        return row ? { id: where.id, ...row } : null;
      },
    },
    invitation: {
      /* Kunci yang tidak dikirim = tanpa penyaring — lihat catatan di
       * platformInvoice.findFirst di atas. */
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: number; companyId?: number; usedAt?: null };
        data: { usedAt: Date };
      }) => {
        const rows = state.invitations.filter(
          (r) =>
            r.id === where.id &&
            (where.companyId === undefined || r.companyId === where.companyId) &&
            (where.usedAt === undefined || r.usedAt === where.usedAt)
        );
        for (const row of rows) row.usedAt = data.usedAt;
        return { count: rows.length };
      },
      findMany: async ({ where }: { where: { companyId: number } }) =>
        state.invitations.filter((r) => r.companyId === where.companyId && r.usedAt === null),
    },
  },
}));

/* Jejak audit menulis ke basis data (platform & PT) — di tes ini cukup
 * dibuktikan TIDAK menghalangi jalur 404/409; isinya urusan tes lain. */
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}) }));
vi.mock("@/lib/tenant-audit", () => ({ writeTenantAuditLog: vi.fn(async () => {}) }));

import { POST as payPost } from "@/app/api/tenant/billing/pay/route";
import { DELETE as invitationDelete } from "@/app/api/tenant/invitations/[id]/route";
import { GET as invitationsGet } from "@/app/api/tenant/invitations/route";

const TENANT_A = 1;
const TENANT_B = 2;
const COMPANY_A = 11; // milik tenant A — PT pemanggil
const COMPANY_B = 22; // milik tenant B — PT asing

function openOwnerSession(companyId: number | null): void {
  state.session = {
    user: { id: "1", name: "Pemilik A", email: "pemilik@tenant-a.test", companyId },
  };
  state.membership = {
    tenantId: TENANT_A,
    tenantSlug: "tenant-a",
    tenantName: "Tenant A",
    tenantStatus: "active",
    role: "owner",
  };
}

function payRequest(invoiceId: number): Request {
  return new Request("http://test.local/api/tenant/billing/pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ invoiceId, method: "virtual_account", bank: "bca" }),
  });
}

function deleteInvitation(id: string): Promise<Response> {
  return invitationDelete(
    new Request(`http://test.local/api/tenant/invitations/${id}`, { method: "DELETE" }),
    { params: Promise.resolve({ id }) }
  );
}

/** Bukti anti-enumerasi: dua respons tak boleh bisa dibedakan sedikit pun. */
async function expectIdenticalResponses(a: Response, b: Response, status: number): Promise<void> {
  expect(a.status).toBe(status);
  expect(b.status).toBe(status);
  expect(await a.clone().text()).toBe(await b.clone().text());
}

beforeEach(() => {
  process.env.PAYMENT_GATEWAY = "manual";
  state.session = null;
  state.membership = null;
  state.payments = [];
  state.companies = new Map([
    [
      COMPANY_A,
      { slug: "pt-a", name: "PT A", databaseName: "sai_a", isActive: true, tenantId: TENANT_A },
    ],
    [
      COMPANY_B,
      { slug: "pt-b", name: "PT B", databaseName: "sai_b", isActive: true, tenantId: TENANT_B },
    ],
  ]);
  state.platformInvoices = [
    { id: 501, tenantId: TENANT_A, number: "PINV-S1-20260801", status: "issued", total: "277500.00" },
    { id: 502, tenantId: TENANT_B, number: "PINV-S2-20260801", status: "issued", total: "277500.00" },
    { id: 503, tenantId: TENANT_A, number: "PINV-S1-20260701", status: "paid", total: "277500.00" },
  ];
  state.invitations = [
    { id: 71, companyId: COMPANY_A, usedAt: null },
    { id: 72, companyId: COMPANY_B, usedAt: null },
  ];
});

describe("tagihan platform — POST /api/tenant/billing/pay", () => {
  it("tagihan tenant LAIN → 404 yang IDENTIK dengan id yang tidak pernah ada", async () => {
    openOwnerSession(COMPANY_A);
    const foreign = await payPost(payRequest(502)); // milik tenant B, benar-benar ada
    openOwnerSession(COMPANY_A);
    const ghost = await payPost(payRequest(999)); // tidak pernah ada
    await expectIdenticalResponses(foreign, ghost, 404);
  });

  it("tagihan SENDIRI: ditemukan — status non-issued dijawab 409, bukan 404", async () => {
    // Pembanding yang membuat 404 di atas bermakna: kepemilikanlah yang
    // menentukan, bukan id-nya.
    openOwnerSession(COMPANY_A);
    const response = await payPost(payRequest(503));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("not_payable");
  });

  it("tagihan SENDIRI yang terbuka → instruksi bayar diberikan", async () => {
    openOwnerSession(COMPANY_A);
    const response = await payPost(payRequest(501));
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });
});

describe("undangan — DELETE /api/tenant/invitations/[id]", () => {
  it("undangan PT tenant LAIN → 404 yang IDENTIK dengan id fiktif — dan barisnya UTUH", async () => {
    openOwnerSession(COMPANY_A);
    const foreign = await deleteInvitation("72"); // milik PT B (tenant B), benar-benar ada
    openOwnerSession(COMPANY_A);
    const ghost = await deleteInvitation("999");
    await expectIdenticalResponses(foreign, ghost, 404);
    // Bukan hanya jawabannya yang benar — undangan tenant B tidak tersentuh.
    expect(state.invitations.find((r) => r.id === 72)!.usedAt).toBeNull();
  });

  it("undangan SENDIRI → dicabut (pembanding yang membuat 404 di atas bermakna)", async () => {
    openOwnerSession(COMPANY_A);
    const response = await deleteInvitation("71");
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(state.invitations.find((r) => r.id === 71)!.usedAt).not.toBeNull();
  });
});

describe("perusahaan tenant LAIN sebagai konteks sesi — jawaban SERAGAM dengan 'belum memilih PT'", () => {
  it("GET undangan dengan companyId milik tenant B ≡ tanpa perusahaan sama sekali (409 company_required)", async () => {
    // Sesi bisa menunjuk perusahaan apa pun; baris registry yang membuktikan
    // PT itu milik tenant siapa. PT asing TIDAK dijawab "bukan punyamu" —
    // kalimat itu sendiri sudah membocorkan bahwa PT-nya ada.
    openOwnerSession(COMPANY_B);
    const foreignContext = await invitationsGet();
    openOwnerSession(null);
    const noContext = await invitationsGet();
    await expectIdenticalResponses(foreignContext, noContext, 409);
    expect((await foreignContext.json()).code).toBe("company_required");
  });

  it("pembanding: PT SENDIRI sebagai konteks → daftar undangan PT itu saja", async () => {
    openOwnerSession(COMPANY_A);
    const response = await invitationsGet();
    expect(response.status).toBe(200);
    const rows = await response.json();
    expect(rows.map((r: { id: number }) => r.id)).toEqual([71]);
  });
});
