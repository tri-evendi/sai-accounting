/**
 * Bentuk bersama `/api/v1/…` (issue #389, F-10 lapis 1).
 *
 * ══ KENAPA BENTUKNYA DITETAPKAN SEKARANG, SAAT BARU ADA SATU ENDPOINT ══════
 * Karena bentuk yang ditetapkan pada endpoint kelima adalah bentuk yang tidak
 * pernah berlaku untuk empat yang pertama. Sebuah API publik berbeda dari kode
 * internal dalam satu hal yang menentukan: begitu ada yang memakainya,
 * mengubahnya berarti merusak program orang lain — dan orang itu tidak membaca
 * catatan rilis kita.
 *
 * MURNI: penguraian kueri + penyusunan meta, tanpa Prisma dan tanpa I/O.
 */

/** Batas baris per permintaan. Bawaan sengaja kecil; maksimum sengaja bukan tak-hingga. */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export type ListQuery =
  | { ok: true; limit: number; offset: number; updatedSince: Date | null }
  | { ok: false; error: string };

/**
 * Baca `?limit=&offset=&updatedSince=`.
 *
 * ══ NILAI YANG SALAH DITOLAK, BUKAN DIPERBAIKI DIAM-DIAM ═══════════════════
 * `?limit=abc` menjadi 400, bukan diam-diam menjadi 50. Perbedaannya menentukan
 * bagi penulis integrasi: sebuah parameter yang salah ketik dan tetap "berhasil"
 * menghasilkan program yang tampak bekerja sambil menarik halaman yang salah
 * selama berbulan-bulan. Penolakan yang berisik adalah satu-satunya cara ia
 * mengetahuinya pada menit pertama, bukan pada rekonsiliasi pertama.
 *
 * `limit` di ATAS maksimum juga ditolak, bukan dipotong: penarik yang meminta
 * 10.000 dan menerima 200 tanpa diberi tahu akan menyimpulkan datanya memang
 * cuma 200.
 */
export function parseListQuery(request: Request): ListQuery {
  const params = new URL(request.url).searchParams;

  const rawLimit = params.get("limit");
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit)) {
      return { ok: false, error: "`limit` harus bilangan bulat positif." };
    }
    limit = Number(rawLimit);
    if (limit < 1 || limit > MAX_LIMIT) {
      return { ok: false, error: `\`limit\` harus antara 1 dan ${MAX_LIMIT}.` };
    }
  }

  const rawOffset = params.get("offset");
  let offset = 0;
  if (rawOffset !== null) {
    if (!/^\d+$/.test(rawOffset)) {
      return { ok: false, error: "`offset` harus bilangan bulat 0 atau lebih." };
    }
    offset = Number(rawOffset);
  }

  const rawSince = params.get("updatedSince");
  let updatedSince: Date | null = null;
  if (rawSince !== null) {
    const parsed = new Date(rawSince);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "`updatedSince` harus tanggal ISO-8601." };
    }
    updatedSince = parsed;
  }

  return { ok: true, limit, offset, updatedSince };
}

export interface ListMeta {
  total: number;
  limit: number;
  offset: number;
  /** `true` bila masih ada baris sesudah halaman ini. */
  hasMore: boolean;
}

/**
 * Meta yang menyertai setiap daftar.
 *
 * `hasMore` DIHITUNG di sini, tidak diserahkan ke penariknya. Membandingkan
 * `offset + limit < total` sendiri adalah tiga tempat untuk salah — dan yang
 * salah menghitungnya akan berhenti satu halaman terlalu awal, diam-diam,
 * kehilangan baris terakhir setiap kali.
 */
export function listMeta(input: { total: number; limit: number; offset: number }): ListMeta {
  return {
    total: input.total,
    limit: input.limit,
    offset: input.offset,
    hasMore: input.offset + input.limit < input.total,
  };
}
