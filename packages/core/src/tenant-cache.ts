/**
 * Cache TTL yang DIKUNCI PER TENANT (issue #137) — aturan cache #104 diperluas.
 *
 * Latar aturannya: satu proses melayani banyak perusahaan — dan kelak banyak
 * tenant — bergantian. Cache tingkat modul yang isinya milik satu pihak akan
 * dipakai untuk pihak lain selama satu TTL: querynya tetap ke baris yang benar,
 * tapi KEPUTUSANNYA salah, dan itu tidak meninggalkan galat apa pun
 * (docs/MULTI-COMPANY.md §2). Untuk data perusahaan kuncinya `companyId`
 * (lihat `authz-effective.ts`); untuk data platform — status langganan, paket,
 * pemakaian — kuncinya WAJIB `tenantId`.
 *
 * Setiap cache tingkat modul yang menyimpan data platform harus memakai kelas
 * ini (atau pola setara yang kuncinya tenant). Cache tanpa kunci tenant untuk
 * data platform adalah bug walau seluruh tesnya hijau.
 */

type Entry<T> = {
  value: T;
  expiresAt: number;
};

export class TenantKeyedCache<T> {
  private readonly entries = new Map<number, Entry<T>>();

  constructor(private readonly ttlMs: number) {}

  /** Nilai milik tenant ini, atau `undefined` bila belum ada / sudah basi. */
  get(tenantId: number): T | undefined {
    const entry = this.entries.get(tenantId);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(tenantId);
      return undefined;
    }
    return entry.value;
  }

  set(tenantId: number, value: T): void {
    this.entries.set(tenantId, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /**
   * Buang cache SATU tenant — dipanggil saat data platformnya berubah
   * (ganti paket, pembayaran masuk, suspensi). Perubahan terasa seketika di
   * proses ini; di proses lain paling lama satu TTL — kompromi yang sama
   * dengan cache otorisasi #104.
   */
  invalidate(tenantId: number): void {
    this.entries.delete(tenantId);
  }

  /** Buang semuanya — untuk tes dan keadaan luar biasa. */
  clear(): void {
    this.entries.clear();
  }
}
