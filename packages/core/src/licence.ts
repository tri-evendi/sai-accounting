/**
 * ARTEFAK LISENSI (celah on-premise #2) — Ed25519, diverifikasi OFFLINE.
 *
 * Satu berkas yang ditandatangani SAI dan dibaca di mesin customer tanpa
 * jaringan sama sekali. Tidak ada server aktivasi, tidak ada panggilan balik,
 * tidak ada apa pun yang bisa gagal di luar mesin itu.
 *
 * ══ YANG PALING PENTING: LISENSI TIDAK PERNAH MEMATIKAN APLIKASI ═══════════
 * `supportEndsAt` yang lewat berarti **dukungan dan pembaruan** berakhir —
 * bukan pembukuan berhenti. Produk akuntansi yang berhenti membuka buku pada
 * tanggal tertentu adalah kesalahan kategori: datanya milik customer, catatan
 * pajaknya wajib disimpan bertahun-tahun, dan "bayar atau kehilangan akses ke
 * pembukuanmu sendiri" bukan hubungan dagang yang pantas ditawarkan. Karena itu
 * verifikasi mengembalikan `supportExpired` sebagai FAKTA yang dilaporkan, dan
 * tidak satu pun fungsi di sini yang bisa dipakai memblokir pemakaian.
 *
 * ══ KUNCI PUBLIK DITANAM DI KODE, BUKAN DIBACA DARI ENV ════════════════════
 * Ini keputusan yang paling mudah salah. Kunci publik yang dibaca dari env
 * berarti siapa pun yang bisa menyetel env di mesin itu bisa menukarnya dengan
 * kunci miliknya sendiri, lalu menandatangani lisensinya sendiri — dan seluruh
 * tanda tangan jadi hiasan. Kunci publik bukan rahasia, jadi menanamnya tidak
 * membocorkan apa pun; ia justru harus SULIT ditukar.
 *
 * Fungsi di sini menerima kunci sebagai argumen OPSIONAL semata-mata supaya tes
 * bisa memakai pasangan kunci sendiri. Kode produksi memanggilnya tanpa argumen.
 *
 * ══ KUNCI PRIVATNYA TIDAK PERNAH ADA DI REPO MAUPUN DI CI ══════════════════
 * Penandatangan (`scripts/licence-issue.ts`) membaca kunci privat dari berkas
 * yang jalurnya diberikan saat dipakai. Ia TIDAK dibaca dari secret CI, dan itu
 * disengaja: kunci penanda lisensi di CI berarti siapa pun yang bisa memicu
 * satu workflow bisa mencetak lisensi — termasuk lisensi tak terbatas untuk
 * dirinya sendiri. Penerbitan lisensi adalah pekerjaan manusia yang jarang,
 * jadi ia tidak perlu otomatis, dan yang jarang tapi berbahaya memang tidak
 * boleh otomatis.
 *
 * ══ FORMAT: DUA BAGIAN, TANPA KOLOM ALGORITMA ══════════════════════════════
 *   <base64url(payload JSON)>.<base64url(signature)>
 *
 * Sengaja BUKAN JWT. JWT membawa `alg` di dalam pesan yang belum terverifikasi,
 * dan sejarahnya panjang: `alg: none`, atau menukar algoritma asimetris dengan
 * HMAC yang kuncinya justru kunci publik. Di sini algoritmanya tidak dapat
 * dinegosiasikan — ia tertulis di kode, titik.
 */

import { createPublicKey, verify as verifySignature } from "node:crypto";

/**
 * Kunci publik penanda lisensi SAI (Ed25519, SPKI/PEM).
 *
 * ⚠ PLACEHOLDER sampai pasangan kunci produksi dibuat di mesin luring dan
 * kunci publiknya ditempel di sini — lihat `scripts/licence-keygen.ts`. Selama
 * nilainya masih placeholder, `verifyLicence` MENOLAK setiap berkas dengan
 * alasan yang jelas; ia tidak pernah menerima apa pun "sementara".
 */
export const LICENCE_PUBLIC_KEY_PEM = "BELUM-DISETEL";

/** Modul yang diizinkan: `"all"` atau daftar kunci modul usaha. */
export type LicenceModules = "all" | readonly string[];

export interface Licence {
  /** Pengenal lisensi — dicetak di bundel diagnostik & dukungan. */
  licenceId: string;
  /** Nama customer, apa adanya untuk dipajang. */
  customer: string;
  /** ISO-8601. */
  issuedAt: string;
  /**
   * ISO-8601 atau `null` untuk dukungan tanpa batas waktu. Lewatnya tanggal ini
   * TIDAK mematikan apa pun — lihat kepala berkas.
   */
  supportEndsAt: string | null;
  maxCompanies: number;
  maxUsers: number;
  modules: LicenceModules;
  /**
   * Versi aplikasi tertinggi yang dicakup lisensi ini (semver), atau `null`.
   * Dipakai saat MEMUTUSKAN memasang pembaruan, bukan saat menjalankan yang
   * sudah terpasang.
   */
  maxVersion: string | null;
}

export type LicenceVerdict =
  | { ok: true; licence: Licence; supportExpired: boolean }
  | { ok: false; reason: string };

const b64urlToBuf = (s: string): Buffer => Buffer.from(s, "base64url");

