import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import { ACCOUNTING_PERMISSIONS, type Permission } from "@/lib/authz";
import { canEffective, isModuleActiveFor } from "@/lib/authz-effective";
import { moduleForPermission } from "@/lib/business-modules";
import { effectiveAccountantMode, type AccountantModeUser } from "@/lib/accountant-mode";
import { isSetupDone } from "@/lib/setup-gate";
import { enterCompanyFromSession } from "@/lib/company-session";
import { enterCompanyFromRoute, type TenantRouteParams } from "@/lib/company-route";
import { isWritePermission, readOnlyRefusal } from "@/lib/subscription-lifecycle";
import { tenantStateForCompany } from "@/lib/tenant-state";
import { resolvePostLoginPath } from "@/lib/post-login";
import { tenantPath } from "@/lib/tenant-routes";
import { notFound, redirect } from "next/navigation";

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

/**
 * Argumen KEDUA penjaga (issue #157): parameter jalur halaman bertenant.
 *
 * Halaman di bawah `/t/[tenantSlug]/[companySlug]/…` cukup meneruskan prop
 * `params` miliknya sendiri — Next mengoper SEMUA segmen dinamis leluhur ke
 * setiap halaman di bawahnya, jadi `params` sebuah halaman `[id]` pun sudah
 * memuat kedua slug ini. Diterima dalam bentuk Promise maupun objek biasa
 * supaya penjaga tidak memaksa pemanggilnya meng-`await` lebih dulu.
 *
 * Halaman yang BELUM dimigrasikan memanggil penjaga tanpa argumen ini dan tetap
 * mengambil perusahaannya dari sesi — itulah yang membuat migrasi bisa berjalan
 * sebatch demi sebatch tanpa satu pun halaman mati di tengah jalan.
 */
export type PageRouteParams =
  | TenantRouteParams
  | Promise<TenantRouteParams>
  | Promise<{ tenantSlug: string; companySlug: string } & Record<string, unknown>>;

export async function requirePagePermission(
  permission: Permission,
  route?: PageRouteParams
): Promise<PageSession> {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  /*
   * Konteks perusahaan — DI SINI, sebelum gerbang mana pun.
   *
   * Tanpa ini setiap query di halaman akan melempar: sejak buku besar menjadi
   * satu basis data per PT, `prisma` menolak menebak perusahaan mana yang
   * dimaksud.
   *
   * DUA JALAN, dan bedanya bukan gaya (issue #157):
   *
   *   • dengan `route` — perusahaan datang dari URL dan keanggotaannya dibaca
   *     ULANG dari basis data kendali pada permintaan ini. Gagal apa pun
   *     (slug tak ada, nonaktif, bukan anggota, tenant lain) = 404 yang sama
   *     persis; lihat `company-route.ts`.
   *   • tanpa `route` — jalur lama: perusahaan dari sesi. Ketiga kegagalannya
   *     dibedakan dengan sengaja — orang yang belum MEMILIH perusahaan tidak
   *     sedang punya masalah kredensial, jadi ia tidak dilempar ke halaman
   *     masuk untuk mengetik ulang kata sandinya.
   */
  if (route) {
    const params = await route;
    const scoped = await enterCompanyFromRoute({
      tenantSlug: params.tenantSlug,
      companySlug: params.companySlug,
      userId: session.user.id,
    });
    if (!scoped.ok) {
      if (scoped.reason === "no-session") redirect("/login");
      notFound();
    }

    /*
     * Sesi DITIMPA oleh kebenaran jalur — untuk permintaan ini saja, di memori.
     *
     * Bukan kosmetik: `canEffective`, Mode Akuntan, dan seluruh tampilan di
     * bawah halaman ini membaca `session.user.role`, dan peran di JWT adalah
     * peran di perusahaan yang TERAKHIR dibuka. Membiarkannya lewat berarti
     * seorang `finance_manager` di PT A membuka buku PT B — tempat ia hanya
     * `staff` — dengan hak PT A. Cookie-nya sendiri disamakan di klien (lihat
     * `CompanySessionSync`); yang di sini menjaga render SERVER-nya benar sejak
     * milidetik pertama, tanpa menunggu sinkronisasi itu selesai.
     */
    const patched = {
      ...session,
      user: {
        ...session.user,
        role: scoped.role,
        accountantMode: scoped.accountantMode,
        companyId: scoped.companyId,
        companySlug: scoped.companySlug,
        companyName: scoped.companyName,
      },
    } as PageSession;

    return gateAfterCompany(patched, permission, scoped.companyId, {
      tenantSlug: scoped.tenantSlug,
      companySlug: scoped.companySlug,
    });
  }

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

  return gateAfterCompany(session as PageSession, permission, company.companyId, null);
}

/**
 * Gerbang-gerbang SESUDAH perusahaan diketahui — satu untuk kedua jalan masuk.
 *
 * Dipisah bukan untuk kerapian melainkan supaya kedua jalur (URL & sesi) tidak
 * bisa menyimpang: satu gerbang yang lupa disalin ke jalur baru adalah persis
 * bentuk lubang yang lahir dari migrasi bertahap.
 *
 * `home` menentukan ke mana penolakan dipantulkan. Halaman bertenant dipantulkan
 * ke berandanya SENDIRI — memantulkannya ke `/dashboard` telanjang akan
 * memindahkan orang ke perusahaan lain (yang terakhir dibuka) sebagai jawaban
 * atas "Anda tidak punya izin di sini", dan itu jauh lebih membingungkan
 * daripada penolakannya sendiri.
 */
async function gateAfterCompany(
  session: PageSession,
  permission: Permission,
  companyId: number,
  home: { tenantSlug: string; companySlug: string } | null
): Promise<PageSession> {
  const homePath = home ? tenantPath(home.tenantSlug, home.companySlug, "/dashboard") : "/dashboard";

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
    redirect(homePath);
  }

  if (ACCOUNTING_PERMISSIONS.has(permission) && !effectiveAccountantMode(session.user)) {
    redirect(homePath);
  }

  /*
   * Gerbang HANYA-BACA saat langganan ditangguhkan (issue #140) — cerminan
   * gerbang yang sama di `auth-guard.ts`: halaman ber-izin TULIS dipantulkan
   * ke beranda selama tenant `suspended`/`cancelled`; halaman baca & ekspor
   * tetap terbuka (kewajiban retensi pelanggan tidak boleh terhalang tagihan).
   * Status dari basis data KENDALI (cache per-perusahaan) — bukan platform.
   */
  if (isWritePermission(permission)) {
    const tenantState = await tenantStateForCompany(companyId);
    if (readOnlyRefusal(tenantState?.status, permission)) {
      redirect(homePath);
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
