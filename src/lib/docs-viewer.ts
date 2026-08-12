/**
 * SIAPA yang sedang membaca `/docs` — dijawab "kalau ada", tidak pernah
 * "harus ada".
 *
 * ══ INI BUKAN PENJAGA, DAN PERBEDAANNYA ADALAH SELURUH ISI BERKAS INI ══════
 * Penjaga (`requirePagePermission`, `requireTenantPagePermission`) menjawab
 * "boleh atau tidak" dan MEMANTULKAN yang tidak boleh. Fungsi di bawah tidak
 * pernah memantulkan, tidak pernah melempar, dan tidak pernah menuntut apa pun:
 * jawabannya `null` berarti "gambar kulit publik", bukan "tolak pembacanya".
 *
 * Itu syarat mati. Sebagian pertanyaan yang paling sering ditanyakan lahir
 * persis ketika orang TIDAK BISA masuk ("paket mana yang punya multi-PT",
 * "kenapa akun saya ditolak"); sebuah penjaga di sini akan memantulkan justru
 * pembaca yang halamannya dibuat untuknya, dan pantulan itu terlihat seperti
 * halaman yang bekerja.
 *
 * ══ KENAPA SATU QUERY KENDALI, DAN KENAPA ITU BUKAN PELANGGARAN ════════════
 * Kulit aplikasi butuh NAMA tenant sebagai orientasi "akun siapa"; sesi hanya
 * membawa slug-nya. Sumbernya `tenantMembershipForUser` — basis data KENDALI,
 * bukan basis data perusahaan — jadi ia tidak menyentuh konteks perusahaan sama
 * sekali dan tetap benar untuk pemilik tenant tanpa satu pun PT. Ini query yang
 * sama persis yang dilakukan `(tenant)/(panel)/layout.tsx` dan
 * `(setup)/layout.tsx` pada setiap permintaannya.
 *
 * Ongkosnya dibayar HANYA oleh pembaca yang bersesi: tanpa cookie sesi,
 * `auth()` menjawab `null` dan tidak ada satu pun query yang berjalan.
 *
 * ══ KENAPA SELURUHNYA DIBUNGKUS `try` ══════════════════════════════════════
 * Chrome adalah hiasan; prosa adalah halamannya. Basis data kendali yang
 * sedang tidak bisa dihubungi harus berarti "dokumentasi tampil tanpa menu
 * samping", bukan "dokumentasi menjawab 500" — dan 500 itu akan mendarat pada
 * halaman PUBLIK yang bahkan tidak butuh basis data untuk merender isinya.
 * Yang ditelan di sini terbatas pada satu keputusan tampilan; tidak ada satu
 * pun keputusan otorisasi yang lewat berkas ini.
 */

import "server-only";

import { auth } from "@/lib/auth";
import type { PembacaDokumentasi } from "@/lib/docs-chrome";
import { tenantMembershipForUser } from "@/lib/tenant-directory";

/** `session.user.id` adalah string di NextAuth; kolom `users.id` Int. */
function idPengguna(id: unknown): number | null {
  if (typeof id === "string" && /^\d+$/.test(id)) return Number.parseInt(id, 10);
  if (typeof id === "number" && Number.isInteger(id)) return id;
  return null;
}

export async function pembacaDokumentasi(): Promise<PembacaDokumentasi | null> {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user) return null;

    const userId = idPengguna(user.id);
    const keanggotaan = userId === null ? null : await tenantMembershipForUser(userId);
    /* Keadaan ke-4 (lihat `lib/docs-chrome.tsx`): bersesi tanpa keanggotaan
       tenant. Menebak nama tenant berarti memajang nama yang salah di bilah
       atas, jadi kulit publik yang benar. */
    if (!keanggotaan) return null;

    return {
      tenantName: keanggotaan.tenantName,
      tenantRole: keanggotaan.role,
      userName: user.name ?? "",
      /*
       * Slug perusahaan datang dari SESI, dan di sini itu memang benar: yang
       * dirakit darinya bukan keputusan otorisasi melainkan sebuah TAUTAN
       * pulang. Halaman tujuannya memverifikasi keanggotaan sendiri pada
       * permintaan berikutnya (dan melewati gerbang kunci buku), jadi tautan
       * yang basi berujung pada penolakan di sana — bukan pada buku yang salah
       * terbuka di sini.
       */
      buku:
        user.tenantSlug && user.companySlug
          ? { tenantSlug: user.tenantSlug, companySlug: user.companySlug }
          : null,
    };
  } catch {
    return null;
  }
}
