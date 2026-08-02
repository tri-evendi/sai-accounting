import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import { ACCOUNTING_PERMISSIONS, type Permission } from "@/lib/authz";
import { canEffective, isModuleActiveFor } from "@/lib/authz-effective";
import { moduleForPermission } from "@/lib/business-modules";
import { effectiveAccountantMode, type AccountantModeUser } from "@/lib/accountant-mode";
import { isSetupDone } from "@/lib/setup-gate";
import { enterCompanyFromSession } from "@/lib/company-session";
import { isWritePermission, readOnlyRefusal } from "@/lib/subscription-lifecycle";
import { tenantStateForCompany } from "@/lib/tenant-state";
import { resolvePostLoginPath } from "@/lib/post-login";
import { redirect } from "next/navigation";

/**
 * SATU-SATUNYA penjaga halaman dashboard (audit RBAC fase 1–4; lihat
 * docs/RBAC.md). Halaman mendeklarasikan IZINNYA; matriks izin→peran bawaan
 * hidup di `lib/authz.ts` dan sejak issue #73 dicek terhadap matriks EFEKTIF
 * (bawaan + override DB, `lib/authz-effective.ts`). Tanpa sesi → /login;
 * tanpa izin → /dashboard. Izin permukaan akuntansi
 * (`ACCOUNTING_PERMISSIONS`) otomatis berlapis Mode Akuntan (issue #11): peran
 * berakses penuh yang mematikan modenya ikut ditolak, sama seperti menunya yang ikut
 * tersembunyi. Cakupan pemakaian dijaga `tests/authz-coverage.test.ts` —
 * halaman tanpa deklarasi = tes merah. (Pendahulunya,
 * `requirePageSession`/`requireAccountantPage` berbasis daftar peran,
 * dihapus di fase 4.)
 */
/** Sesi yang sudah melewati penjaga: perusahaan aktif, dan peran DI perusahaan itu. */
export type PageSession = Omit<Session, "user"> & {
  user: NonNullable<Session["user"]> & { role: string };
};

