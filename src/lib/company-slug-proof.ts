/**
 * Inti MURNI pembuktian lingkup slug perusahaan (issue #153) — tanpa Prisma,
 * tanpa environment, supaya bisa diuji tanpa basis data.
 *
 * Dipakai `scripts/prove-company-slug-scope.ts`, yang berdiri di antara
 * migration 0008 (indeks komposit `(tenant_id, slug)` berdampingan dengan
 * keunikan global lama) dan 0009 (membuang yang global): 0009 TIDAK BOLEH
 * diterapkan sebelum fungsi ini pulang tanpa cacat. Pola yang sama dengan
 * `prove-tenant-adoption` di #134 — pembuktiannya terpisah dari kode yang
 * melakukan pekerjaannya.
 *
 * Perbandingan slug dan nama basis data memakai huruf kecil: kolomnya
 * berkolasi `utf8mb4_unicode_ci`, jadi itulah perbandingan yang akan
 * ditegakkan indeks-indeks uniknya.
 */

export interface CompanyRegistryRow {
  id: number;
  slug: string;
  databaseName: string;
  tenantId: number | null;
}

/** Daftar cacat, kosong bila bersih. Setiap cacat MENYEBUT barisnya. */
export function proveCompanySlugScope(companies: ReadonlyArray<CompanyRegistryRow>): string[] {
  const failures: string[] = [];

  // 1. Setiap perusahaan ber-tenant — indeks komposit tidak menjaga baris
  //    ber-tenant NULL (MySQL meloloskan NULL kembar), jadi ini diperiksa
  //    eksplisit; sejak migration 0003 basis data memang menolak NULL.
  for (const c of companies) {
    if (c.tenantId === null) {
      failures.push(`companies.tenant_id kosong: "${c.slug}" (perusahaan #${c.id})`);
    }
  }

  // 2. Tidak ada (tenant_id, slug) kembar — inilah yang akan ditegakkan
  //    `companies_tenant_id_slug_key` bagi penyediaan berikutnya.
  const bySlugInTenant = new Map<string, CompanyRegistryRow>();
  for (const c of companies) {
    if (c.tenantId === null) continue;
    const key = `${c.tenantId} ${c.slug.toLowerCase()}`;
    const first = bySlugInTenant.get(key);
    if (first) {
      failures.push(
        `slug "${c.slug}" kembar di tenant ${c.tenantId}: ` +
          `perusahaan #${first.id} dan #${c.id}`
      );
    } else {
      bySlugInTenant.set(key, c);
    }
  }

  // 3. Tidak ada database_name kembar — keunikan global ini TETAP berdiri
  //    setelah 0009 (ruang nama fisik server); kembar di sini berarti dua
  //    baris registry menunjuk buku yang sama, dan itu cacat data yang harus
  //    dibereskan sebelum menyentuh indeks mana pun.
  const byDatabase = new Map<string, CompanyRegistryRow>();
  for (const c of companies) {
    const key = c.databaseName.toLowerCase();
    const first = byDatabase.get(key);
    if (first) {
      failures.push(
        `database_name "${c.databaseName}" kembar: ` +
          `perusahaan #${first.id} ("${first.slug}") dan #${c.id} ("${c.slug}")`
      );
    } else {
      byDatabase.set(key, c);
    }
  }

  return failures;
}
