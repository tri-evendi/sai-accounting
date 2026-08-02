import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import type { Permission } from "@/lib/authz";
import { canEffective, isModuleActiveFor } from "@/lib/authz-effective";
import { moduleForPermission } from "@/lib/business-modules";
import { companyScopeFromHeaders } from "@/lib/company-scope";
import { enterCompanyFromSession } from "@/lib/company-session";
import { enterCompanyFromRoute } from "@/lib/company-route";
import { isWritePermission, readOnlyRefusal } from "@/lib/subscription-lifecycle";
import { tenantStateForCompany } from "@/lib/tenant-state";
import type { TenantScopedParams } from "@/lib/tenant-routes";

type AuthResult =
  | {
      authorized: true;
      session: {
        user: {
          id: string;
          /** Peran DI PERUSAHAAN yang sedang dibuka — dijamin ada di cabang ini. */
          role: string;
          name: string;
          email: string;
          mustChangePassword: boolean;
        };
      };
      /** Perusahaan yang konteksnya sudah ditanam untuk permintaan ini (#104). */
      companyId: number;
    }
  | { authorized: false; response: NextResponse };

/**
 * Parameter jalur untuk route yang perusahaannya ada di ALAMATNYA sendiri
 * (issue #158) — cerminan `PageRouteParams` di `page-auth.ts`.
 *
 * Dipakai HANYA oleh route di bawah `/api/t/[tenantSlug]/[companySlug]/…`,
 * yaitu unduhan yang dibuka di tab baru: sebuah `<a href download>` tidak
 * melewati `apiFetch()`, jadi tidak ada tempat menyisipkan header. Untuk
 * segalanya yang lain header-lah bentuknya, dan route-nya tidak perlu tahu
 * apa-apa tentang ini.
 */
export type ApiRouteParams =
  | TenantScopedParams
  | Promise<TenantScopedParams>
  | Promise<TenantScopedParams & Record<string, unknown>>;

/**
 * Argumen KEDUA sebuah handler route Next di bawah `/api/t/…` — dituliskan
 * sekali di sini supaya bentuknya tidak ditebak ulang di setiap route.
 */
export interface TenantApiContext {
  params: Promise<TenantScopedParams>;
}

/**
 * SATU jawaban untuk SEMUA kegagalan penyelesaian perusahaan (issue #158).
 *
 * Slug yang tidak pernah ada, PT nonaktif, bukan anggota, dan PT milik tenant
 * LAIN dijawab byte demi byte sama. 403 mengakui "ini ada, tapi bukan hakmu" —
 * dan pengakuan itu sendiri sudah kebocoran: seseorang bisa memetakan pelanggan
 * lain hanya dari selisih 403 dan 404 (§4.4 docs/MULTI-TENANT.md). Sengaja
 * TIDAK diterjemahkan, sama seperti "Unauthorized"/"Forbidden" di berkas ini:
 * jawaban yang panjangnya berubah menurut bahasa adalah jawaban yang bisa
 * dibedakan tanpa dibaca.
 */
function notFoundResponse(): NextResponse {
  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}

/**
 * Lingkup perusahaan yang DIBAWA permintaan ini, atau `null`.
 *
 * `headers()` MELEMPAR di luar lingkup permintaan (skrip, cron, tes unit yang
 * memanggil penjaga langsung). Itu bukan kegagalan melainkan jawaban: di sana
 * memang tidak ada permintaan yang bisa membawa lingkup, dan pemanggilnya
 * ditolak beberapa baris di bawah — bukan diberi perusahaan tebakan.
 */
async function companyScopeFromRequest(): Promise<TenantScopedParams | null> {
  try {
    const requestHeaders = await headers();
    return companyScopeFromHeaders((name) => requestHeaders.get(name));
  } catch {
    return null;
  }
}

/**
 * SATU-SATUNYA penjaga API route (audit RBAC fase 1–4; lihat docs/RBAC.md).
 * Route mendeklarasikan IZINNYA; matriks bawaan hidup di `lib/authz.ts` dan
 * sejak issue #73 dicek terhadap matriks EFEKTIF (bawaan + override DB,
 * `lib/authz-effective.ts`). Tanpa sesi → 401; tanpa izin → 403. Sengaja
 * TANPA lapisan Mode Akuntan — mode adalah preferensi tampilan, otorisasi
 * API murni peran. Cakupan pemakaian dijaga `tests/authz-coverage.test.ts`.
 * (Pendahulunya, `requireAuth([peran])`, dihapus di fase 4.)
 *
 * ══ PERUSAHAAN DATANG DARI PERMINTAAN, DIVALIDASI SETIAP KALI (issue #158) ══
 * Sampai #158, perusahaan diambil dari SESI — satu cookie untuk seluruh tab.
 * Halaman `/t/acme/cv-maju/invoices` karenanya bisa menampilkan buku CV Maju
 * sambil menyimpan ke PT yang terakhir dibuka di tab sebelah. Sekarang lingkup
 * dibawa permintaan (header `x-tenant-slug`/`x-company-slug` dari `apiFetch()`,
 * atau jalur untuk route `/api/t/…`), dan penjaga MEMVALIDASI-nya:
 * keanggotaan pemanggil di perusahaan itu dibaca ulang ke basis data kendali
 * pada permintaan ini juga. Header adalah masukan pengguna dan diperlakukan
 * sebagai masukan pengguna.
 *
 * Peran pun diambil dari keanggotaan yang baru dibaca, BUKAN dari JWT: JWT
 * menyimpan peran di perusahaan yang terakhir dibuka, dan memakainya di sini
 * berarti memberi hak PT A di buku PT B.
 */