export async function requirePagePermission(permission: Permission): Promise<PageSession> {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  /*
   * Konteks perusahaan (issue #104) — DI SINI, sebelum gerbang mana pun.
   *
   * Tanpa ini setiap query di halaman akan melempar: sejak buku besar menjadi
   * satu basis data per PT, `prisma` menolak menebak perusahaan mana yang
   * dimaksud. Ketiga kegagalannya dibedakan dengan sengaja — orang yang belum
   * MEMILIH perusahaan tidak sedang punya masalah kredensial, jadi ia tidak
   * dilempar ke halaman masuk untuk mengetik ulang kata sandinya.
   */
  const company = await enterCompanyFromSession(session);
  if (!company.ok) {
    if (company.reason === "no-session") redirect("/login");
    /*
     * Tanpa perusahaan aktif, arahnya SATU aturan dengan pasca-masuk (#159
     * temuan 3): NOL perusahaan → /companies/new (pelanggan baru yang belum
     * membuat PT pertamanya), selainnya → /select-company. Dulu keduanya
     * dipukul rata ke /select-company; dan karena arah baru datang dari
     * server, halaman tidak lagi menjawab 200 berisi kerangka "Memuat sesi…"
     * yang menunggu klien menemukan arahnya sendiri.
     */
    redirect(
      resolvePostLoginPath(
        session.user.mustChangePassword,
        null,
        session.user.companyCount,
        null
      )
    );
  }

  /*
   * Gerbang "belum disiapkan" (lihat lib/setup-gate.ts).
   *
   * Diperiksa SEBELUM izin halaman, bukan sesudah: pada pemasangan baru, peran
   * berakses penuh membuka /dashboard dan izinnya memang lolos — kalau
   * urutannya dibalik,
   * gerbang ini tidak akan pernah berbunyi di halaman yang paling mungkin
   * dibuka pertama.
   *
   * Halaman ber-izin `setup.manage` DIKECUALIKAN, kalau tidak wizard-nya
   * sendiri akan memantul tanpa henti ke dirinya sendiri.
   *
   * Yang tidak berhak menjalankan wizard tidak dilempar ke /setup (di sana
   * mereka hanya akan ditolak izin), melainkan ke layar penjelasan.
   */
  if (permission !== "setup.manage" && !(await isSetupDone())) {
    redirect(
      (await canEffective(session.user, "setup.manage")) ? "/setup" : "/setup-required"
    );
  }

  /*
   * Gerbang MODUL (issue #99) — dan kenapa ia punya tujuan sendiri.
   *
   * `canEffective` sudah menolak izin di modul non-aktif, jadi tanpa cabang ini
   * pun halaman tetap tertutup. Yang dibedakan di sini adalah KALIMATNYA:
   * "Anda tidak punya akses" (urusan peran, minta ke atasan) dan "fitur ini
   * belum aktif untuk perusahaan Anda" (urusan konfigurasi, ada di Pengaturan)
   * adalah dua keadaan berbeda, dan melemparkan keduanya ke /dashboard tanpa
   * penjelasan membuat pengguna mengejar orang yang salah.
   */
  if (!(await isModuleActiveFor(permission))) {
    redirect(`/feature-inactive?module=${moduleForPermission(permission)}`);
  }

  if (!(await canEffective(session.user, permission))) {
    redirect("/dashboard");
  }

  if (ACCOUNTING_PERMISSIONS.has(permission) && !effectiveAccountantMode(session.user)) {
    redirect("/dashboard");
  }

  /*
   * Gerbang HANYA-BACA saat langganan ditangguhkan (issue #140) — cerminan
   * gerbang yang sama di `auth-guard.ts`: halaman ber-izin TULIS dipantulkan
   * ke beranda selama tenant `suspended`/`cancelled`; halaman baca & ekspor
   * tetap terbuka (kewajiban retensi pelanggan tidak boleh terhalang tagihan).
   * Status dari basis data KENDALI (cache per-perusahaan) — bukan platform.
   */
  if (isWritePermission(permission)) {
    const tenantState = await tenantStateForCompany(company.companyId);
    if (readOnlyRefusal(tenantState?.status, permission)) {
      redirect("/dashboard");
    }
  }

  /*
   * `role` dipersempit menjadi `string` (bukan `string | null`) di sini, dan
   * itu bukan penghalusan tipe belaka: begitu konteks perusahaan berhasil
   * ditanam, peran PASTI ada — ia datang dari keanggotaan di perusahaan itu.
   * Sesi tanpa peran sudah dipantulkan ke /select-company di atas.
   */
  return session as PageSession;
}

/**
 * Apakah tautan ke halaman ber-izin `permission` akan benar-benar TERBUKA untuk
 * pengguna ini? (issue #103)
 *
 * Cerminan `requirePagePermission` tanpa efek samping: syaratnya sama persis —
 * modul aktif (sudah termasuk di `canEffective`), izin efektif, dan Mode Akuntan
 * untuk izin permukaan akuntansi. Bila jawabannya `false`, menekan tautan itu
 * hanya menghasilkan pantulan.
 *
 * Dipakai empty state yang MENAWARKAN AKSI. Sejak modul ada, "Belum ada faktur.
 * Buat tagihan pertama →" bukan sekadar kurang rapi ketika modul `sales` mati —
 * ia KELIRU, dan menekannya membuang pengguna ke layar "fitur belum aktif" yang
 * terbaca seolah dia yang salah. Pesan kosongnya tetap benar; yang harus hilang
 * hanyalah ajakan yang tidak bisa dipenuhi.
 *
 * Sengaja menerima `user` sebagai argumen alih-alih memanggil `auth()` sendiri:
 * pemakainya halaman yang sesinya sudah di tangan, dan satu empty state tidak
 * layak membayar pembacaan sesi kedua.
 */
export async function canOpenPage(
  user: (AccountantModeUser & { id?: string | number | null }) | null | undefined,
  permission: Permission
): Promise<boolean> {
  if (!user) return false;
  if (!(await canEffective(user, permission))) return false;
  if (ACCOUNTING_PERMISSIONS.has(permission) && !effectiveAccountantMode(user)) return false;
  return true;
}
