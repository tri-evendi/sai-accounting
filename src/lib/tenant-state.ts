/**
 * Status tenant untuk PENJAGA (issue #140) — jalur panas, maka dua aturan:
 *
 * 1. **Dibaca dari basis data KENDALI (`tenants`), BUKAN dari `sai_platform`.**
 *    Doktrin #137: penjaga tidak boleh menyentuh basis data penagihan —
 *    penagihan mati ≠ login mati. Status & kuota DISALIN ke `tenants` oleh
 *    mesin langganan (urutan tulis: platform dulu, kendali belakangan); yang
 *    dibaca di sini adalah salinannya.
 *
 * 2. **Cache dikunci per perusahaan** (aturan #104/#137, `TenantKeyedCache`):
 *    satu proses melayani banyak PT — dan banyak tenant — bergantian. TTL 60
 *    detik, seirama registry perusahaan & revalidasi sesi: suspensi paling
 *    lama terasa satu TTL di proses lain; di proses yang menulisnya seketika
 *    (invalidasi eksplisit).
 */

import "server-only";

import { controlDb } from "@/lib/control-db";
import { TenantKeyedCache } from "@/lib/tenant-cache";

export interface TenantState {
  tenantId: number;
  /** pending_verification | trialing | active | past_due | suspended | cancelled */
  status: string;
  planKey: string;
  maxCompanies: number;
  maxUsers: number;
  trialEndsAt: Date | null;
}

const TTL_MS = 60_000;

const globalForTenantState = globalThis as unknown as {
  tenantStateByCompany: TenantKeyedCache<TenantState | null> | undefined;
};

/** Kunci cache = companyId (permintaan datang membawa perusahaan, bukan
 *  tenant); nilainya milik tenant perusahaan itu. */
const cacheByCompany =
  globalForTenantState.tenantStateByCompany ?? new TenantKeyedCache<TenantState | null>(TTL_MS);
if (process.env.NODE_ENV !== "production") {
  globalForTenantState.tenantStateByCompany = cacheByCompany;
}

/**
 * Status tenant pemilik sebuah perusahaan. `null` = perusahaan belum bertaut
 * tenant (pemasangan di tengah adopsi #134) — pemanggil (penjaga hanya-baca)
 * memperlakukannya sebagai TIDAK ditangguhkan; gerbangnya tentang suspensi,
 * bukan tentang adopsi. `null` ikut di-cache: pemasangan pra-adopsi tidak
 * perlu membayar query ekstra di setiap permintaan.
 */
export async function tenantStateForCompany(companyId: number): Promise<TenantState | null> {
  const cached = cacheByCompany.get(companyId);
  if (cached !== undefined) return cached;

  const company = await controlDb.company.findUnique({
    where: { id: companyId },
    select: {
      tenant: {
        select: {
          id: true,
          status: true,
          planKey: true,
          maxCompanies: true,
          maxUsers: true,
          trialEndsAt: true,
        },
      },
    },
  });

  const state: TenantState | null = company?.tenant
    ? {
        tenantId: company.tenant.id,
        status: company.tenant.status,
        planKey: company.tenant.planKey,
        maxCompanies: company.tenant.maxCompanies,
        maxUsers: company.tenant.maxUsers,
        trialEndsAt: company.tenant.trialEndsAt,
      }
    : null;

  cacheByCompany.set(companyId, state);
  return state;
}

/** Buang cache SEMUA perusahaan — status tenant berubah (bayar, suspensi,
 *  ganti paket) menyentuh seluruh PT miliknya, dan pemetaan perusahaan→tenant
 *  tidak disimpan terbalik; membuang semuanya murah (isi cache ≤ jumlah PT). */
export function invalidateTenantState(): void {
  cacheByCompany.clear();
}