export async function requireApiPermission(
  permission: Permission,
  route?: ApiRouteParams
): Promise<AuthResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const scope = route ? await route : await companyScopeFromRequest();

  if (scope) {
    const scoped = await enterCompanyFromRoute({
      tenantSlug: scope.tenantSlug,
      companySlug: scope.companySlug,
      userId: session.user.id,
    });
    if (!scoped.ok) {
      if (scoped.reason === "no-session") {
        return {
          authorized: false,
          response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
      }
      return { authorized: false, response: notFoundResponse() };
    }

    /*
     * Sesi DITIMPA oleh kebenaran permintaan — di memori, untuk permintaan ini
     * saja. Cerminan langkah yang sama di `page-auth.ts`; tanpa ini
     * `canEffective` di bawah akan menilai dengan peran di PT yang salah.
     */
    const scopedSession = {
      ...session,
      user: { ...session.user, role: scoped.role, companyId: scoped.companyId },
    };

    return gateAfterCompany(scopedSession, permission, scoped.companyId);
  }

  /*
   * ══ JALUR LAMA — SEMENTARA (issue #158, dihapus di batch terakhir) ════════
   * Selama pemanggil belum semuanya memakai `apiFetch()`, permintaan tanpa
   * lingkup masih dilayani dari sesi. Cabang ini ADALAH bahaya yang issue ini
   * hapus; ia berumur satu migrasi, bukan satu rilis.
   */
  const company = await enterCompanyFromSession(session);
  if (!company.ok) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error:
            company.reason === "no-company"
              ? "Pilih perusahaan terlebih dahulu."
              : "Perusahaan yang Anda buka tidak tersedia lagi.",
          code: company.reason === "no-company" ? "company_required" : "company_unavailable",
        },
        { status: 409 }
      ),
    };
  }

  return gateAfterCompany(session, permission, company.companyId);
}

/**
 * Gerbang-gerbang SESUDAH perusahaan diketahui — satu untuk kedua jalan masuk.
 *
 * Dipisah bukan untuk kerapian melainkan supaya kedua jalur (permintaan & sesi)
 * tidak bisa menyimpang: satu gerbang yang lupa disalin ke jalur baru adalah
 * persis bentuk lubang yang lahir dari migrasi bertahap.
 */
async function gateAfterCompany(
  session: { user: NonNullable<Session["user"]> },
  permission: Permission,
  companyId: number
): Promise<AuthResult> {
  /*
   * Gerbang MODUL (issue #99). Menyembunyikan menu saja tidak pernah dianggap
   * pengamanan — route-nya ikut tertutup, kalau tidak fitur yang "dimatikan"
   * masih bisa dipanggil langsung dan tetap membuat transaksi baru.
   *
   * Tetap 403 (bukan 404): permintaannya sah dan pemanggilnya terautentikasi,
   * hanya fiturnya yang tidak aktif. `code` membedakannya dari penolakan peran,
   * supaya klien bisa menampilkan kalimat yang benar.
   */
  if (!(await isModuleActiveFor(permission))) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: "Fitur ini belum aktif untuk perusahaan Anda.",
          code: "module_inactive",
          module: moduleForPermission(permission),
        },
        { status: 403 }
      ),
    };
  }

  if (!(await canEffective(session.user, permission))) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  /*
   * Gerbang HANYA-BACA saat langganan ditangguhkan (issue #140).
   *
   * `suspended`/`cancelled` menolak setiap izin TULIS — di PENJAGA, bukan
   * disembunyikan di UI — sementara baca & ekspor tetap jalan: pelanggan yang
   * menunggak tetap wajib (secara hukum) bisa membaca dan mengunduh bukunya.
   * Statusnya dibaca dari basis data KENDALI lewat cache per-perusahaan
   * (`tenant-state.ts`) — TIDAK PERNAH dari `sai_platform` di jalur ini
   * (penagihan mati ≠ login mati, doktrin #137). Izin baca dilewatkan tanpa
   * query tambahan sama sekali.
   */
  if (isWritePermission(permission)) {
    const tenantState = await tenantStateForCompany(companyId);
    const refusal = readOnlyRefusal(tenantState?.status, permission);
    if (refusal) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: refusal.message, code: refusal.code },
          { status: 403 }
        ),
      };
    }
  }

  return { authorized: true, session, companyId } as AuthResult;
}