/** Pemeriksaan bentuk payload — berkas tepercaya pun bisa salah terbit. */
function parsePayload(raw: unknown): Licence | string {
  if (typeof raw !== "object" || raw === null) return "payload bukan objek";
  const p = raw as Record<string, unknown>;

  const teks = (k: string): string | null =>
    typeof p[k] === "string" && (p[k] as string).trim() !== "" ? (p[k] as string) : null;
  const angka = (k: string): number | null =>
    typeof p[k] === "number" && Number.isInteger(p[k]) && (p[k] as number) >= 0
      ? (p[k] as number)
      : null;

  const licenceId = teks("licenceId");
  const customer = teks("customer");
  const issuedAt = teks("issuedAt");
  if (!licenceId) return "`licenceId` kosong";
  if (!customer) return "`customer` kosong";
  if (!issuedAt || Number.isNaN(Date.parse(issuedAt))) return "`issuedAt` bukan tanggal ISO";

  const maxCompanies = angka("maxCompanies");
  const maxUsers = angka("maxUsers");
  if (maxCompanies === null) return "`maxCompanies` bukan bilangan bulat ≥ 0";
  if (maxUsers === null) return "`maxUsers` bukan bilangan bulat ≥ 0";

  const supportEndsAt =
    p.supportEndsAt === null
      ? null
      : typeof p.supportEndsAt === "string" && !Number.isNaN(Date.parse(p.supportEndsAt))
        ? p.supportEndsAt
        : undefined;
  if (supportEndsAt === undefined) return "`supportEndsAt` bukan tanggal ISO maupun null";

  const maxVersion =
    p.maxVersion === null ? null : typeof p.maxVersion === "string" ? p.maxVersion : undefined;
  if (maxVersion === undefined) return "`maxVersion` bukan string maupun null";

  let modules: LicenceModules;
  if (p.modules === "all") {
    modules = "all";
  } else if (
    Array.isArray(p.modules) &&
    p.modules.every((m) => typeof m === "string" && m.trim() !== "")
  ) {
    /* Daftar KOSONG ditolak, dan ini bukan kerewelan: `modules: []` berarti
       lisensi yang tidak mengizinkan satu modul pun — pemasangan yang tidak
       bisa dipakai untuk apa pun. Itu hampir pasti salah terbit, dan menolaknya
       di sini jauh lebih murah daripada customer yang membuka aplikasi kosong. */
    if (p.modules.length === 0) return "`modules` daftar kosong — tidak ada yang diizinkan";
    modules = p.modules as string[];
  } else {
    return '`modules` harus "all" atau daftar kunci modul';
  }

  return { licenceId, customer, issuedAt, supportEndsAt, maxCompanies, maxUsers, modules, maxVersion };
}

/**
 * Verifikasi berkas lisensi.
 *
 * @param text isi berkas (`<payload>.<signature>`), spasi di tepi diabaikan.
 * @param publicKeyPem HANYA untuk tes. Kode produksi tidak mengisinya.
 * @param now untuk menghitung `supportExpired`; disuntik di tes.
 */
export function verifyLicence(
  text: string,
  publicKeyPem: string = LICENCE_PUBLIC_KEY_PEM,
  now: Date = new Date()
): LicenceVerdict {
  if (publicKeyPem === "BELUM-DISETEL") {
    return {
      ok: false,
      reason:
        "kunci publik lisensi belum ditanam di `packages/core/src/licence.ts` — " +
        "buat pasangan kunci dengan `bun run licence:keygen` di mesin luring, " +
        "lalu tempel kunci publiknya. Sampai itu dilakukan tidak ada lisensi yang sah.",
    };
  }

  const bagian = text.trim().split(".");
  if (bagian.length !== 2) return { ok: false, reason: "format bukan `<payload>.<signature>`" };

  const [payloadB64, sigB64] = bagian as [string, string];
  let payloadBuf: Buffer;
  let sigBuf: Buffer;
  try {
    payloadBuf = b64urlToBuf(payloadB64);
    sigBuf = b64urlToBuf(sigB64);
  } catch {
    return { ok: false, reason: "base64url tidak sah" };
  }
  if (payloadBuf.length === 0) return { ok: false, reason: "payload kosong" };

  /* Tanda tangan diperiksa SEBELUM payload diurai. Mengurai JSON yang belum
     terverifikasi lalu memakai isinya — sekalipun hanya untuk pesan galat —
     adalah cara data pihak lain mulai dipercaya sedikit demi sedikit. */
  let sah = false;
  try {
    sah = verifySignature(null, payloadBuf, createPublicKey(publicKeyPem), sigBuf);
  } catch {
    return { ok: false, reason: "kunci publik atau tanda tangan tidak dapat dibaca" };
  }
  if (!sah) return { ok: false, reason: "tanda tangan tidak cocok" };

  let mentah: unknown;
  try {
    mentah = JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return { ok: false, reason: "payload bukan JSON" };
  }

  const hasil = parsePayload(mentah);
  if (typeof hasil === "string") return { ok: false, reason: `payload tidak sah: ${hasil}` };

  const supportExpired =
    hasil.supportEndsAt !== null && Date.parse(hasil.supportEndsAt) < now.getTime();

  return { ok: true, licence: hasil, supportExpired };
}

/** Payload yang ditandatangani — dipakai penanda, dan diuji bolak-balik. */
export function licencePayloadBytes(licence: Licence): Buffer {
  /* Kunci diurut supaya byte yang ditandatangani dapat direproduksi: dua
     penerbitan dengan isi sama menghasilkan payload identik, dan selisih byte
     karena urutan kunci tidak pernah terbaca sebagai lisensi yang berbeda. */
  const urut = Object.fromEntries(
    Object.entries(licence).sort(([a], [b]) => a.localeCompare(b))
  );
  return Buffer.from(JSON.stringify(urut), "utf8");
}
